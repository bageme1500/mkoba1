import db from '../../config/db.js';

// Payments with member name, who recorded it, and which months it paid.
const SELECT = `
    SELECT p.id, p.group_id, p.user_id, u.name AS member_name, p.due_id,
           to_char(td.period, 'YYYY-MM') AS for_period,
           p.amount, p.paid_at, p.method, p.reference, p.note, p.source,
           p.recorded_by, rb.name AS recorded_by_name, p.created_at,
           COALESCE((
               SELECT json_agg(json_build_object('due_id', a.due_id,
                                                 'period', to_char(d.period, 'YYYY-MM'),
                                                 'amount', a.amount)
                               ORDER BY d.period)
               FROM allocations a JOIN dues d ON d.id = a.due_id
               WHERE a.payment_id = p.id
           ), '[]') AS applied_to
    FROM payments p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN dues td ON td.id = p.due_id
    LEFT JOIN users rb ON rb.id = p.recorded_by`;

export async function listPayments({ groupId, userId, from, to }) {
    const where = ['p.group_id = $1'];
    const params = [groupId];
    if (userId) {
        params.push(userId);
        where.push(`p.user_id = $${params.length}`);
    }
    if (from) {
        params.push(from);
        where.push(`p.paid_at >= $${params.length}`);
    }
    if (to) {
        params.push(to);
        where.push(`p.paid_at <= $${params.length}`);
    }
    const { rows } = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY p.paid_at DESC, p.id DESC`, params);
    return rows.map(fixAppliedAmounts);
}

export async function findWithDetails(id) {
    const { rows } = await db.query(`${SELECT} WHERE p.id = $1`, [id]);
    return rows[0] && fixAppliedAmounts(rows[0]);
}

export async function findById(id, client = db) {
    const { rows } = await client.query('SELECT * FROM payments WHERE id = $1', [id]);
    return rows[0];
}

export async function createPayment(client, data) {
    const { rows } = await client.query(
        `INSERT INTO payments (group_id, user_id, due_id, amount, paid_at, method, reference, note, source, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
            data.group_id,
            data.user_id,
            data.due_id ?? null,
            data.amount,
            data.paid_at,
            data.method ?? 'mpesa',
            data.reference ?? null,
            data.note ?? null,
            data.source ?? 'manual',
            data.recorded_by ?? null,
        ],
    );
    return rows[0].id;
}

const UPDATABLE = ['user_id', 'due_id', 'amount', 'paid_at', 'method', 'reference', 'note'];

export async function updatePayment(client, id, changes) {
    const keys = UPDATABLE.filter((k) => changes[k] !== undefined);
    if (keys.length === 0) return;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await client.query(`UPDATE payments SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => changes[k])]);
}

export async function deletePayment(client, id) {
    await client.query('DELETE FROM payments WHERE id = $1', [id]);
}

// json_agg returns NUMERIC inside JSON as numbers already, but be explicit.
const fixAppliedAmounts = (row) => ({
    ...row,
    applied_to: row.applied_to.map((a) => ({ ...a, amount: Number(a.amount) })),
});
