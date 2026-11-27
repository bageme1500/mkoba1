import db from '../../config/db.js';

const COLUMNS = `id, name, monthly_amount, due_day, late_fine, currency, allocation_rule, auto_start,
                 opening_balance, opening_balance_date, created_at`;

export async function listGroups() {
    const { rows } = await db.query(
        `SELECT g.id, g.name, g.monthly_amount, g.due_day, g.late_fine, g.currency, g.created_at,
                COUNT(u.id) FILTER (WHERE u.active) AS member_count
         FROM groups g LEFT JOIN users u ON u.group_id = g.id
         GROUP BY g.id ORDER BY g.name`,
    );
    return rows.map((r) => ({ ...r, member_count: Number(r.member_count) }));
}

export async function findById(id, client = db) {
    const { rows } = await client.query(`SELECT ${COLUMNS} FROM groups WHERE id = $1`, [id]);
    return rows[0];
}

const FIELDS = ['name', 'monthly_amount', 'due_day', 'late_fine', 'currency', 'allocation_rule', 'auto_start', 'opening_balance', 'opening_balance_date'];

export async function createGroup(data, client = db) {
    const keys = FIELDS.filter((k) => data[k] !== undefined);
    const { rows } = await client.query(
        `INSERT INTO groups (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING ${COLUMNS}`,
        keys.map((k) => data[k]),
    );
    return rows[0];
}

export async function updateGroup(id, changes, client = db) {
    const keys = FIELDS.filter((k) => changes[k] !== undefined);
    if (keys.length === 0) return findById(id, client);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await client.query(`UPDATE groups SET ${sets} WHERE id = $1 RETURNING ${COLUMNS}`, [
        id,
        ...keys.map((k) => changes[k]),
    ]);
    return rows[0];
}

export async function deleteGroup(id) {
    const { rowCount } = await db.query('DELETE FROM groups WHERE id = $1', [id]);
    return rowCount > 0;
}
