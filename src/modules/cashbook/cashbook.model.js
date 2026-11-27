import db from '../../config/db.js';

export const OUT_CATEGORIES = ['withdrawal', 'expense', 'charges', 'payout', 'other_out'];
export const IN_CATEGORIES = ['other_income', 'adjustment'];

const ENTRY_SELECT = `
    SELECT e.*, cb.name AS created_by_name, ab.name AS approved_by_name
    FROM cash_entries e
    LEFT JOIN users cb ON cb.id = e.created_by
    LEFT JOIN users ab ON ab.id = e.approved_by`;

export async function listEntries({ groupId, from, to, status }) {
    const where = ['e.group_id = $1'];
    const params = [groupId];
    const add = (sql, value) => {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
    };
    if (from) add('e.occurred_at >= ?', from);
    if (to) add('e.occurred_at <= ?', to);
    if (status) add('e.status = ?', status);
    const { rows } = await db.query(`${ENTRY_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.occurred_at DESC, e.id DESC`, params);
    return rows;
}

export async function findById(id, client = db) {
    const { rows } = await client.query(`${ENTRY_SELECT} WHERE e.id = $1`, [id]);
    return rows[0];
}

export async function createEntry(client, data) {
    const { rows } = await client.query(
        `INSERT INTO cash_entries (group_id, direction, category, amount, occurred_at, description, reference,
                                   status, source, created_by, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
            data.group_id,
            data.direction,
            data.category,
            data.amount,
            data.occurred_at,
            data.description,
            data.reference ?? null,
            data.status,
            data.source ?? 'manual',
            data.created_by,
            data.approved_by ?? null,
            data.approved_at ?? null,
        ],
    );
    return rows[0].id;
}

export async function review(client, id, { status, reviewerId, reason = null }) {
    await client.query(
        `UPDATE cash_entries SET status = $2, approved_by = $3, approved_at = now(), reject_reason = $4 WHERE id = $1`,
        [id, status, reviewerId, reason],
    );
}

export async function deleteEntry(client, id) {
    await client.query('DELETE FROM cash_entries WHERE id = $1', [id]);
}

// Money in M-Koba that the system expects at the END of `asOf` (YYYY-MM-DD).
// Counts the opening balance plus everything dated on/after the opening balance date.
export async function expectedBalance(groupId, asOf, client = db) {
    const { rows } = await client.query(
        `WITH g AS (SELECT opening_balance, COALESCE(opening_balance_date, '1900-01-01'::date) AS since FROM groups WHERE id = $1)
         SELECT g.opening_balance
              + COALESCE((SELECT SUM(amount) FROM payments WHERE group_id = $1 AND paid_at BETWEEN g.since AND $2), 0)
              + COALESCE((SELECT SUM(amount) FROM cash_entries WHERE group_id = $1 AND status = 'approved'
                          AND direction = 'in' AND occurred_at BETWEEN g.since AND $2), 0)
              - COALESCE((SELECT SUM(amount) FROM cash_entries WHERE group_id = $1 AND status = 'approved'
                          AND direction = 'out' AND occurred_at BETWEEN g.since AND $2), 0) AS balance
         FROM g`,
        [groupId, asOf],
    );
    return Number(rows[0]?.balance ?? 0);
}

// Every movement in a date range, oldest first: member contributions and cash book entries.
export async function movements(groupId, from, to) {
    const { rows } = await db.query(
        `WITH g AS (SELECT COALESCE(opening_balance_date, '1900-01-01'::date) AS since FROM groups WHERE id = $1)
         SELECT 'contribution' AS kind, p.id, p.paid_at AS date, 'in' AS direction, 'contribution' AS category,
                p.amount, u.name AS description, p.reference, 'approved' AS status, NULL::text AS reject_reason,
                NULL::text AS created_by_name, NULL::text AS approved_by_name, p.method, p.created_at
         FROM payments p JOIN users u ON u.id = p.user_id, g
         WHERE p.group_id = $1 AND p.paid_at BETWEEN GREATEST($2::date, g.since) AND $3
         UNION ALL
         SELECT 'entry', e.id, e.occurred_at, e.direction, e.category, e.amount, e.description, e.reference, e.status,
                e.reject_reason, cb.name, ab.name, NULL, e.created_at
         FROM cash_entries e
         LEFT JOIN users cb ON cb.id = e.created_by
         LEFT JOIN users ab ON ab.id = e.approved_by, g
         WHERE e.group_id = $1 AND e.occurred_at BETWEEN GREATEST($2::date, g.since) AND $3
         ORDER BY date, created_at, id`,
        [groupId, from, to],
    );
    return rows;
}

export async function pendingCount(groupId) {
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0) AS total FROM cash_entries WHERE group_id = $1 AND status = 'pending'`,
        [groupId],
    );
    return { count: rows[0].n, total: Number(rows[0].total) };
}

export async function activeLeaderCount(groupId) {
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM users WHERE group_id = $1 AND active AND role = 'leader'`,
        [groupId],
    );
    return rows[0].n;
}

// ---------- balance checks ----------

export async function listChecks(groupId) {
    const { rows } = await db.query(
        `SELECT c.*, c.actual_balance - c.expected_balance AS difference, u.name AS created_by_name
         FROM balance_checks c LEFT JOIN users u ON u.id = c.created_by
         WHERE c.group_id = $1 ORDER BY c.checked_on DESC, c.id DESC`,
        [groupId],
    );
    return rows;
}

export async function createCheck(client, data) {
    const { rows } = await client.query(
        `INSERT INTO balance_checks (group_id, checked_on, actual_balance, expected_balance, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *, actual_balance - expected_balance AS difference`,
        [data.group_id, data.checked_on, data.actual_balance, data.expected_balance, data.note ?? null, data.created_by],
    );
    return rows[0];
}
