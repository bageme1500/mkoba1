import db from '../../config/db.js';
import * as Dues from '../dues/due.model.js';
import * as Groups from '../groups/group.model.js';
import * as Users from '../users/user.model.js';
import * as Payments from '../payments/payment.model.js';
import { notFound } from '../../utils/httpError.js';
import { currentPeriod, daysBetween, today } from '../../utils/dates.js';

const sum = (rows, key) => Math.round(rows.reduce((t, r) => t + Number(r[key] || 0), 0) * 100) / 100;

// What the report shows in the "status" column.
export function statusLabel(d) {
    if (d.status === 'paid') return d.is_late ? 'Paid late' : 'Paid';
    if (d.status === 'partial') return 'Partial';
    return 'Unpaid';
}

async function loadGroup(groupId) {
    const group = await Groups.findById(groupId);
    if (!group) throw notFound('Group not found');
    return group;
}

// Money paid that is not yet applied to any month, per member.
async function creditsByMember(groupId) {
    const { rows } = await db.query(
        `SELECT p.user_id, SUM(p.amount) - COALESCE(SUM(a.allocated), 0) AS credit
         FROM payments p
         LEFT JOIN (SELECT payment_id, SUM(amount) AS allocated FROM allocations GROUP BY payment_id) a
                ON a.payment_id = p.id
         WHERE p.group_id = $1
         GROUP BY p.user_id`,
        [groupId],
    );
    return new Map(rows.map((r) => [r.user_id, Number(r.credit)]));
}

// Everyone's status for one month. period = 'YYYY-MM-01'.
export async function monthlyReport(groupId, period) {
    const group = await loadGroup(groupId);
    const dues = await Dues.listStatuses({ groupId, period });
    const rows = dues.map((d) => ({
        due_id: d.id,
        user_id: d.user_id,
        member_name: d.member_name,
        member_phone: d.member_phone,
        required_amount: d.required_amount,
        fine: d.fine,
        paid: d.paid_total,
        paid_by_deadline: d.paid_by_deadline,
        balance: d.balance,
        status: d.status,
        is_late: d.is_late,
        status_label: statusLabel(d),
        last_paid_at: d.last_paid_at,
    }));
    const count = (pred) => rows.filter(pred).length;

    return {
        group,
        period: period.slice(0, 7),
        started: rows.length > 0,
        due_date: dues[0]?.due_date ?? null,
        deadline_passed: dues[0] ? today() > dues[0].due_date : false,
        totals: {
            members: rows.length,
            expected: sum(rows, 'required_amount'),
            fines: sum(rows, 'fine'),
            collected: sum(rows, 'paid'),
            outstanding: sum(rows, 'balance'),
            paid: count((r) => r.status === 'paid' && !r.is_late),
            paid_late: count((r) => r.status === 'paid' && r.is_late),
            partial: count((r) => r.status === 'partial'),
            unpaid: count((r) => r.status === 'unpaid'),
        },
        rows,
    };
}

// Each member's 12 months in a year plus totals.
export async function yearlyReport(groupId, year) {
    const group = await loadGroup(groupId);
    const [dues, members, credits] = await Promise.all([
        Dues.listStatuses({ groupId, year }),
        Users.listUsers(groupId, { includeInactive: true }),
        creditsByMember(groupId),
    ]);

    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const byMember = new Map();
    for (const d of dues) {
        if (!byMember.has(d.user_id)) byMember.set(d.user_id, []);
        byMember.get(d.user_id).push(d);
    }

    const rows = members
        .filter((m) => byMember.has(m.id))
        .map((m) => {
            const own = byMember.get(m.id);
            const cells = Object.fromEntries(months.map((p) => [p, null]));
            for (const d of own) {
                cells[d.period] = { status: d.status, status_label: statusLabel(d), paid: d.paid_total, balance: d.balance, fine: d.fine };
            }
            return {
                user_id: m.id,
                member_name: m.name,
                active: m.active,
                months: cells,
                totals: {
                    required: sum(own, 'required_amount'),
                    fines: sum(own, 'fine'),
                    paid: sum(own, 'paid_total'),
                    balance: sum(own, 'balance'),
                    late_months: own.filter((d) => d.is_late).length,
                },
                credit: credits.get(m.id) || 0,
            };
        });

    const monthTotals = Object.fromEntries(
        months.map((p) => {
            const ds = dues.filter((d) => d.period === p);
            return [p, ds.length ? { expected: sum(ds, 'required_amount'), collected: sum(ds, 'paid_total'), outstanding: sum(ds, 'balance') } : null];
        }),
    );

    return {
        group,
        year,
        months,
        rows,
        month_totals: monthTotals,
        totals: {
            required: sum(rows.map((r) => r.totals), 'required'),
            fines: sum(rows.map((r) => r.totals), 'fines'),
            paid: sum(rows.map((r) => r.totals), 'paid'),
            balance: sum(rows.map((r) => r.totals), 'balance'),
        },
    };
}

// ---------- reminders ----------

const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    sw: ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'],
};
const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
const dmy = (iso) => iso.split('-').reverse().join('/');

