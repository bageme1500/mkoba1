import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import db from '../config/db.js';
import { badRequest, forbidden, unauthorized } from '../utils/httpError.js';

// `ver` must match the user's token_version; bumping it logs the user out everywhere.
export const signToken = (user) =>
    jwt.sign({ sub: user.id, ver: user.token_version ?? 0 }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

// Reads "Authorization: Bearer <token>" and loads the current user into req.user.
// The user is re-read on every request so deactivated users and role changes take effect at once.
export async function requireAuth(req, res, next) {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let payload;
    try {
        payload = jwt.verify(token, env.jwtSecret);
    } catch {
        throw unauthorized('Your session has expired, please log in again');
    }

    const { rows } = await db.query(
        'SELECT id, group_id, name, phone, role, active, language, token_version FROM users WHERE id = $1',
        [payload.sub],
    );
    const user = rows[0];
    if (!user || !user.active) throw unauthorized();
    if ((payload.ver ?? 0) !== user.token_version) throw unauthorized('You were logged out. Please log in again.');
    req.user = user;
    next();
}

export const requireRole =
    (...roles) =>
    (req, res, next) => {
        if (!roles.includes(req.user.role)) throw forbidden();
        next();
    };

// Which group a request works on. Leaders and members are locked to their own group;
// admins must say which group with ?group_id= (or a body field).
export function resolveGroupId(req, requested) {
    const user = req.user;
    if (user.role === 'admin') {
        const gid = Number(requested);
        if (!Number.isInteger(gid) || gid <= 0) throw badRequest('group_id is required');
        return gid;
    }
    if (requested !== undefined && requested !== null && requested !== '' && Number(requested) !== user.group_id) {
        throw forbidden();
    }
    return user.group_id;
}

export function assertCanManageGroup(user, groupId) {
    if (user.role === 'admin') return;
    if (user.role === 'leader' && user.group_id === groupId) return;
    throw forbidden();
}

export function assertCanViewMember(user, member) {
    if (user.role === 'admin') return;
    if (user.id === member.id) return;
    if (user.role === 'leader' && user.group_id === member.group_id) return;
    throw forbidden();
}
