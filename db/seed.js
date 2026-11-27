// Fills the database with a demo M-Koba group covering every case the reports show:
// paid on time, partial, paid late (with fine), never paid, paid ahead (credit), new member.
//
// Usage: npm run seed            (only into an empty database)
//        npm run seed -- --reset (DELETES ALL DATA first; never use on real data)
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import pool, { withTransaction } from '../src/config/db.js';
import { reallocateMember } from '../src/modules/payments/allocation.service.js';
import { expectedBalance } from '../src/modules/cashbook/cashbook.model.js';
import { dueDateFor, endOfMonth, monthLabel, today } from '../src/utils/dates.js';

const pad = (n) => String(n).padStart(2, '0');

// First day of the month `offset` months from the current one (0 = this month).
function periodOffset(offset) {
    const [y, m] = today().split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}
const dayOf = (period, day) => `${period.slice(0, 7)}-${pad(day)}`;

export async function seed({ reset = false, log = console.log } = {}) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM groups');
    if (rows[0].n > 0 && !reset) {
        throw new Error('Database already has data. Run with --reset to wipe it first (dev only).');
    }

    const hash = (pw) => bcrypt.hash(pw, 10);
    const [adminHash, leaderHash, memberHash] = await Promise.all([hash('admin123'), hash('leader123'), hash('member123')]);

    await withTransaction(async (c) => {
        if (reset) {
            // CASCADE also empties every table that points at groups/users (dues, payments, imports...).
            await c.query('TRUNCATE groups, users RESTART IDENTITY CASCADE');
        }

        await c.query(`INSERT INTO users (name, phone, role, password_hash) VALUES ('System Admin', '255700000001', 'admin', $1)`, [adminHash]);

        const months = [-3, -2, -1, 0].map(periodOffset);
        const firstMonth = months[0];

        // The group had TZS 150,000 in M-Koba when it started using the system.
        const group = (
            await c.query(
                `INSERT INTO groups (name, monthly_amount, due_day, late_fine, opening_balance, opening_balance_date)
                 VALUES ('Umoja M-Koba', 50000, 28, 2000, 150000, $1) RETURNING *`,
                [firstMonth],
            )
        ).rows[0];

        const addUser = async (name, phone, role, joined, passwordHash = null) =>
            (
                await c.query(
                    `INSERT INTO users (group_id, name, phone, role, joined_at, password_hash)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                    [group.id, name, phone, role, joined, passwordHash],
                )
            ).rows[0].id;

        const leader = await addUser('Bageme (Leader)', '255712345678', 'leader', firstMonth, leaderHash);
        // Second leader, so money going out can be approved by someone else.
        const grace = await addUser('Grace Mwita (Treasurer)', '255713000111', 'leader', firstMonth, leaderHash);
        const asha = await addUser('Asha Mohamed', '255754111222', 'member', firstMonth, memberHash);
        const juma = await addUser('Juma Hassan', '255765222333', 'member', firstMonth);
        const neema = await addUser('Neema John', '255713333444', 'member', firstMonth);
        const baraka = await addUser('Baraka Said', '255744444555', 'member', firstMonth);
        const rehema = await addUser('Rehema Ally', '255755555666', 'member', firstMonth);
        const hamisi = await addUser('Hamisi Omari', '255766666777', 'member', months[3]);

        for (const period of months) {
            await c.query(
                `INSERT INTO dues (group_id, user_id, period, required_amount, late_fine, due_date)
                 SELECT $1, id, $2, $3, $4, $5 FROM users
                 WHERE group_id = $1 AND active AND joined_at <= $6`,
                [group.id, period, group.monthly_amount, group.late_fine, dueDateFor(period, group.due_day), endOfMonth(period)],
            );
        }

        let ref = 0;
        // forPeriod: the month the leader said the payment is for (otherwise oldest open month).
        const pay = (userId, amount, paidAt, { method = 'mpesa', forPeriod = null } = {}) =>
            c.query(
                `INSERT INTO payments (group_id, user_id, amount, paid_at, method, reference, recorded_by, due_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM dues WHERE user_id = $2 AND period = $8))`,
                [group.id, userId, amount, paidAt, method, method === 'cash' ? null : `SEED${String(++ref).padStart(6, '0')}`, leader, forPeriod],
            );

        const t = today();
        const past = months.slice(0, 3);
        for (const p of past) {
            await pay(leader, 50000, dayOf(p, 5));
            await pay(grace, 50000, dayOf(p, 6));
            await pay(asha, 50000, dayOf(p, 20)); // always on time
            await pay(juma, 30000, dayOf(p, 25), { forPeriod: p }); // always partial, for that month
        }
        // Neema pays early in the following month for the month before (late): full amount + fine
        // the first time, without the fine later. The leader records which month it was for.
        await pay(neema, 52000, dayOf(months[1], 3), { forPeriod: months[0] });
        await pay(neema, 50000, dayOf(months[2], 2), { forPeriod: months[1] });
        await pay(neema, 50000, dayOf(months[3], 1), { forPeriod: months[2] });
        // Baraka never pays.
        // Rehema pays two months at once, then two more months plus TZS 20,000 extra (credit).
        await pay(rehema, 100000, dayOf(months[0], 10));
        await pay(rehema, 120000, dayOf(months[2], 15), { method: 'cash' });

        // This month (deadline not reached yet in the demo): some have paid already.
        const early = dayOf(months[3], Math.min(3, Number(t.slice(8, 10))));
        await pay(leader, 50000, early);
        await pay(grace, 50000, early);
        await pay(asha, 50000, early);
        await pay(juma, 20000, early, { forPeriod: months[3] });

        for (const userId of [leader, grace, asha, juma, neema, baraka, rehema, hamisi]) {
            await reallocateMember(c, userId);
        }

        // ---------- cash book ----------
        const at = (period, day, hour = 10) => `${dayOf(period, day)}T${pad(hour)}:00:00+03:00`;
        const entry = async ({ direction = 'out', category, amount, on, description, status, by, reviewer, reason = null, reference = null }) =>
            (
                await c.query(
                    `INSERT INTO cash_entries (group_id, direction, category, amount, occurred_at, description, reference, status,
                                               created_by, approved_by, approved_at, reject_reason, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
                    [group.id, direction, category, amount, on, description, reference, status, by, reviewer ?? null,
                        reviewer ? `${on}T16:00:00+03:00` : null, reason, `${on}T09:00:00+03:00`],
                )
            ).rows[0].id;

        await entry({ category: 'expense', amount: 15000, on: dayOf(months[1], 12), description: 'Stationery and receipt books', status: 'approved', by: leader, reviewer: grace });
        await entry({ category: 'withdrawal', amount: 25000, on: dayOf(months[1], 20), description: 'Withdrawal with no receipt', status: 'rejected', by: grace, reviewer: leader, reason: 'No receipt provided' });
        await entry({ category: 'charges', amount: 3500, on: dayOf(months[2], 6), description: 'M-Pesa withdrawal charges', status: 'approved', by: grace, reviewer: leader });
        await entry({ category: 'payout', amount: 100000, on: dayOf(months[2], 18), description: "Emergency support for a member's family", status: 'approved', by: leader, reviewer: grace, reference: 'SEEDOUT01' });
        await entry({ direction: 'in', category: 'other_income', amount: 4200, on: dayOf(months[2], 28), description: 'Interest from the bank account', status: 'approved', by: grace, reviewer: grace });
        // Waiting for Bageme to approve (Grace recorded it).
        const pendingOn = dayOf(months[3], Math.min(5, Number(t.slice(8, 10))));
        await entry({ category: 'withdrawal', amount: 60000, on: pendingOn, description: 'Transport for the end-of-year meeting', status: 'pending', by: grace });

        // Balance check at the end of last month: M-Koba showed TZS 2,000 less than expected.
        const checkOn = endOfMonth(months[2]);
        const expected = await expectedBalance(group.id, checkOn, c);
        await c.query(
            `INSERT INTO balance_checks (group_id, checked_on, actual_balance, expected_balance, note, created_by, created_at)
             VALUES ($1, $2, $3, $4, 'Checked in the M-Koba app', $5, $6)`,
            [group.id, checkOn, expected - 2000, expected, grace, `${checkOn}T18:00:00+03:00`],
        );

        // Asha reports a payment she made today; a leader still has to confirm it.
        await c.query(
            `INSERT INTO payment_submissions (group_id, user_id, amount, paid_at, method, reference, note)
             VALUES ($1, $2, 50000, $3, 'mpesa', 'TKS9P2Q7XM', 'Paid early for next month')`,
            [group.id, asha, t],
        );

        // ---------- activity log ----------
        const logAt = (when, actor, action, entity, summary, subject = null) =>
            c.query(
                `INSERT INTO audit_log (group_id, actor_id, action, entity, subject_user_id, summary, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [group.id, actor, action, entity, subject, summary, when],
            );
        for (const p of months) {
            const n = (await c.query('SELECT COUNT(*)::int AS n FROM dues WHERE group_id = $1 AND period = $2', [group.id, p])).rows[0].n;
            await logAt(at(p, 1, 0), null, 'month.start', 'month', `Started ${monthLabel(p)} automatically for ${n} member(s)`);
        }
        await logAt(at(months[1], 12, 9), leader, 'cash.create', 'cash_entry', 'Recorded expense of TZS 15,000: Stationery and receipt books (waiting for approval)');
        await logAt(at(months[1], 12, 16), grace, 'cash.approve', 'cash_entry', 'Approved expense of TZS 15,000: Stationery and receipt books (recorded by Bageme (Leader))');
        await logAt(at(months[1], 20, 16), leader, 'cash.reject', 'cash_entry', 'Rejected withdrawal of TZS 25,000: Withdrawal with no receipt. Reason: No receipt provided');
        await logAt(at(months[2], 18, 16), grace, 'cash.approve', 'cash_entry', "Approved payout to members of TZS 100,000: Emergency support for a member's family (recorded by Bageme (Leader))");
        await logAt(`${checkOn}T18:00:00+03:00`, grace, 'cash.check', 'balance_check', `Checked M-Koba balance on ${checkOn}: real TZS ${(expected - 2000).toLocaleString('en-US')}, expected TZS ${expected.toLocaleString('en-US')} (difference TZS -2,000)`);
        await logAt(`${pendingOn}T09:00:00+03:00`, grace, 'cash.create', 'cash_entry', 'Recorded withdrawal of TZS 60,000: Transport for the end-of-year meeting (waiting for approval)');
        await logAt(`${t}T08:30:00+03:00`, asha, 'submission.create', 'submission', 'Asha Mohamed reported paying TZS 50,000 (TKS9P2Q7XM)', asha);
    });

    log('Seeded demo group "Umoja M-Koba" (monthly TZS 50,000, deadline 28th, fine TZS 2,000).');
    log('Logins (phone / password):');
    log('  admin          0700000001 / admin123');
    log('  leader         0712345678 / leader123');
    log('  second leader  0713000111 / leader123');
    log('  member         0754111222 / member123');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    seed({ reset: process.argv.includes('--reset') })
        .catch((err) => {
            console.error(err.message);
            process.exitCode = 1;
        })
        .finally(() => pool.end());
}
