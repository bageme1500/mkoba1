import * as Dues from './due.model.js';
import { reallocateMember } from '../payments/allocation.service.js';
import { dueDateFor, endOfMonth } from '../../utils/dates.js';

// Creates `period` (YYYY-MM-01) for every active member of the group who had joined
// by the end of that month, then applies any credit or payments already made.
// Safe to call repeatedly. Returns the ids of members who got the month.
export async function startMonth(client, group, period) {
    const userIds = await Dues.generateForPeriod(client, {
        group,
        period,
        dueDate: dueDateFor(period, group.due_day),
        endOfMonth: endOfMonth(period),
    });
    for (const userId of userIds) await reallocateMember(client, userId);
    return userIds;
}
