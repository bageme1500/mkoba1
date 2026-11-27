import db from '../../config/db.js';

// Due rows with their live status (see the due_status view) and member name.
const STATUS_SELECT = `
    SELECT ds.id, ds.group_id, ds.user_id, u.name AS member_name, u.phone AS member_phone,
           to_char(ds.period, 'YYYY-MM') AS period, ds.due_date,
           ds.required_amount, ds.late_fine, ds.fine, ds.paid_total, ds.paid_by_deadline,
           ds.balance, ds.status, ds.is_late, ds.last_paid_at
    FROM due_status ds JOIN users u ON u.id = ds.user_id`;

export async function listStatuses({ groupId, period, userId, year }) {
    const where = ['ds.group_id = $1'];
    const params = [groupId];
    if (period) {
        params.push(period);
        where.push(`ds.period = $${params.length}`);
    }
    if (year) {
        params.push(year);
        where.push(`EXTRACT(YEAR FROM ds.period) = $${params.length}`);
    }
    if (userId) {
        params.push(userId);
        where.push(`ds.user_id = $${params.length}`);
    }
    const { rows } = await db.query(`${STATUS_SELECT} WHERE ${where.join(' AND ')} ORDER BY ds.period, u.name`, params);
    return rows;
}

export async function findStatus(id) {
    const { rows } = await db.query(`${STATUS_SELECT} WHERE ds.id = $1`, [id]);
    return rows[0];
}

export async function findById(id, client = db) {
    const { rows } = await client.query('SELECT * FROM dues WHERE id = $1', [id]);
    return rows[0];
}

export async function findByUserAndPeriod(userId, period, client = db) {
    const { rows } = await client.query('SELECT * FROM dues WHERE user_id = $1 AND period = $2', [userId, period]);
    return rows[0];
}

// Creates the month for every active member who had joined by the end of that month.
// Members who already have the month are skipped, so it is safe to run again
// (e.g. after adding a new member). Returns the user ids that got a new month.
export async function generateForPeriod(client, { group, period, dueDate, endOfMonth }) {
    const { rows } = await client.query(
        `INSERT INTO dues (group_id, user_id, period, required_amount, late_fine, due_date)
         SELECT $1, u.id, $2, $3, $4, $5
         FROM users u
         WHERE u.group_id = $1 AND u.active AND u.joined_at <= $6
         ON CONFLICT (user_id, period) DO NOTHING
         RETURNING user_id`,
        [group.id, period, group.monthly_amount, group.late_fine, dueDate, endOfMonth],
    );
    return rows.map((r) => r.user_id);
}

const UPDATABLE = ['required_amount', 'late_fine', 'due_date'];

export async function updateDue(client, id, changes) {
    const keys = UPDATABLE.filter((k) => changes[k] !== undefined);
    if (keys.length === 0) return;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await client.query(`UPDATE dues SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => changes[k])]);
}

export async function deleteDue(client, id) {
    await client.query('DELETE FROM dues WHERE id = $1', [id]);
}
