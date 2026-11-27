import * as Cash from './cashbook.model.js';
import * as Groups from '../groups/group.model.js';
import { notFound } from '../../utils/httpError.js';
import { endOfMonth } from '../../utils/dates.js';

const round = (n) => Math.round(n * 100) / 100;

const dayBefore = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
};

// The month's cash book: opening balance, every movement with a running balance,
// totals by category and the closing balance. Pending and rejected entries are
// listed but do not change the balance.
export async function ledger(groupId, period) {
    const group = await Groups.findById(groupId);
    if (!group) throw notFound('Group not found');
    const from = period;
    const to = endOfMonth(period);

    const opening = await Cash.expectedBalance(groupId, dayBefore(from));
    const rows = await Cash.movements(groupId, from, to);

    let balance = opening;
    const totalsIn = {};
    const totalsOut = {};
    let pending = 0;
    const lines = rows.map((r) => {
        const counts = r.status === 'approved';
        if (counts) {
            balance = round(balance + (r.direction === 'in' ? r.amount : -r.amount));
            const bucket = r.direction === 'in' ? totalsIn : totalsOut;
            bucket[r.category] = round((bucket[r.category] || 0) + r.amount);
        } else if (r.status === 'pending' && r.direction === 'out') {
            pending = round(pending + r.amount);
        }
        return { ...r, counts, balance };
    });
    const sum = (o) => round(Object.values(o).reduce((t, v) => t + v, 0));

    return {
        group,
        period: period.slice(0, 7),
        from,
        to,
        opening_balance: opening,
        total_in: sum(totalsIn),
        total_out: sum(totalsOut),
        in_by_category: totalsIn,
        out_by_category: totalsOut,
        closing_balance: balance,
        pending_out: pending,
        lines,
    };
}
