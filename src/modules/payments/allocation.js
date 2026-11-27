// Decides how a member's payments are spread over their monthly dues.
//
// Rules (kept in line with the due_status view in db/migrations/001_init.sql):
// - Payments are applied in date order (then by id).
// - A payment the leader marked for a specific month goes to that month first.
// - Everything else goes to the oldest month that still has a balance.
// - A month can take its required amount. Once its deadline has passed without the
//   required amount paid by then, it can also take the late fine.
// - Money left after every month is full stays unallocated, as credit, and is used
//   when new months are generated.
//
// Pure function so the rules are easy to test. Amounts are handled in cents.

const cents = (n) => Math.round(Number(n) * 100);

/**
 * @param {Array<{id:number, period:string, due_date:string, required_amount:number, late_fine:number}>} dues
 * @param {Array<{id:number, amount:number, paid_at:string, due_id?:number|null}>} payments
 * @returns {{ allocations: Array<{payment_id:number, due_id:number, amount:number}>, credit: number }}
 */
export function allocate(dues, payments) {
    const months = [...dues]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map((d) => ({
            id: d.id,
            dueDate: d.due_date,
            required: cents(d.required_amount),
            fine: cents(d.late_fine),
            paid: 0,
            paidByDeadline: 0,
        }));
    const byId = new Map(months.map((m) => [m.id, m]));

    const ordered = [...payments].sort((a, b) => a.paid_at.localeCompare(b.paid_at) || a.id - b.id);

    const allocations = [];
    let credit = 0;

    for (const payment of ordered) {
        let left = cents(payment.amount);
        const target = payment.due_id ? byId.get(payment.due_id) : undefined;
        const queue = target ? [target, ...months.filter((m) => m !== target)] : months;

        for (const month of queue) {
            if (left === 0) break;
            const onTime = payment.paid_at <= month.dueDate;
            // The fine is only owed once this payment comes after a missed deadline.
            const fined = !onTime && month.paidByDeadline < month.required;
            const cap = month.required + (fined ? month.fine : 0);
            const take = Math.min(left, cap - month.paid);
            if (take <= 0) continue;

            month.paid += take;
            if (onTime) month.paidByDeadline += take;
            left -= take;
            allocations.push({ payment_id: payment.id, due_id: month.id, amount: take / 100 });
        }
        credit += left;
    }

    return { allocations, credit: credit / 100 };
}
