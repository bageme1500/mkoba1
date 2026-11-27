import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { withTransaction } from '../../config/db.js';
import { signToken } from '../../middleware/auth.js';
import * as Users from '../users/user.model.js';
import * as Groups from '../groups/group.model.js';
import { groupSchema } from '../groups/group.controller.js';
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
        return Users.createUser({ ...data.leader, password_hash, role: 'leader', group_id: group.id }, client);
    });
    res.status(201).json({ token: signToken(leader), ...(await session(leader.id)) });
}

export async function me(req, res) {
    res.json(await session(req.user.id));
}

export async function changePassword(req, res) {
    const data = changePasswordSchema.parse(req.body);
    const hash = await Users.getPasswordHash(req.user.id);
    if (!hash || !(await bcrypt.compare(data.current_password, hash))) {
        throw badRequest('Current password is wrong');
    }
    await Users.updateUser(req.user.id, { password_hash: await bcrypt.hash(data.new_password, 10) });
    res.status(204).end();
}
