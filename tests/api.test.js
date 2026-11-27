import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addMember, createGroup, dueFor, http, loginAs, monthsAgo, pay, pool, resetDb, startMonth } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

// A month whose deadline has passed (two months ago) and its dates.
const past = monthsAgo(2);
const onTime = `${past}-10`;
const afterDeadline = `${monthsAgo(1)}-02`;

describe('monthly status, fines and balances', () => {
    it('works out paid, partial, late-with-fine and unpaid', async () => {
        const { auth } = await createGroup();
        const paidOnTime = await addMember(auth, { name: 'On time' });
        const partial = await addMember(auth, { name: 'Partial' });
        const late = await addMember(auth, { name: 'Late' });
        const unpaid = await addMember(auth, { name: 'Unpaid' });

        expect((await startMonth(auth, past)).body.created).toBe(5); // 4 members + leader

        await pay(auth, { user_id: paidOnTime.id, amount: 50000, paid_at: onTime }).then((r) => expect(r.status).toBe(201));
        await pay(auth, { user_id: partial.id, amount: 20000, paid_at: onTime });
        await pay(auth, { user_id: late.id, amount: 50000, paid_at: afterDeadline });

        const a = await dueFor(auth, paidOnTime.id, past);
        expect(a).toMatchObject({ status: 'paid', is_late: false, fine: 0, balance: 0 });

        const b = await dueFor(auth, partial.id, past);
        expect(b).toMatchObject({ status: 'partial', is_late: true, fine: 2000, paid_total: 20000, balance: 32000 });

        // Paid the amount after the deadline: the fine is still owed.
        const c = await dueFor(auth, late.id, past);
        expect(c).toMatchObject({ status: 'partial', is_late: true, fine: 2000, paid_total: 50000, balance: 2000 });

        const d = await dueFor(auth, unpaid.id, past);
        expect(d).toMatchObject({ status: 'unpaid', is_late: true, fine: 2000, balance: 52000 });

        // Paying the fine completes the month.
        await pay(auth, { user_id: late.id, amount: 2000, paid_at: afterDeadline });
        expect(await dueFor(auth, late.id, past)).toMatchObject({ status: 'paid', balance: 0, paid_total: 52000 });
    });

    it('does not fine anyone before the deadline', async () => {
        const { auth, group } = await createGroup({ due_day: 28 });
        const m = await addMember(auth);
        const future = monthsAgo(-2); // two months ahead: deadline not reached
        await startMonth(auth, future);
        const d = await dueFor(auth, m.id, future);
        expect(d).toMatchObject({ status: 'unpaid', is_late: false, fine: 0, balance: group.monthly_amount });
    });

    it('lets a leader waive a fine', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth);
        await startMonth(auth, past);
        const d = await dueFor(auth, m.id, past);
        expect(d.fine).toBe(2000);
        const res = await http().put(`/dues/${d.id}`).set(auth).send({ late_fine: 0 }).expect(200);
        expect(res.body).toMatchObject({ fine: 0, balance: 50000 });
    });

    it('applies credit to a month started later', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth);
        await startMonth(auth, past);
        await pay(auth, { user_id: m.id, amount: 70000, paid_at: onTime });
        // Next month's deadline has not passed yet, so only the credit counts (no fine).
        const upcoming = monthsAgo(-1);
        await startMonth(auth, upcoming);
        expect(await dueFor(auth, m.id, upcoming)).toMatchObject({ paid_total: 20000, balance: 30000, fine: 0 });
    });
});

describe('starting a month', () => {
    it('is safe to run twice and picks up new members', async () => {
        const { auth } = await createGroup();
        await addMember(auth);
        expect((await startMonth(auth, past)).body.created).toBe(2);
        expect((await startMonth(auth, past)).body.created).toBe(0);
        await addMember(auth);
        expect((await startMonth(auth, past)).body.created).toBe(1);
    });

    it('does not charge members who joined after the month', async () => {
        const { auth } = await createGroup();
        await addMember(auth, { joined_at: `${monthsAgo(0)}-01` });
        expect((await startMonth(auth, past)).body.created).toBe(1); // only the leader
    });

    it('does not charge deactivated members', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth);
        await http().delete(`/users/${m.id}`).set(auth).expect(200);
        expect((await startMonth(auth, past)).body.created).toBe(1);
    });
});

describe('payments', () => {
    it('rejects a reference that is already recorded', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth);
        await pay(auth, { user_id: m.id, amount: 1000, paid_at: onTime, reference: 'abc123' }).then((r) => expect(r.status).toBe(201));
        const dup = await pay(auth, { user_id: m.id, amount: 1000, paid_at: onTime, reference: 'ABC123' });
        expect(dup.status).toBe(409);
    });

    it('rejects payments dated in the future', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth);
        const res = await pay(auth, { user_id: m.id, amount: 1000, paid_at: '2999-01-01' });
        expect(res.status).toBe(400);
    });

    it('moves money when a payment is edited or deleted', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth);
        await startMonth(auth, past);
        const created = await pay(auth, { user_id: m.id, amount: 50000, paid_at: onTime });
        expect(await dueFor(auth, m.id, past)).toMatchObject({ status: 'paid' });

        await http().put(`/payments/${created.body.id}`).set(auth).send({ amount: 10000 }).expect(200);
        expect(await dueFor(auth, m.id, past)).toMatchObject({ paid_total: 10000 });

        await http().delete(`/payments/${created.body.id}`).set(auth).expect(204);
        expect(await dueFor(auth, m.id, past)).toMatchObject({ paid_total: 0, status: 'unpaid' });
    });
});

