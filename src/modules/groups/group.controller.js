import { z } from 'zod';
import * as Groups from './group.model.js';
import { assertCanManageGroup } from '../../middleware/auth.js';
import { forbidden, notFound } from '../../utils/httpError.js';
import { id, money, positiveMoney } from '../../utils/schemas.js';

export const groupSchema = z.object({
    name: z.string().trim().min(1).max(100),
    monthly_amount: positiveMoney,
    due_day: z.coerce.number().int().min(1).max(28).default(28),
    late_fine: money.default(0),
    currency: z.string().trim().toUpperCase().length(3).default('TZS'),
});

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
    res.status(201).json(await Groups.createGroup(groupSchema.parse(req.body)));
}

// Changing the amount, deadline or fine only affects months generated afterwards.
export async function update(req, res) {
    const group = await loadGroup(req);
    assertCanManageGroup(req.user, group.id);
    res.json(await Groups.updateGroup(group.id, groupSchema.partial().parse(req.body)));
}

export async function remove(req, res) {
    const group = await loadGroup(req);
    await Groups.deleteGroup(group.id);
    res.status(204).end();
}
