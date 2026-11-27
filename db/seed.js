// Fills the database with a demo M-Koba group covering every case the reports show:
// paid on time, partial, paid late (with fine), never paid, paid ahead (credit), new member.
//
// Usage: npm run seed            (only into an empty database)
//        npm run seed -- --reset (DELETES ALL DATA first; never use on real data)
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import pool, { withTransaction } from '../src/config/db.js';
import { reallocateMember } from '../src/modules/payments/allocation.service.js';
import { dueDateFor, endOfMonth, today } from '../src/utils/dates.js';

const pad = (n) => String(n).padStart(2, '0');

// First day of the month `offset` months from the current one (0 = this month).
function periodOffset(offset) {
    const [y, m] = today().split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}
const dayOf = (period, day) => `${period.slice(0, 7)}-${pad(day)}`;

export async function seed({ reset = false, log = console.log } = {}) {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM groups');
    if (rows[0].n > 0 && !reset) {
        throw new Error('Database already has data. Run with --reset to wipe it first (dev only).');
    }

    const hash = (pw) => bcrypt.hash(pw, 10);
    const [adminHash, leaderHash, memberHash] = await Promise.all([hash('admin123'), hash('leader123'), hash('member123')]);

    await withTransaction(async (c) => {
        if (reset) {
            // CASCADE also empties every table that points at groups/users (dues, payments, imports...).
            await c.query('TRUNCATE groups, users RESTART IDENTITY CASCADE');
        }

        await c.query(`INSERT INTO users (name, phone, role, password_hash) VALUES ('System Admin', '255700000001', 'admin', $1)`, [adminHash]);

        const group = (
            await c.query(
                `INSERT INTO groups (name, monthly_amount, due_day, late_fine)
                 VALUES ('Umoja M-Koba', 50000, 28, 2000) RETURNING *`,
            )
        ).rows[0];

        const months = [-3, -2, -1, 0].map(periodOffset);
        const firstMonth = months[0];

        const addUser = async (name, phone, role, joined, passwordHash = null) =>
            (
                await c.query(
                    `INSERT INTO users (group_id, name, phone, role, joined_at, password_hash)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                    [group.id, name, phone, role, joined, passwordHash],
                )
            ).rows[0].id;

        const leader = await addUser('Bageme (Leader)', '255712345678', 'leader', firstMonth, leaderHash);
        const asha = await addUser('Asha Mohamed', '255754111222', 'member', firstMonth, memberHash);
        const juma = await addUser('Juma Hassan', '255765222333', 'member', firstMonth);
        const neema = await addUser('Neema John', '255713333444', 'member', firstMonth);
        const baraka = await addUser('Baraka Said', '255744444555', 'member', firstMonth);
        const rehema = await addUser('Rehema Ally', '255755555666', 'member', firstMonth);
        const hamisi = await addUser('Hamisi Omari', '255766666777', 'member', months[3]);

        for (const period of months) {
            await c.query(
                `INSERT INTO dues (group_id, user_id, period, required_amount, late_fine, due_date)
                 SELECT $1, id, $2, $3, $4, $5 FROM users
                 WHERE group_id = $1 AND active AND joined_at <= $6`,
                [group.id, period, group.monthly_amount, group.late_fine, dueDateFor(period, group.due_day), endOfMonth(period)],
            );
        }

        let ref = 0;
        // forPeriod: the month the leader said the payment is for (otherwise oldest open month).
        const pay = (userId, amount, paidAt, { method = 'mpesa', forPeriod = null } = {}) =>
            c.query(
                `INSERT INTO payments (group_id, user_id, amount, paid_at, method, reference, recorded_by, due_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT id FROM dues WHERE user_id = $2 AND period = $8))`,
                [group.id, userId, amount, paidAt, method, method === 'cash' ? null : `SEED${String(++ref).padStart(6, '0')}`, leader, forPeriod],
            );

        const t = today();
        const past = months.slice(0, 3);
        for (const p of past) {
            await pay(leader, 50000, dayOf(p, 5));
            await pay(asha, 50000, dayOf(p, 20)); // always on time
            await pay(juma, 30000, dayOf(p, 25), { forPeriod: p }); // always partial, for that month
        }
        // Neema pays after the deadline: full amount + fine in the first month, without the fine later.
        await pay(neema, 52000, dayOf(months[1], 3));
        await pay(neema, 50000, dayOf(months[2], 2));
        await pay(neema, 50000, dayOf(months[3], 1));
        // Baraka never pays.
        // Rehema pays two months at once, then two more months plus TZS 20,000 extra (credit).
        await pay(rehema, 100000, dayOf(months[0], 10));
        await pay(rehema, 120000, dayOf(months[2], 15), { method: 'cash' });

        // This month (deadline not reached yet in the demo): some have paid already.
        const early = dayOf(months[3], Math.min(3, Number(t.slice(8, 10))));
        await pay(leader, 50000, early);
        await pay(asha, 50000, early);
        await pay(juma, 20000, early, { forPeriod: months[3] });

        for (const userId of [leader, asha, juma, neema, baraka, rehema, hamisi]) {
            await reallocateMember(c, userId);
        }
    });

    log('Seeded demo group "Umoja M-Koba" (monthly TZS 50,000, deadline 28th, fine TZS 2,000).');
    log('Logins (phone / password):');
    log('  admin  0700000001 / admin123');
    log('  leader 0712345678 / leader123');
    log('  member 0754111222 / member123');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    seed({ reset: process.argv.includes('--reset') })
        .catch((err) => {
            console.error(err.message);
            process.exitCode = 1;
        })
        .finally(() => pool.end());
}