describe('statement import', () => {
    const csv = (rows) => Buffer.from(['Receipt No.,Completion Time,Details,Paid In', ...rows].join('\n'));
    const mapping = JSON.stringify({ date: 'Completion Time', amount: 'Paid In', reference: 'Receipt No.', name: 'Details' });
    const upload = (auth, buffer) => http().post('/imports').set(auth).attach('file', buffer, 'statement.csv').field('mapping', mapping);

    it('matches by phone or name, skips withdrawals and reports duplicates', async () => {
        const { auth } = await createGroup();
        const asha = await addMember(auth, { name: 'Asha Mohamed' });
        const juma = await addMember(auth, { name: 'Juma Hassan' });
        const date = onTime.split('-').reverse().join('/');
        const file = csv([
            `R1,${date},Funds received from - ${asha.phone} - ASHA,"50,000.00"`,
            `R2,${date},Funds received from - JUMA HASSAN,"20,000.00"`,
            `R3,${date},Funds received from - 0799 999 999 - STRANGER,"5,000.00"`,
            `R4,${date},Withdrawal charge,`,
            `R1,${date},Funds received from - ${asha.phone} - ASHA,"50,000.00"`,
        ]);

        const first = await upload(auth, file).expect(201);
        expect(first.body).toMatchObject({ total_rows: 5, matched_rows: 2, unmatched_rows: 1, skipped_rows: 1, duplicate_rows: 1 });
        const byRef = Object.fromEntries(first.body.rows.filter((r) => r.status === 'matched').map((r) => [r.reference, r.user_id]));
        expect(byRef).toEqual({ R1: asha.id, R2: juma.id });

        // Uploading the same file again records nothing new.
        const second = await upload(auth, file).expect(201);
        expect(second.body).toMatchObject({ matched_rows: 0, duplicate_rows: 3 });

        // A leader assigns the unmatched row.
        const unmatched = first.body.rows.find((r) => r.status === 'unmatched');
        const assigned = await http().post(`/imports/rows/${unmatched.id}/assign`).set(auth).send({ user_id: juma.id }).expect(200);
        expect(assigned.body).toMatchObject({ matched_rows: 3, unmatched_rows: 0 });
        const payments = await http().get('/payments').query({ user_id: juma.id }).set(auth).expect(200);
        expect(payments.body.map((p) => p.amount).sort()).toEqual([20000, 5000]);
    });
});

describe('who can see and do what', () => {
    it('keeps members to their own record', async () => {
        const { auth } = await createGroup();
        const me = await addMember(auth, { password: 'member1' });
        const other = await addMember(auth);
        const memberAuth = await loginAs(me.phone, 'member1');

        await pay(memberAuth, { user_id: me.id, amount: 1000, paid_at: onTime }).then((r) => expect(r.status).toBe(403));
        await http().get('/users').set(memberAuth).expect(403);
        await http().get(`/users/${other.id}`).set(memberAuth).expect(403);
        await http().get('/reports/monthly').set(memberAuth).expect(403);
        await http().get('/me/summary').set(memberAuth).expect(200);

        await pay(auth, { user_id: other.id, amount: 1000, paid_at: onTime });
        const visible = await http().get('/payments').set(memberAuth).expect(200);
        expect(visible.body).toEqual([]);
    });

    it("stops a leader touching another group's data", async () => {
        const a = await createGroup({ name: 'A' });
        const b = await createGroup({ name: 'B' });
        const bMember = await addMember(b.auth);

        await http().get(`/users/${bMember.id}`).set(a.auth).expect(403);
        await http().get('/users').query({ group_id: b.group.id }).set(a.auth).expect(403);
        await http().put(`/groups/${b.group.id}`).set(a.auth).send({ late_fine: 0 }).expect(403);
        const res = await pay(a.auth, { user_id: bMember.id, amount: 1000, paid_at: onTime });
        expect(res.status).toBe(400);
    });

    it('needs a login', async () => {
        await http().get('/users').expect(401);
        await http().get('/users').set({ Authorization: 'Bearer nonsense' }).expect(401);
    });

    it('blocks deactivated users from logging in', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth, { password: 'member1' });
        await http().delete(`/users/${m.id}`).set(auth).expect(200);
        await http().post('/auth/login').send({ phone: m.phone, password: 'member1' }).expect(401);
    });
});

describe('reports', () => {
    it('totals the monthly report and exports Excel and PDF', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth);
        await startMonth(auth, past);
        await pay(auth, { user_id: m.id, amount: 50000, paid_at: onTime });

        const report = await http().get('/reports/monthly').query({ period: past }).set(auth).expect(200);
        expect(report.body.totals).toMatchObject({ members: 2, expected: 100000, collected: 50000, fines: 2000, outstanding: 52000, paid: 1, unpaid: 1 });

        const xlsx = await http().get('/reports/monthly').query({ period: past, format: 'xlsx' }).set(auth).expect(200);
        expect(xlsx.headers['content-type']).toContain('spreadsheetml');
        const pdf = await http().get('/reports/yearly').query({ year: past.slice(0, 4), format: 'pdf' }).set(auth).buffer(true).expect(200);
        expect(pdf.headers['content-type']).toBe('application/pdf');
    });

    it('lists who still owes in the reminder message', async () => {
        const { auth } = await createGroup({ name: 'Umoja' });
        const m = await addMember(auth, { name: 'Baraka' });
        await startMonth(auth, monthsAgo(0));
        const res = await http().get('/reports/reminders').query({ lang: 'en' }).set(auth).expect(200);
        expect(res.body.members.map((x) => x.user_id)).toContain(m.id);
        expect(res.body.message).toContain('Baraka - owes TZS 50,000');
    });
});
