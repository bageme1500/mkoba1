import { z } from 'zod';
import db, { withTransaction } from '../../config/db.js';
import * as Submissions from './submission.model.js';
import * as Payments from '../payments/payment.model.js';
import * as Dues from '../dues/due.model.js';
import { reallocateMember } from '../payments/allocation.service.js';
import { assertCanManageGroup, resolveGroupId } from '../../middleware/auth.js';
import { audit, money } from '../../utils/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../../utils/httpError.js';
import { monthLabel, today } from '../../utils/dates.js';
import { id, isoDate, optionalText, period, positiveMoney } from '../../utils/schemas.js';

const submitSchema = z.object({
    amount: positiveMoney,
    paid_at: isoDate.refine((d) => d <= today(), 'Payment date cannot be in the future'),
    method: z.enum(['mpesa', 'cash', 'bank']).default('mpesa'),
    // The M-Pesa code is what lets a leader check the payment, so it is required for M-Pesa.
    reference: z
        .string()
        .trim()
        .max(100)
        .optional()
        .nullable()
        .transform((v) => (v ? v.toUpperCase() : null)),
    period: period.optional().nullable(),
    note: optionalText,
}).refine((s) => s.method !== 'mpesa' || s.reference, { message: 'Enter the M-Pesa code from the confirmation SMS', path: ['reference'] });

const listSchema = z.object({ group_id: id.optional(), status: z.enum(['pending', 'approved', 'rejected']).optional() });
const rejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

const ref = (s) => (s.reference ? ` (${s.reference})` : '');

// A member says "I have paid". A leader checks it against M-Koba and approves it.
export async function submit(req, res) {
    if (!req.user.group_id) throw badRequest('Admins are not members of a group');
    const data = submitSchema.parse(req.body);

    if (data.reference) {
        const { rows } = await db.query('SELECT 1 FROM payments WHERE group_id = $1 AND reference = $2', [req.user.group_id, data.reference]);
        if (rows.length) throw conflict('This M-Pesa code is already recorded as a payment');
    }
    if (data.period && !(await Dues.findByUserAndPeriod(req.user.id, data.period))) {
        throw badRequest(`${monthLabel(data.period)} has not been started for you yet`);
    }

    const submissionId = await withTransaction(async (client) => {
        const newId = await Submissions.create(client, { ...data, group_id: req.user.group_id, user_id: req.user.id });
        await audit(client, req, {
            action: 'submission.create',
            entity: 'submission',
            entityId: newId,
            subjectUserId: req.user.id,
            summary: `${req.user.name} reported paying ${money(data.amount)}${ref(data)}`,
        });
        return newId;
    });
    res.status(201).json(await Submissions.findById(submissionId));
}

export async function mine(req, res) {
    if (!req.user.group_id) return res.json([]);
    res.json(await Submissions.list({ groupId: req.user.group_id, userId: req.user.id }));
}

export async function list(req, res) {
    const q = listSchema.parse(req.query);
    const groupId = resolveGroupId(req, q.group_id);
    assertCanManageGroup(req.user, groupId);
    res.json(await Submissions.list({ groupId, status: q.status }));
}

export async function counts(req, res) {
    const groupId = resolveGroupId(req, req.query.group_id);
    assertCanManageGroup(req.user, groupId);
    res.json(await Submissions.counts(groupId, req.user.id));
}

// Load and lock a pending submission the current leader may review.
async function loadForReview(client, req) {
    const submission = await Submissions.findById(id.parse(req.params.id), client, { lock: true });
    if (!submission) throw notFound('Submission not found');
    assertCanManageGroup(req.user, submission.group_id);
    if (submission.status !== 'pending') throw conflict(`This submission is already ${submission.status}`);
    if (req.user.role !== 'admin' && submission.user_id === req.user.id) throw forbidden('Another leader must approve your own payment');
    return submission;
}

export async function approve(req, res) {
    const submissionId = await withTransaction(async (client) => {
        const s = await loadForReview(client, req);
        const due = s.period ? await Dues.findByUserAndPeriod(s.user_id, `${s.period}-01`, client) : null;
        const paymentId = await Payments.createPayment(client, {
            group_id: s.group_id,
            user_id: s.user_id,
            due_id: due?.id ?? null,
            amount: s.amount,
            paid_at: s.paid_at,
            method: s.method,
            reference: s.reference,
            note: s.note ? `Reported by member: ${s.note}` : 'Reported by member',
            source: 'member',
            recorded_by: req.user.id,
        });
        await reallocateMember(client, s.user_id);
        await Submissions.review(client, s.id, { status: 'approved', reviewerId: req.user.id, paymentId });
        await audit(client, req, {
            groupId: s.group_id,
            action: 'submission.approve',
            entity: 'payment',
            entityId: paymentId,
            subjectUserId: s.user_id,
            summary: `Approved ${s.member_name}'s reported payment of ${money(s.amount)}${ref(s)}`,
        });
        return s.id;
    });
    res.json(await Submissions.findById(submissionId));
}

export async function reject(req, res) {
    const { reason } = rejectSchema.parse(req.body);
    const submissionId = await withTransaction(async (client) => {
        const s = await loadForReview(client, req);
        await Submissions.review(client, s.id, { status: 'rejected', reviewerId: req.user.id, reason });
        await audit(client, req, {
            groupId: s.group_id,
            action: 'submission.reject',
            entity: 'submission',
            entityId: s.id,
            subjectUserId: s.user_id,
            summary: `Rejected ${s.member_name}'s reported payment of ${money(s.amount)}${ref(s)}. Reason: ${reason}`,
        });
        return s.id;
    });
    res.json(await Submissions.findById(submissionId));
}
