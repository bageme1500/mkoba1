import env from '../config/env.js';

// Today's date (YYYY-MM-DD) in the app's timezone, matching CURRENT_DATE in SQL.
export function today(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone }).format(now);
}

// '2026-03-01' -> '2026-03'
export const toMonth = (date) => date.slice(0, 7);

// First day of the current month, e.g. '2026-11-01'
export const currentPeriod = () => `${toMonth(today())}-01`;

// '2026-03-01', 28 -> '2026-03-28'
export const dueDateFor = (period, dueDay) => `${toMonth(period)}-${String(dueDay).padStart(2, '0')}`;

// Last day of the month that `period` starts.
export function endOfMonth(period) {
    const [y, m] = period.split('-').map(Number);
    const d = new Date(Date.UTC(y, m, 0));
    return d.toISOString().slice(0, 10);
}

// Whole days from date a to date b (both YYYY-MM-DD).
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// '2026-03-01' -> 'March 2026'
export function monthLabel(period) {
    const [y, m] = period.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
}
