// Writes one line to the audit log. Always call it with the same transaction
// client as the change it describes, so the change and its log entry are saved
// (or rolled back) together.
const SECRET_KEYS = new Set(['password_hash', 'password', 'token_version']);

function clean(value) {
    if (!value || typeof value !== 'object') return value ?? null;
    return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_KEYS.has(k)));
}

const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const money = (n) => `TZS ${fmt.format(Number(n))}`;

/**
 * @param client  transaction client (or pool)
 * @param req     the request (for the actor); null for system actions
 * @param entry   { action, entity, entityId, groupId, subjectUserId, summary, before, after }
 */
export async function audit(client, req, entry) {
    await client.query(
        `INSERT INTO audit_log (group_id, actor_id, action, entity, entity_id, subject_user_id, summary, before, after)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            entry.groupId ?? req?.user?.group_id ?? null,
            req?.user?.id ?? null,
            entry.action,
            entry.entity,
            entry.entityId ?? null,
            entry.subjectUserId ?? null,
            entry.summary,
            clean(entry.before),
            clean(entry.after),
        ],
    );
}
