import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/db.js';
import { today } from '../src/utils/dates.js';

export const http = () => request(app);

export async function resetDb() {
    await pool.query('TRUNCATE groups, users RESTART IDENTITY CASCADE');
}

// 'YYYY-MM' for n months before the current month.
export function monthsAgo(n) {
    const [y, m] = today().split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

let phoneCounter = 0;
export const nextPhone = () => `07${String(10000000 + (phoneCounter += 1)).slice(-8)}`;

// Registers a group with its leader. Returns { token, group, leader, auth }.
export async function createGroup({ monthly_amount = 50000, due_day = 28, late_fine = 2000, name = 'Test Group' } = {}) {
    const res = await http()
        .post('/auth/register-group')
        .send({
            group: { name, monthly_amount, due_day, late_fine },
            leader: { name: 'Leader', phone: nextPhone(), password: 'secret1' },
        })
        .expect(201);
    const auth = { Authorization: `Bearer ${res.body.token}` };
    // Backdate the leader so they are charged for past months too.
    await pool.query("UPDATE users SET joined_at = '2000-01-01' WHERE id = $1", [res.body.user.id]);
    return { token: res.body.token, group: res.body.group, leader: res.body.user, auth };
}

export async function addMember(auth, { name = 'Member', password, joined_at = '2000-01-01' } = {}) {
    const phone = nextPhone();
    const res = await http().post('/users').set(auth).send({ name, phone, password, joined_at }).expect(201);
    return res.body;
}

export async function loginAs(phone, password) {
    const res = await http().post('/auth/login').send({ phone, password }).expect(200);
    return { Authorization: `Bearer ${res.body.token}` };
}

export async function startMonth(auth, period) {
    return http().post('/dues/generate').set(auth).send({ period });
}

export async function pay(auth, body) {
    return http().post('/payments').set(auth).send(body);
}

export async function dueFor(auth, userId, period) {
    const res = await http().get('/dues').query({ user_id: userId, period }).set(auth).expect(200);
    return res.body[0];
}

export { pool };
