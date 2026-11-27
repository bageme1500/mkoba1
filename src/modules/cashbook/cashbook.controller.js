import { z } from 'zod';
import { withTransaction } from '../../config/db.js';
import * as Cash from './cashbook.model.js';
import { ledger } from './cashbook.service.js';
import * as Exports from './cashbook.export.js';
import { assertCanManageGroup, resolveGroupId } from '../../middleware/auth.js';
import { audit, money } from '../../utils/audit.js';
import { conflict, forbidden, notFound } from '../../utils/httpError.js';
import { currentPeriod, endOfMonth, today } from '../../utils/dates.js';
import { id, isoDate, optionalText, period, positiveMoney } from '../../utils/schemas.js';

const notInFuture = isoDate.refine((d) => d <= today(), 'Date cannot be in the future');

export const CATEGORY_LABELS = {
    withdrawal: 'Withdrawal',
    expense: 'Expense',
    charges: 'M-Pesa charges',
    payout: 'Payout to members',
    other_out: 'Other money out',
    other_income: 'Other income',
    adjustment: 'Adjustment',
};

const entrySchema = z
    .object({
        direction: z.enum(['in', 'out']),
        category: z.enum([...Cash.OUT_CATEGORIES, ...Cash.IN_CATEGORIES]),
        amount: positiveMoney,
        occurred_at: notInFuture,
        description: z.string().trim().min(3, 'Say what the money was for').max(300),
        reference: z
            .string()
            .trim()
            .max(100)
            .optional()
            .nullable()
            .transform((v) => (v ? v.toUpperCase() : null)),
    })
    .refine((e) => (e.direction === 'out' ? Cash.OUT_CATEGORIES : Cash.IN_CATEGORIES).includes(e.category), {
        message: 'This category does not match money in/out',
        path: ['category'],
    });

const listSchema = z.object({
    group_id: id.optional(),
    period: period.optional(),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
});
const rejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });
const checkSchema = z.object({ checked_on: notInFuture, actual_balance: z.coerce.number().finite(), note: optionalText });
const reportSchema = z.object({ period: period.optional(), format: z.enum(['json', 'xlsx', 'pdf']).default('json'), group_id: id.optional() });

function groupFor(req, requested) {
    const groupId = resolveGroupId(req, requested ?? req.query.group_id);
    assertCanManageGroup(req.user, groupId);
    return groupId;
}

const describe = (e) => `${CATEGORY_LABELS[e.category].toLowerCase()} of ${money(e.amount)}: ${e.description}`;

export async function listEntries(req, res) {
    const q = listSchema.parse(req.query);
    const groupId = groupFor(req, q.group_id);
    const p = q.period;
    res.json(await Cash.listEntries({ groupId, status: q.status, from: p, to: p ? endOfMonth(p) : undefined }));
}

// Money out waits for a second leader. Money in counts straight away.
export async function createEntry(req, res) {
    const data = entrySchema.parse(req.body);
    const groupId = groupFor(req, req.body.group_id);
    const out = data.direction === 'out';

    const entryId = await withTransaction(async (client) => {
        const newId = await Cash.createEntry(client, {
            ...data,
            group_id: groupId,
            status: out ? 'pending' : 'approved',
            created_by: req.user.id,
            approved_by: out ? null : req.user.id,
            approved_at: out ? null : new Date(),
        });
        await audit(client, req, {
            groupId,
            action: 'cash.create',
            entity: 'cash_entry',
            entityId: newId,
            summary: `Recorded ${describe(data)}${out ? ' (waiting for approval)' : ''}`,
            after: data,
        });
        return newId;
    });
    res.status(201).json(await Cash.findById(entryId));
}

async function loadPending(req) {
    const entry = await Cash.findById(id.parse(req.params.id));
    if (!entry) throw notFound('Entry not found');
    assertCanManageGroup(req.user, entry.group_id);
    if (entry.status !== 'pending') throw conflict(`This entry is already ${entry.status}`);
    return entry;
}

