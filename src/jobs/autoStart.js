// Starts the current month for every group that has automatic start switched on.
// Runs when the server starts and then every hour; starting a month is safe to
// repeat, so running often only ever adds what is missing (e.g. a new member).
import pool, { withTransaction } from '../config/db.js';
import { startMonth } from '../modules/dues/due.service.js';
import { audit } from '../utils/audit.js';
import { currentPeriod, monthLabel } from '../utils/dates.js';

export async function autoStartMonths({ period = currentPeriod(), log = console.error } = {}) {
    const { rows: groups } = await pool.query('SELECT * FROM groups WHERE auto_start');
    let started = 0;
    for (const group of groups) {
        try {
            started += await withTransaction(async (client) => {
                const userIds = await startMonth(client, group, period);
                if (userIds.length > 0) {
                    await audit(client, null, {
                        groupId: group.id,
                        action: 'month.start',
                        entity: 'month',
                        summary: `Started ${monthLabel(period)} automatically for ${userIds.length} member(s)`,
                    });
                }
                return userIds.length;
            });
        } catch (err) {
            log(`Automatic month start failed for group ${group.id}: ${err.message}`);
        }
    }
    return started;
}

export function scheduleAutoStart({ everyMs = 60 * 60 * 1000 } = {}) {
    const run = () =>
        autoStartMonths()
            .then((n) => n > 0 && console.log(`Started the current month for ${n} member(s)`))
            .catch((err) => console.error('Automatic month start failed:', err.message));
    run();
    const timer = setInterval(run, everyMs);
    timer.unref();
    return timer;
}
