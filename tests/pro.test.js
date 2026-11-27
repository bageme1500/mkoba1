// Round 2 features: cash book, approvals, member submissions, receipts, audit log,
// sessions, login limits, payment order setting and automatic months.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addLeader, addMember, createGroup, dueFor, http, loginAs, monthsAgo, pay, pool, resetDb, startMonth } from './helpers.js';
import { autoStartMonths } from '../src/jobs/autoStart.js';
import { today } from '../src/utils/dates.js';

beforeEach(resetDb);
afterAll(() => pool.end());

const past = monthsAgo(2);
const onTime = `${past}-10`;
const summary = (auth) => http().get('/cashbook/summary').query({ period: monthsAgo(0) }).set(auth).expect(200).then((r) => r.body);

describe('cash book', () => {
    it('counts money out only after a second leader approves it', async () => {
        const { auth, group } = await createGroup();
        const second = await addLeader(auth);
        await http().put(`/groups/${group.id}`).set(auth).send({ opening_balance: 100000 }).expect(200);

        const created = await http()
            .post('/cashbook/entries')
            .set(auth)
            .send({ direction: 'out', category: 'expense', amount: 30000, occurred_at: today(), description: 'Meeting hall' })
            .expect(201);
        expect(created.body.status).toBe('pending');
        expect((await summary(auth)).expected_now).toBe(100000);

        // The leader who recorded it cannot approve it.
        await http().post(`/cashbook/entries/${created.body.id}/approve`).set(auth).expect(403);

        const approved = await http().post(`/cashbook/entries/${created.body.id}/approve`).set(second.auth).expect(200);
        expect(approved.body).toMatchObject({ status: 'approved', approved_by: second.user.id });
        expect((await summary(auth)).expected_now).toBe(70000);

        // Already approved: cannot be approved or rejected again.
        await http().post(`/cashbook/entries/${created.body.id}/approve`).set(second.auth).expect(409);
    });

    it('counts money in straight away and adds contributions', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth);
        await pay(auth, { user_id: m.id, amount: 20000, paid_at: today() });
        const res = await http()
            .post('/cashbook/entries')
            .set(auth)
            .send({ direction: 'in', category: 'other_income', amount: 5000, occurred_at: today(), description: 'Bank interest' })
            .expect(201);
        expect(res.body.status).toBe('approved');
        expect((await summary(auth)).expected_now).toBe(25000);
    });

    it('needs a reason to reject, and rejected entries never count', async () => {
        const { auth } = await createGroup();
        const second = await addLeader(auth);
        const e = await http()
            .post('/cashbook/entries')
            .set(auth)
            .send({ direction: 'out', category: 'withdrawal', amount: 1000, occurred_at: today(), description: 'Unknown withdrawal' })
            .expect(201);
        await http().post(`/cashbook/entries/${e.body.id}/reject`).set(second.auth).send({}).expect(400);
        const rejected = await http().post(`/cashbook/entries/${e.body.id}/reject`).set(second.auth).send({ reason: 'Not ours' }).expect(200);
        expect(rejected.body).toMatchObject({ status: 'rejected', reject_reason: 'Not ours' });
        expect((await summary(auth)).expected_now).toBe(0);
    });

    it('refuses a category that does not match the direction', async () => {
        const { auth } = await createGroup();
        await http()
            .post('/cashbook/entries')
            .set(auth)
            .send({ direction: 'in', category: 'withdrawal', amount: 1000, occurred_at: today(), description: 'Wrong way round' })
            .expect(400);
    });

    it('records the difference between M-Koba and the system', async () => {
        const { auth, group } = await createGroup();
        await http().put(`/groups/${group.id}`).set(auth).send({ opening_balance: 50000 }).expect(200);
        const check = await http().post('/cashbook/checks').set(auth).send({ checked_on: today(), actual_balance: 48700 }).expect(201);
        expect(check.body).toMatchObject({ expected_balance: 50000, actual_balance: 48700, difference: -1300 });
    });

    it('sends statement withdrawals and charges to the cash book for approval', async () => {
        const { auth } = await createGroup();
        const date = today().split('-').reverse().join('/');
        const csv = Buffer.from(
            ['Receipt No.,Completion Time,Details,Paid In,Withdrawn', `W1,${date},Withdrawal to - 0711111111 - X,,"20,000.00"`, `W2,${date},Withdrawal charge,,"1,300.00"`].join('\n'),
        );
        const mapping = JSON.stringify({ date: 'Completion Time', amount: 'Paid In', reference: 'Receipt No.', name: 'Details', withdrawn: 'Withdrawn' });
        const res = await http().post('/imports').set(auth).attach('file', csv, 's.csv').field('mapping', mapping).expect(201);
        expect(res.body.cashbook_rows).toBe(2);

        const pending = await http().get('/cashbook/entries').query({ status: 'pending' }).set(auth).expect(200);
        expect(pending.body.map((e) => [e.reference, e.category, e.amount]).sort()).toEqual([
            ['W1', 'withdrawal', 20000],
            ['W2', 'charges', 1300],
        ]);

        // Uploading again does not create them twice.
        const again = await http().post('/imports').set(auth).attach('file', csv, 's.csv').field('mapping', mapping).expect(201);
        expect(again.body).toMatchObject({ cashbook_rows: 0, duplicate_rows: 2 });
    });

    it('is for leaders only', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth, { password: 'member1' });
        await http().get('/cashbook/summary').set(await loginAs(m.phone, 'member1')).expect(403);
    });
});