// A different leader (or an admin) must approve: one person can't move money alone.
function assertSecondPerson(req, entry) {
    if (req.user.role !== 'admin' && entry.created_by === req.user.id) {
        throw forbidden('Another leader must approve money you recorded');
    }
}

export async function approve(req, res) {
    const entry = await loadPending(req);
    assertSecondPerson(req, entry);
    await withTransaction(async (client) => {
        await Cash.review(client, entry.id, { status: 'approved', reviewerId: req.user.id });
        await audit(client, req, {
            groupId: entry.group_id,
            action: 'cash.approve',
            entity: 'cash_entry',
            entityId: entry.id,
            summary: `Approved ${describe(entry)} (recorded by ${entry.created_by_name ?? 'unknown'})`,
        });
    });
    res.json(await Cash.findById(entry.id));
}

export async function reject(req, res) {
    const entry = await loadPending(req);
    assertSecondPerson(req, entry);
    const { reason } = rejectSchema.parse(req.body);
    await withTransaction(async (client) => {
        await Cash.review(client, entry.id, { status: 'rejected', reviewerId: req.user.id, reason });
        await audit(client, req, {
            groupId: entry.group_id,
            action: 'cash.reject',
            entity: 'cash_entry',
            entityId: entry.id,
            summary: `Rejected ${describe(entry)}. Reason: ${reason}`,
        });
    });
    res.json(await Cash.findById(entry.id));
}

// Only pending entries can be withdrawn, by whoever recorded them (or an admin).
export async function remove(req, res) {
    const entry = await loadPending(req);
    if (req.user.role !== 'admin' && entry.created_by !== req.user.id) throw forbidden('Only the leader who recorded it can delete it');
    await withTransaction(async (client) => {
        await Cash.deleteEntry(client, entry.id);
        await audit(client, req, {
            groupId: entry.group_id,
            action: 'cash.delete',
            entity: 'cash_entry',
            entityId: entry.id,
            summary: `Deleted pending ${describe(entry)}`,
            before: entry,
        });
    });
    res.status(204).end();
}

export async function summary(req, res) {
    const q = reportSchema.parse(req.query);
    const groupId = groupFor(req, q.group_id);
    const book = await ledger(groupId, q.period ?? currentPeriod());
    const [pending, leaders, checks, expectedNow] = await Promise.all([
        Cash.pendingCount(groupId),
        Cash.activeLeaderCount(groupId),
        Cash.listChecks(groupId),
        Cash.expectedBalance(groupId, today()),
    ]);
    res.json({ ...book, expected_now: expectedNow, pending, leader_count: leaders, last_check: checks[0] ?? null });
}

export async function report(req, res) {
    const q = reportSchema.parse(req.query);
    const groupId = groupFor(req, q.group_id);
    const book = await ledger(groupId, q.period ?? currentPeriod());
    if (q.format === 'json') return res.json(book);
    const slug = book.group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const buffer = q.format === 'xlsx' ? await Exports.cashbookXlsx(book) : await Exports.cashbookPdf(book);
    res.set('Content-Type', q.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${slug}-cashbook-${book.period}.${q.format}"`);
    res.send(Buffer.from(buffer));
}

export async function listChecks(req, res) {
    res.json(await Cash.listChecks(groupFor(req)));
}

// The leader types the real M-Koba balance; the system stores its own figure next to it.
export async function createCheck(req, res) {
    const data = checkSchema.parse(req.body);
    const groupId = groupFor(req, req.body.group_id);
    const check = await withTransaction(async (client) => {
        const expected = await Cash.expectedBalance(groupId, data.checked_on, client);
        const created = await Cash.createCheck(client, { ...data, group_id: groupId, expected_balance: expected, created_by: req.user.id });
        const diff = Math.round((data.actual_balance - expected) * 100) / 100;
        await audit(client, req, {
            groupId,
            action: 'cash.check',
            entity: 'balance_check',
            entityId: created.id,
            summary: `Checked M-Koba balance on ${data.checked_on}: real ${money(data.actual_balance)}, expected ${money(expected)}${diff === 0 ? ' (matches)' : ` (difference ${money(diff)})`}`,
        });
        return created;
    });
    res.status(201).json(check);
}
