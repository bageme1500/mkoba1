import db from '../../config/db.js';

const COLUMNS = `id, group_id, name, phone, email, role, active, joined_at, created_at,
                 (password_hash IS NOT NULL) AS has_login`;

export async function listUsers(groupId, { includeInactive = false } = {}) {
    const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users
         WHERE group_id = $1 AND ($2 OR active)
         ORDER BY active DESC, name`,
        [groupId, includeInactive],
    );
    return rows;
}

export async function findById(id, client = db) {
    const { rows } = await client.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0];
}

export async function findForLogin(phone) {
    const { rows } = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    return rows[0];
}

export async function getPasswordHash(id) {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [id]);
    return rows[0]?.password_hash ?? null;
}

export async function createUser(data, client = db) {
    const { rows } = await client.query(
        `INSERT INTO users (group_id, name, phone, email, role, password_hash, joined_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, CURRENT_DATE))
         RETURNING ${COLUMNS}`,
        [
            data.group_id ?? null,
            data.name,
            data.phone,
            data.email ?? null,
            data.role ?? 'member',
            data.password_hash ?? null,
            data.joined_at ?? null,
        ],
    );
    return rows[0];
}

const UPDATABLE = ['name', 'phone', 'email', 'role', 'active', 'joined_at', 'password_hash'];

export async function updateUser(id, changes) {
    const keys = UPDATABLE.filter((k) => changes[k] !== undefined);
    if (keys.length === 0) return findById(id);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await db.query(`UPDATE users SET ${sets} WHERE id = $1 RETURNING ${COLUMNS}`, [
        id,
        ...keys.map((k) => changes[k]),
    ]);
    return rows[0];
}
