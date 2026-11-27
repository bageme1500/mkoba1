import express from 'express';
import { z } from 'zod';
import db from '../../config/db.js';
import { assertCanManageGroup, requireAuth, requireRole, resolveGroupId } from '../../middleware/auth.js';
import { id, isoDate } from '../../utils/schemas.js';

// What each filter on the Activity page covers.
const AREAS = {
    payments: ['payment', 'submission'],
    cashbook: ['cash_entry', 'balance_check'],
    members: ['member', 'user'],
    months: ['month'],
    imports: ['import'],
    settings: ['group'],
};

const querySchema = z.object({
    group_id: id.optional(),
    area: z.enum(Object.keys(AREAS)).optional(),
    actor_id: id.optional(),
    subject_user_id: id.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    // Paging: pass the last id you have to get older entries.
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

// GET /audit: newest first, filtered, paged by id.
async function list(req, res) {
    const q = querySchema.parse(req.query);
    const groupId = resolveGroupId(req, q.group_id);
    assertCanManageGroup(req.user, groupId);

    const where = ['a.group_id = $1'];
    const params = [groupId];
    const add = (sql, value) => {
        params.push(value);
        where.push(sql.replaceAll('?', `$${params.length}`));
    };
    if (q.area) add('a.entity = ANY(?::text[])', AREAS[q.area]);
    if (q.actor_id) add('a.actor_id = ?', q.actor_id);
    if (q.subject_user_id) add('a.subject_user_id = ?', q.subject_user_id);
    if (q.from) add("a.created_at >= (?::date)::timestamp AT TIME ZONE current_setting('TimeZone')", q.from);
    if (q.to) add("a.created_at < ((?::date + 1)::timestamp AT TIME ZONE current_setting('TimeZone'))", q.to);
    if (q.before) add('a.id < ?', q.before);
    params.push(q.limit + 1);

    const { rows } = await db.query(
        `SELECT a.id, a.action, a.entity, a.entity_id, a.summary, a.before, a.after, a.created_at,
                a.actor_id, u.name AS actor_name, a.subject_user_id, s.name AS subject_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN users s ON s.id = a.subject_user_id
         WHERE ${where.join(' AND ')}
         ORDER BY a.id DESC
         LIMIT $${params.length}`,
        params,
    );
    const more = rows.length > q.limit;
    const items = rows.slice(0, q.limit).map((r) => ({ ...r, id: Number(r.id) }));
    res.json({ items, next_before: more ? items[items.length - 1].id : null });
}

const router = express.Router();
router.get('/', requireAuth, requireRole('admin', 'leader'), list);
export default router;
