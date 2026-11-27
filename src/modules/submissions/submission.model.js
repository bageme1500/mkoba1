import db from '../../config/db.js';

const SELECT = `
    SELECT s.id, s.group_id, s.user_id, u.name AS member_name, s.amount, s.paid_at, s.method, s.reference,
           to_char(s.period, 'YYYY-MM') AS period, s.note, s.status, s.reviewed_by, r.name AS reviewed_by_name,
           s.reviewed_at, s.reject_reason, s.payment_id, s.created_at
    FROM payment_submissions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users r ON r.id = s.reviewed_by`;

export async function list({ groupId, userId, status }) {
    const where = ['s.group_id = $1'];
    const params = [groupId];
    if (userId) {
        params.push(userId);
        where.push(`s.user_id = $${params.length}`);
    }
    if (status) {
        params.push(status);
        where.push(`s.status = $${params.length}`);
    }
    const { rows } = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT 200`, params);
    return rows;
}

export async function findById(id, client = db, { lock = false } = {}) {
    const { rows } = await client.query(`${SELECT} WHERE s.id = $1${lock ? ' FOR UPDATE OF s' : ''}`, [id]);
    return rows[0];
}

export async function create(client, data) {
    const { rows } = await client.query(
        `INSERT INTO payment_submissions (group_id, user_id, amount, paid_at, method, reference, period, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [data.group_id, data.user_id, data.amount, data.paid_at, data.method, data.reference, data.period, data.note],
    );
    return rows[0].id;
}

export async function review(client, id, { status, reviewerId, reason = null, paymentId = null }) {
    await client.query(
        `UPDATE payment_submissions
         SET status = $2, reviewed_by = $3, reviewed_at = now(), reject_reason = $4, payment_id = $5
         WHERE id = $1`,
        [id, status, reviewerId, reason, paymentId],
    );
}

// Numbers for the "needs your attention" badges.
export async function counts(groupId, userId) {
    const { rows } = await db.query(
        `SELECT
            (SELECT COUNT(*)::int FROM payment_submissions WHERE group_id = $1 AND status = 'pending' AND user_id <> $2) AS submissions,
            (SELECT COUNT(*)::int FROM cash_entries WHERE group_id = $1 AND status = 'pending' AND created_by IS DISTINCT FROM $2) AS cashbook,
            (SELECT COUNT(*)::int FROM cash_entries WHERE group_id = $1 AND status = 'pending' AND created_by = $2) AS cashbook_waiting`,
        [groupId, userId],
    );
    return rows[0];
}
