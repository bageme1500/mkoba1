import { allocate } from './allocation.js';

// Rebuilds all allocations for one member from scratch, using their group's
// payment order. Call inside a transaction after anything that changes their
// payments or dues.
export async function reallocateMember(client, userId) {
    // Lock the member so two requests cannot rebuild the same member's allocations at once.
    const { rows: [member] } = await client.query(
        `SELECT g.allocation_rule FROM users u LEFT JOIN groups g ON g.id = u.group_id
         WHERE u.id = $1 FOR UPDATE OF u`,
        [userId],
    );
    const rule = member?.allocation_rule ?? 'current_first';

    const [{ rows: dues }, { rows: payments }] = await Promise.all([
        client.query('SELECT id, period, due_date, required_amount, late_fine FROM dues WHERE user_id = $1', [userId]),
        client.query('SELECT id, amount, paid_at, due_id FROM payments WHERE user_id = $1', [userId]),
    ]);

    await client.query(
        'DELETE FROM allocations a USING payments p WHERE a.payment_id = p.id AND p.user_id = $1',
        [userId],
    );

    const { allocations } = allocate(dues, payments, { rule });
    if (allocations.length > 0) {
        await client.query(
            `INSERT INTO allocations (payment_id, due_id, amount)
             SELECT * FROM UNNEST($1::int[], $2::int[], $3::numeric[])`,
            [allocations.map((a) => a.payment_id), allocations.map((a) => a.due_id), allocations.map((a) => a.amount)],
        );
    }
}

// Re-spreads every member's payments, e.g. after the group changes its payment order.
export async function reallocateGroup(client, groupId) {
    const { rows } = await client.query('SELECT id FROM users WHERE group_id = $1 ORDER BY id', [groupId]);
    for (const { id } of rows) await reallocateMember(client, id);
}
