import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTransaction } from '../../config/db.js';
import { signToken } from '../../middleware/auth.js';
import * as Users from '../users/user.model.js';
import * as Groups from '../groups/group.model.js';
import { groupSchema } from '../groups/group.controller.js';
import { audit } from '../../utils/audit.js';
import { badRequest, unauthorized } from '../../utils/httpError.js';
import { password, phone } from '../../utils/schemas.js';

const loginSchema = z.object({ phone, password: z.string().min(1) });

const registerSchema = z.object({
    group: groupSchema,
    leader: z.object({
        name: z.string().trim().min(1).max(100),
        phone,
        email: z.email().optional().nullable(),
        password,
    }),
});

const changePasswordSchema = z.object({ current_password: z.string().min(1), new_password: password });
const updateMeSchema = z.object({ language: z.enum(['sw', 'en']).optional() });

async function session(userId) {
    const user = await Users.findById(userId);
    const group = user.group_id ? await Groups.findById(user.group_id) : null;
    return { user, group };
}

export async function login(req, res) {
    const { phone: p, password: pw } = loginSchema.parse(req.body);
    const user = await Users.findForLogin(p);
    const ok = user && user.active && user.password_hash && (await bcrypt.compare(pw, user.password_hash));
    if (!ok) throw unauthorized('Wrong phone number or password');
    res.json({ token: signToken(user), ...(await session(user.id)) });
}

// A new M-Koba group signs up: creates the group and its first leader in one step.
export async function registerGroup(req, res) {
    const data = registerSchema.parse(req.body);
    const password_hash = await bcrypt.hash(data.leader.password, 10);
    const leader = await withTransaction(async (client) => {
        const group = await Groups.createGroup(data.group, client);
        const created = await Users.createUser({ ...data.leader, password_hash, role: 'leader', group_id: group.id }, client);
        await audit(client, { user: created }, {
            groupId: group.id,
            action: 'group.create',
            entity: 'group',
            entityId: group.id,
            summary: `Registered group ${group.name} with ${created.name} as leader`,
        });
        return created;
    });
    res.status(201).json({ token: signToken(leader), ...(await session(leader.id)) });
}

export async function me(req, res) {
    res.json(await session(req.user.id));
}

export async function updateMe(req, res) {
    await Users.updateUser(req.user.id, updateMeSchema.parse(req.body));
    res.json(await session(req.user.id));
}

// Changing the password logs out every other device; this device gets a fresh token.
export async function changePassword(req, res) {
    const data = changePasswordSchema.parse(req.body);
    const hash = await Users.getPasswordHash(req.user.id);
    if (!hash || !(await bcrypt.compare(data.current_password, hash))) {
        throw badRequest('Current password is wrong');
    }
    const updated = await withTransaction(async (client) => {
        const u = await Users.updateUser(req.user.id, { password_hash: await bcrypt.hash(data.new_password, 10) }, client);
        await audit(client, req, { action: 'user.password', entity: 'user', entityId: req.user.id, subjectUserId: req.user.id, summary: `${req.user.name} changed their password` });
        return u;
    });
    res.json({ token: signToken(updated) });
}

export async function logoutAll(req, res) {
    const updated = await withTransaction(async (client) => {
        const u = await Users.bumpTokenVersion(req.user.id, client);
        await audit(client, req, { action: 'user.logout_all', entity: 'user', entityId: req.user.id, subjectUserId: req.user.id, summary: `${req.user.name} logged out of all devices` });
        return u;
    });
    res.json({ token: signToken(updated) });
}