// Members who still owe for the current month (and any older months), plus a
// message the leader can paste into the group's WhatsApp.
export async function reminders(groupId, { lang = 'sw', period = currentPeriod() } = {}) {
    const group = await loadGroup(groupId);
    const dues = await Dues.listStatuses({ groupId });
    const current = dues.filter((d) => d.period === period.slice(0, 7));
    const t = today();

    if (current.length === 0) {
        return { group, period: period.slice(0, 7), started: false, members: [], message: null };
    }

    const dueDate = current[0].due_date;
    const daysLeft = daysBetween(t, dueDate);
    const earlierOwed = new Map();
    for (const d of dues) {
        if (d.period < period.slice(0, 7) && d.balance > 0) {
            earlierOwed.set(d.user_id, (earlierOwed.get(d.user_id) || 0) + d.balance);
        }
    }

    const members = current
        .filter((d) => d.balance > 0)
        .map((d) => ({
            user_id: d.user_id,
            member_name: d.member_name,
            member_phone: d.member_phone,
            status: d.status,
            status_label: statusLabel(d),
            paid: d.paid_total,
            owes_this_month: d.balance,
            owes_earlier: Math.round((earlierOwed.get(d.user_id) || 0) * 100) / 100,
        }))
        .sort((a, b) => b.owes_this_month - a.owes_this_month || a.member_name.localeCompare(b.member_name));

    return {
        group,
        period: period.slice(0, 7),
        started: true,
        due_date: dueDate,
        days_left: daysLeft,
        members,
        message: buildMessage({ lang, group, period, dueDate, daysLeft, members }),
    };
}

function buildMessage({ lang, group, period, dueDate, daysLeft, members }) {
    const [y, m] = period.split('-').map(Number);
    const month = `${MONTHS[lang === 'en' ? 'en' : 'sw'][m - 1]} ${y}`;
    const cur = group.currency;
    const list = members
        .map((x, i) => {
            const earlier = x.owes_earlier > 0
                ? (lang === 'en' ? ` (plus ${cur} ${fmt(x.owes_earlier)} from earlier months)` : ` (pamoja na deni la nyuma ${cur} ${fmt(x.owes_earlier)})`)
                : '';
            return lang === 'en'
                ? `${i + 1}. ${x.member_name} - owes ${cur} ${fmt(x.owes_this_month)}${earlier}`
                : `${i + 1}. ${x.member_name} - anadaiwa ${cur} ${fmt(x.owes_this_month)}${earlier}`;
        })
        .join('\n');

    if (lang === 'en') {
        const when = daysLeft > 0
            ? `are due on ${dmy(dueDate)} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)`
            : daysLeft === 0 ? `are due today, ${dmy(dueDate)}` : `were due on ${dmy(dueDate)}`;
        if (members.length === 0) return `Hello ${group.name} members. Everyone has paid for ${month}. Thank you!`;
        return [
            `Hello ${group.name} members.`,
            `Reminder: ${month} contributions of ${cur} ${fmt(group.monthly_amount)} ${when}.`,
            '',
            'Still to pay:',
            list,
            '',
            Number(group.late_fine) > 0 ? `Late payment fine is ${cur} ${fmt(group.late_fine)}. Thank you.` : 'Thank you.',
        ].join('\n');
    }

    const when = daysLeft > 0
        ? `inatakiwa kufika tarehe ${dmy(dueDate)} (zimebaki siku ${daysLeft})`
        : daysLeft === 0 ? `inatakiwa kufika leo, tarehe ${dmy(dueDate)}` : `ilitakiwa kufika tarehe ${dmy(dueDate)}`;
    if (members.length === 0) return `Habari wanachama wa ${group.name}. Wote mmekamilisha michango ya ${month}. Asanteni sana!`;
    return [
        `Habari wanachama wa ${group.name}.`,
        `Kumbusho: michango ya ${month} ya ${cur} ${fmt(group.monthly_amount)} ${when}.`,
        '',
        'Bado hawajakamilisha:',
        list,
        '',
        Number(group.late_fine) > 0 ? `Faini ya kuchelewa ni ${cur} ${fmt(group.late_fine)}. Asanteni.` : 'Asanteni.',
    ].join('\n');
}

// ---------- a member's own record ----------

export async function memberSummary(userId) {
    const member = await Users.findById(userId);
    if (!member) throw notFound('Member not found');
    const group = await loadGroup(member.group_id);
    const [dues, payments, credits] = await Promise.all([
        Dues.listStatuses({ groupId: group.id, userId }),
        Payments.listPayments({ groupId: group.id, userId }),
        creditsByMember(group.id),
    ]);
    const months = dues
        .map((d) => ({ ...d, status_label: statusLabel(d) }))
        .sort((a, b) => b.period.localeCompare(a.period));
    return {
        member,
        group,
        totals: {
            required: sum(dues, 'required_amount'),
            fines: sum(dues, 'fine'),
            paid: sum(dues, 'paid_total'),
            balance: sum(dues, 'balance'),
            late_months: dues.filter((d) => d.is_late).length,
        },
        credit: credits.get(userId) || 0,
        months,
        payments,
    };
}