describe('member-reported payments', () => {
    it('becomes a payment once a leader confirms it', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth, { password: 'member1' });
        const memberAuth = await loginAs(m.phone, 'member1');
        await startMonth(auth, past);

        const sub = await http().post('/me/submissions').set(memberAuth).send({ amount: 50000, paid_at: onTime, reference: 'abc123', period: past }).expect(201);
        expect(sub.body).toMatchObject({ status: 'pending', reference: 'ABC123' });

        // The member cannot approve it.
        await http().post(`/submissions/${sub.body.id}/approve`).set(memberAuth).expect(403);

        const approved = await http().post(`/submissions/${sub.body.id}/approve`).set(auth).expect(200);
        expect(approved.body.status).toBe('approved');
        expect(await dueFor(auth, m.id, past)).toMatchObject({ status: 'paid', paid_total: 50000 });

        const payments = await http().get('/payments').set(memberAuth).expect(200);
        expect(payments.body).toHaveLength(1);
        expect(payments.body[0]).toMatchObject({ source: 'member', reference: 'ABC123' });
    });

    it('refuses codes already recorded or already waiting', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth, { password: 'member1' });
        const memberAuth = await loginAs(m.phone, 'member1');
        await pay(auth, { user_id: m.id, amount: 1000, paid_at: onTime, reference: 'USED1' });

        await http().post('/me/submissions').set(memberAuth).send({ amount: 1000, paid_at: onTime, reference: 'used1' }).expect(409);
        await http().post('/me/submissions').set(memberAuth).send({ amount: 1000, paid_at: onTime, reference: 'NEW1' }).expect(201);
        await http().post('/me/submissions').set(memberAuth).send({ amount: 1000, paid_at: onTime, reference: 'NEW1' }).expect(409);
        // M-Pesa payments need a code.
        await http().post('/me/submissions').set(memberAuth).send({ amount: 1000, paid_at: onTime }).expect(400);
    });

    it("needs another leader to confirm a leader's own payment", async () => {
        const { auth } = await createGroup();
        const second = await addLeader(auth);
        const sub = await http().post('/me/submissions').set(auth).send({ amount: 1000, paid_at: onTime, reference: 'SELF1' }).expect(201);
        await http().post(`/submissions/${sub.body.id}/approve`).set(auth).expect(403);
        await http().post(`/submissions/${sub.body.id}/approve`).set(second.auth).expect(200);
    });
});

describe('receipts', () => {
    it('lets members download only their own receipts', async () => {
        const { auth } = await createGroup();
        const me = await addMember(auth, { password: 'member1' });
        const other = await addMember(auth);
        const memberAuth = await loginAs(me.phone, 'member1');
        const mine = await pay(auth, { user_id: me.id, amount: 1000, paid_at: onTime });
        const theirs = await pay(auth, { user_id: other.id, amount: 1000, paid_at: onTime });

        const res = await http().get(`/payments/${mine.body.id}/receipt`).set(memberAuth).buffer(true).expect(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toContain(`RCT-${String(mine.body.id).padStart(6, '0')}`);
        await http().get(`/payments/${theirs.body.id}/receipt`).set(memberAuth).expect(404);
    });
});

describe('audit log', () => {
    it('records edits, deletions and approvals with who did them', async () => {
        const { auth, leader } = await createGroup();
        const m = await addMember(auth, { name: 'Asha' });
        const p = await pay(auth, { user_id: m.id, amount: 30000, paid_at: onTime, reference: 'R1' });
        await http().put(`/payments/${p.body.id}`).set(auth).send({ amount: 45000 }).expect(200);
        await http().delete(`/payments/${p.body.id}`).set(auth).expect(204);

        const log = await http().get('/audit').query({ area: 'payments' }).set(auth).expect(200);
        const actions = log.body.items.map((i) => i.action);
        expect(actions).toEqual(['payment.delete', 'payment.update', 'payment.create']);
        const edit = log.body.items[1];
        expect(edit).toMatchObject({ actor_id: leader.id, subject_user_id: m.id, before: { amount: 30000 }, after: { amount: 45000 } });
        expect(edit.summary).toContain('TZS 30,000 → TZS 45,000');

        // A member's history only shows changes about them.
        const history = await http().get('/audit').query({ subject_user_id: m.id }).set(auth).expect(200);
        expect(history.body.items.every((i) => i.subject_user_id === m.id)).toBe(true);
    });

    it('is not visible to members', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth, { password: 'member1' });
        await http().get('/audit').set(await loginAs(m.phone, 'member1')).expect(403);
    });
});

