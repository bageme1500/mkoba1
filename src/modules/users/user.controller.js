import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTransaction } from '../../config/db.js';
import * as Users from './user.model.js';
import { audit } from '../../utils/audit.js';
import { assertCanManageGroup, assertCanViewMember, resolveGroupId } from '../../middleware/auth.js';
import { badRequest, forbidden, notFound } from '../../utils/httpError.js';
import { id, isoDate, password, phone } from '../../utils/schemas.js';

const email = z.email().optional().nullable();

const createSchema = z.object({
    group_id: id.optional(),
    name: z.string().trim().min(1).max(100),
    phone,
    email,
    role: z.enum(['member', 'leader', 'admin']).default('member'),
    // Optional: only members who should log in need a password.
    password: password.optional(),
    joined_at: isoDate.optional(),
});

const updateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: phone.optional(),
    email,
    role: z.enum(['member', 'leader']).optional(),
    active: z.boolean().optional(),
    password: password.optional(),
    joined_at: isoDate.optional(),
});

async function loadMember(req) {
    const member = await Users.findById(id.parse(req.params.id));
    if (!member) throw notFound('Member not found');
    return member;
}

export async function list(req, res) {
    const groupId = resolveGroupId(req, req.query.group_id);
    assertCanManageGroup(req.user, groupId);
    res.json(await Users.listUsers(groupId, { includeInactive: req.query.include_inactive === 'true' }));
}

export async function get(req, res) {
    const member = await loadMember(req);
    assertCanViewMember(req.user, member);
    res.json(member);
}

export async function create(req, res) {
    const data = createSchema.parse(req.body);

    if (data.role === 'admin') {
        if (req.user.role !== 'admin') throw forbidden();
        data.group_id = null;
    } else {
        data.group_id = resolveGroupId(req, data.group_id ?? req.query.group_id);
        assertCanManageGroup(req.user, data.group_id);
    }
    if (data.password) data.password_hash = await bcrypt.hash(data.password, 10);

    const created = await withTransaction(async (client) => {
        const user = await Users.createUser(data, client);
        await audit(client, req, {
            groupId: user.group_id,
            action: 'member.create',
            entity: 'member',
            entityId: user.id,
            subjectUserId: user.id,
            summary: `Added ${user.role} ${user.name}`,
            after: user,
        });
        return user;
    });
    res.status(201).json(created);
}

const FIELD_LABELS = { name: 'name', phone: 'phone', email: 'email', role: 'role', active: 'active', joined_at: 'joining date', language: 'language' };
const publicUser = ({ token_version, ...user }) => user; // eslint-disable-line no-unused-vars

async function saveMemberChanges(req, member, changes, summaryPrefix) {
    return withTransaction(async (client) => {
        const updated = await Users.updateUser(member.id, changes, client);
        const changed = Object.keys(FIELD_LABELS).filter((k) => changes[k] !== undefined && String(member[k]) !== String(updated[k]));
        const parts = changed.map((k) => FIELD_LABELS[k]);
        if (changes.password_hash) parts.push('password');
        if (parts.length > 0) {
            await audit(client, req, {
                groupId: member.group_id,
                action: changes.active === false ? 'member.deactivate' : 'member.update',
                entity: 'member',
                entityId: member.id,
                subjectUserId: member.id,
                summary: `${summaryPrefix} ${member.name}${changes.active === false ? '' : `: ${parts.join(', ')}`}`,
                before: Object.fromEntries(changed.map((k) => [k, member[k]])),
                after: Object.fromEntries(changed.map((k) => [k, updated[k]])),
            });
        }
        return publicUser(updated);
    });
}

export async function update(req, res) {
    const member = await loadMember(req);
    if (member.role === 'admin' && req.user.role !== 'admin') throw forbidden();
    if (member.group_id) assertCanManageGroup(req.user, member.group_id);

    const changes = updateSchema.parse(req.body);
    // Stop leaders locking themselves out of their own group.
    if (member.id === req.user.id && (changes.active === false || (changes.role && changes.role !== member.role))) {
        throw badRequest('You cannot deactivate yourself or change your own role');
    }
    if (changes.password) changes.password_hash = await bcrypt.hash(changes.password, 10);
    delete changes.password;

    res.json(await saveMemberChanges(req, member, changes, changes.active === true && !member.active ? 'Reactivated' : 'Edited'));
}

// Members are never hard-deleted so their payment history stays in the reports.
export async function deactivate(req, res) {
    const member = await loadMember(req);
    if (member.group_id) assertCanManageGroup(req.user, member.group_id);
    else if (req.user.role !== 'admin') throw forbidden();
    if (member.id === req.user.id) throw badRequest('You cannot deactivate yourself');

    res.json(await saveMemberChanges(req, member, { active: false }, 'Deactivated'));
}
