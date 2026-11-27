import { z } from 'zod';
import { withTransaction } from '../../config/db.js';
import * as Payments from './payment.model.js';
import * as Users from '../users/user.model.js';
import * as Dues from '../dues/due.model.js';
import * as Groups from '../groups/group.model.js';
import { receiptNumber, receiptPdf } from './receipt.js';
import { reallocateMember } from './allocation.service.js';
import { assertCanManageGroup, resolveGroupId } from '../../middleware/auth.js';
import { audit, money } from '../../utils/audit.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { today } from '../../utils/dates.js';
import { id, isoDate, optionalText, period, positiveMoney } from '../../utils/schemas.js';

const notInFuture = isoDate.refine((d) => d <= today(), 'Payment date cannot be in the future');

const fields = {
    user_id: id,
    amount: positiveMoney,
    paid_at: notInFuture,
    method: z.enum(['mpesa', 'cash', 'bank']).default('mpesa'),
    // M-Pesa transaction code or receipt number; must be unique within the group.
    reference: z
        .string()
        .trim()
        .max(100)
        .optional()
        .nullable()
        .transform((v) => (v ? v.toUpperCase() : null)),
    note: optionalText,
    // Optional: the month this payment is for. Leave out to pay the oldest open month.
    period: period.optional().nullable(),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, method: fields.method.optional() }).partial();
const listSchema = z.object({
    group_id: id.optional(),
    user_id: id.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
});

// Checks the member belongs to the group and turns "period" into the member's due id.
async function resolveTarget(client, groupId, userId, periodValue) {
    const member = await Users.findById(userId, client);
    if (!member || member.group_id !== groupId) throw badRequest('Member is not in this group');
    if (!periodValue) return null;
    const due = await Dues.findByUserAndPeriod(userId, periodValue, client);
    if (!due) throw badRequest(`${member.name} has no ${periodValue.slice(0, 7)} month yet. Start that month first.`);
    return due.id;
}

export async function list(req, res) {
    const q = listSchema.parse(req.query);
    if (req.user.role === 'member') {
        return res.json(await Payments.listPayments({ ...q, groupId: req.user.group_id, userId: req.user.id }));
    }
    const groupId = resolveGroupId(req, q.group_id);
    assertCanManageGroup(req.user, groupId);
    res.json(await Payments.listPayments({ ...q, groupId, userId: q.user_id }));
}

export async function get(req, res) {
    const payment = await Payments.findWithDetails(id.parse(req.params.id));
    if (!payment) throw notFound('Payment not found');
    if (req.user.role === 'member') {
        if (payment.user_id !== req.user.id) throw notFound('Payment not found');
    } else {
        assertCanManageGroup(req.user, payment.group_id);
    }
    res.json(payment);
}

const ref = (p) => (p.reference ? ` (${p.reference})` : '');

export async function create(req, res) {
    const data = createSchema.parse(req.body);
    const groupId = resolveGroupId(req, req.body.group_id ?? req.query.group_id);
    assertCanManageGroup(req.user, groupId);

    const paymentId = await withTransaction(async (client) => {
        const dueId = await resolveTarget(client, groupId, data.user_id, data.period);
        const newId = await Payments.createPayment(client, {
            ...data,
            group_id: groupId,
            due_id: dueId,
            source: 'manual',
            recorded_by: req.user.id,
        });
        await reallocateMember(client, data.user_id);
        const member = await Users.findById(data.user_id, client);
        await audit(client, req, {
            groupId,
            action: 'payment.create',
            entity: 'payment',
            entityId: newId,
            subjectUserId: data.user_id,
            summary: `Recorded ${money(data.amount)} from ${member.name}${ref(data)}`,
            after: await Payments.findById(newId, client),
        });
        return newId;
    });
    res.status(201).json(await Payments.findWithDetails(paymentId));
}

const PAYMENT_LABELS = { user_id: 'member', amount: 'amount', paid_at: 'date', method: 'method', reference: 'reference', note: 'note', due_id: 'month' };

export async function update(req, res) {
    const paymentId = id.parse(req.params.id);
    const changes = updateSchema.parse(req.body);
    const existing = await Payments.findById(paymentId);
    if (!existing) throw notFound('Payment not found');
    assertCanManageGroup(req.user, existing.group_id);

    await withTransaction(async (client) => {
        const userId = changes.user_id ?? existing.user_id;
        if (changes.user_id !== undefined || changes.period !== undefined) {
            // Changing the member clears the chosen month unless a new period is given too.
            changes.due_id = await resolveTarget(client, existing.group_id, userId, changes.period ?? null);
        }
        delete changes.period;
        await Payments.updatePayment(client, paymentId, changes);
        await reallocateMember(client, userId);
        if (userId !== existing.user_id) await reallocateMember(client, existing.user_id);

        const after = await Payments.findById(paymentId, client);
        const changed = Object.keys(PAYMENT_LABELS).filter((k) => String(existing[k] ?? '') !== String(after[k] ?? ''));
        if (changed.length > 0) {
            const member = await Users.findById(existing.user_id, client);
            const amountChange = changed.includes('amount') ? `: ${money(existing.amount)} → ${money(after.amount)}` : '';
            await audit(client, req, {
                groupId: existing.group_id,
                action: 'payment.update',
                entity: 'payment',
                entityId: paymentId,
                subjectUserId: userId,
                summary: `Edited payment from ${member.name}${ref(existing)} (${changed.map((k) => PAYMENT_LABELS[k]).join(', ')})${amountChange}`,
                before: Object.fromEntries(changed.map((k) => [k, existing[k]])),
                after: Object.fromEntries(changed.map((k) => [k, after[k]])),
            });
        }
    });
    res.json(await Payments.findWithDetails(paymentId));
}

export async function remove(req, res) {
    const paymentId = id.parse(req.params.id);
    const existing = await Payments.findById(paymentId);
    if (!existing) throw notFound('Payment not found');
    assertCanManageGroup(req.user, existing.group_id);

    await withTransaction(async (client) => {
        await Payments.deletePayment(client, paymentId);
        await reallocateMember(client, existing.user_id);
        const member = await Users.findById(existing.user_id, client);
        await audit(client, req, {
            groupId: existing.group_id,
            action: 'payment.delete',
            entity: 'payment',
            entityId: paymentId,
            subjectUserId: existing.user_id,
            summary: `Deleted payment of ${money(existing.amount)} from ${member.name}${ref(existing)}`,
            before: existing,
        });
    });
    res.status(204).end();
}

// One-page PDF receipt. Members can only get receipts for their own payments.
export async function receipt(req, res) {
    const payment = await Payments.findWithDetails(id.parse(req.params.id));
    if (!payment) throw notFound('Payment not found');
    if (req.user.role === 'member') {
        if (payment.user_id !== req.user.id) throw notFound('Payment not found');
    } else {
        assertCanManageGroup(req.user, payment.group_id);
    }
    const group = await Groups.findById(payment.group_id);
    const months = await Promise.all(payment.applied_to.map((a) => Dues.findStatus(a.due_id)));
    const pdf = await receiptPdf({ payment, group, months: months.filter(Boolean) });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${receiptNumber(payment.id)}.pdf"`);
    res.send(pdf);
}