describe('sessions and login protection', () => {
    it('logs out other devices when the password changes', async () => {
        const { auth } = await createGroup();
        const res = await http().post('/auth/change-password').set(auth).send({ current_password: 'secret1', new_password: 'secret9' }).expect(200);
        await http().get('/auth/me').set(auth).expect(401);
        await http().get('/auth/me').set({ Authorization: `Bearer ${res.body.token}` }).expect(200);
    });

    it('can log out all other devices', async () => {
        const { auth } = await createGroup();
        const res = await http().post('/auth/logout-all').set(auth).expect(200);
        await http().get('/auth/me').set(auth).expect(401);
        await http().get('/auth/me').set({ Authorization: `Bearer ${res.body.token}` }).expect(200);
    });

    it('logs a member out when a leader resets their password', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth, { password: 'member1' });
        const memberAuth = await loginAs(m.phone, 'member1');
        await http().put(`/users/${m.id}`).set(auth).send({ password: 'member2' }).expect(200);
        await http().get('/auth/me').set(memberAuth).expect(401);
    });

    it('blocks a phone number after 10 wrong passwords', async () => {
        const { auth } = await createGroup();
        const m = await addMember(auth, { password: 'member1' });
        for (let i = 0; i < 10; i += 1) {
            await http().post('/auth/login').send({ phone: m.phone, password: 'wrong' }).expect(401);
        }
        await http().post('/auth/login').send({ phone: m.phone, password: 'member1' }).expect(429);
    });
});

describe('group settings', () => {
    it('does not reset other settings when only one changes', async () => {
        const { auth, group } = await createGroup({ due_day: 15, late_fine: 3000 });
        const res = await http().put(`/groups/${group.id}`).set(auth).send({ name: 'Renamed' }).expect(200);
        expect(res.body).toMatchObject({ name: 'Renamed', due_day: 15, late_fine: 3000, allocation_rule: 'current_first' });
    });

    it('re-spreads payments when the payment order changes', async () => {
        const { auth, group } = await createGroup();
        const m = await addMember(auth);
        const older = monthsAgo(3);
        await startMonth(auth, older);
        await startMonth(auth, past);
        await pay(auth, { user_id: m.id, amount: 50000, paid_at: onTime });

        // Default: the month it was paid in.
        expect(await dueFor(auth, m.id, past)).toMatchObject({ paid_total: 50000 });
        expect(await dueFor(auth, m.id, older)).toMatchObject({ paid_total: 0 });

        await http().put(`/groups/${group.id}`).set(auth).send({ allocation_rule: 'oldest_first' }).expect(200);
        expect(await dueFor(auth, m.id, older)).toMatchObject({ paid_total: 50000 });
        expect(await dueFor(auth, m.id, past)).toMatchObject({ paid_total: 0 });
    });
});

describe('automatic month start', () => {
    it('starts the current month only for groups that want it, and only once', async () => {
        const a = await createGroup({ name: 'Auto' });
        const b = await createGroup({ name: 'Manual' });
        await http().put(`/groups/${b.group.id}`).set(b.auth).send({ auto_start: false }).expect(200);
        await addMember(a.auth);

        const log = () => {};
        expect(await autoStartMonths({ log })).toBe(2); // leader + member of group A
        expect(await autoStartMonths({ log })).toBe(0);

        const current = monthsAgo(0);
        const aMonths = await http().get('/dues').query({ period: current }).set(a.auth).expect(200);
        const bMonths = await http().get('/dues').query({ period: current }).set(b.auth).expect(200);
        expect(aMonths.body).toHaveLength(2);
        expect(bMonths.body).toHaveLength(0);
    });
});

describe('trend report', () => {
    it('returns one entry per month with totals', async () => {
        const { auth } = await createGroup();
        await startMonth(auth, past);
        const res = await http().get('/reports/trend').query({ months: 6 }).set(auth).expect(200);
        expect(res.body).toHaveLength(6);
        expect(res.body.map((m) => m.period)).toContain(past);
        expect(res.body.find((m) => m.period === past)).toMatchObject({ members: 1, expected: 52000, collected: 0 });
    });
});
