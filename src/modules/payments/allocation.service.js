import { allocate } from './allocation.js';

// Rebuilds all allocations for one member from scratch. Call inside a transaction
// after anything that changes their payments or dues.
export async function reallocateMember(client, userId) {
    // Lock the member so two requests cannot rebuild the same member's allocations at once.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    const [{ rows: dues }, { rows: payments }] = await Promise.all([
        client.query('SELECT id, period, due_date, required_amount, late_fine FROM dues WHERE user_id = $1', [userId]),
        client.query('SELECT id, amount, paid_at, due_id FROM payments WHERE user_id = $1', [userId]),
    ]);

    await client.query(
        'DELETE FROM allocations a USING payments p WHERE a.payment_id = p.id AND p.user_id = $1',
        [userId],
    );

    const { allocations } = allocate(dues, payments);
    if (allocations.length > 0) {
        await client.query(
            `INSERT INTO allocations (payment_id, due_id, amount)
             SELECT * FROM UNNEST($1::int[], $2::int[], $3::numeric[])`,
            [allocations.map((a) => a.payment_id), allocations.map((a) => a.due_id), allocations.map((a) => a.amount)],
        );
    }
}
