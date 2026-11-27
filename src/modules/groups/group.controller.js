import { z } from 'zod';
import { withTransaction } from '../../config/db.js';
import * as Groups from './group.model.js';
import { reallocateGroup } from '../payments/allocation.service.js';
import { assertCanManageGroup } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { forbidden, notFound } from '../../utils/httpError.js';
import { id, isoDate, money, positiveMoney } from '../../utils/schemas.js';

// Fields without defaults: used as-is for updates, so leaving a field out never resets it.
const fields = {
    name: z.string().trim().min(1).max(100),
    monthly_amount: positiveMoney,
    due_day: z.coerce.number().int().min(1).max(28),
    late_fine: money,
    currency: z.string().trim().toUpperCase().length(3),
    allocation_rule: z.enum(['current_first', 'oldest_first']),
    auto_start: z.boolean(),
    opening_balance: money,
    opening_balance_date: isoDate.nullable(),
};

export const groupSchema = z.object({
    ...fields,
    due_day: fields.due_day.default(28),
    late_fine: fields.late_fine.default(0),
    currency: fields.currency.default('TZS'),
    allocation_rule: fields.allocation_rule.default('current_first'),
    auto_start: fields.auto_start.default(true),
    opening_balance: fields.opening_balance.default(0),
    opening_balance_date: fields.opening_balance_date.optional(),
});
const updateSchema = z.object(fields).partial();

const LABELS = {
    name: 'name',
    monthly_amount: 'monthly amount',
    due_day: 'deadline day',
    late_fine: 'late fine',
    currency: 'currency',
    allocation_rule: 'payment order',
    auto_start: 'automatic month start',
    opening_balance: 'opening balance',
    opening_balance_date: 'opening balance date',
};

async function loadGroup(req) {
    const group = await Groups.findById(id.parse(req.params.id));
    if (!group) throw notFound('Group not found');
    return group;
}

export async function list(req, res) {
    if (req.user.role === 'admin') return res.json(await Groups.listGroups());
    res.json([await Groups.findById(req.user.group_id)]);
}

export async function get(req, res) {
    const group = await loadGroup(req);
    if (req.user.role !== 'admin' && req.user.group_id !== group.id) throw forbidden();
    res.json(group);
}

export async function create(req, res) {
    const group = await withTransaction(async (client) => {
        const created = await Groups.createGroup(groupSchema.parse(req.body), client);
        await audit(client, req, { groupId: created.id, action: 'group.create', entity: 'group', entityId: created.id, summary: `Created group ${created.name}`, after: created });
        return created;
    });
    res.status(201).json(group);
}

// Amount, deadline and fine changes only affect months started afterwards.
// Changing the payment order re-spreads every member's payments straight away.
export async function update(req, res) {
    const before = await loadGroup(req);
    assertCanManageGroup(req.user, before.id);
    const changes = updateSchema.parse(req.body);

    const after = await withTransaction(async (client) => {
        const updated = await Groups.updateGroup(before.id, changes, client);
        if (changes.allocation_rule && changes.allocation_rule !== before.allocation_rule) {
            await reallocateGroup(client, before.id);
        }
        const changed = Object.keys(changes).filter((k) => String(before[k]) !== String(updated[k]));
        if (changed.length > 0) {
            await audit(client, req, {
                groupId: before.id,
                action: 'group.update',
                entity: 'group',
                entityId: before.id,
                summary: `Changed group settings: ${changed.map((k) => LABELS[k]).join(', ')}`,
                before: Object.fromEntries(changed.map((k) => [k, before[k]])),
                after: Object.fromEntries(changed.map((k) => [k, updated[k]])),
            });
        }
        return updated;
    });
    res.json(after);
}

export async function remove(req, res) {
    const group = await loadGroup(req);
    await Groups.deleteGroup(group.id);
    res.status(204).end();
}
