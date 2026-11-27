import { z } from 'zod';
import * as Reports from './report.service.js';
import * as Exports from './report.export.js';
import { assertCanManageGroup, resolveGroupId } from '../../middleware/auth.js';
import { badRequest } from '../../utils/httpError.js';
import { currentPeriod, today } from '../../utils/dates.js';
import { id, period, year } from '../../utils/schemas.js';

const format = z.enum(['json', 'xlsx', 'pdf']).default('json');
const monthlySchema = z.object({ period: period.optional(), format, group_id: id.optional() });
const yearlySchema = z.object({ year: year.optional(), format, group_id: id.optional() });
const remindersSchema = z.object({ lang: z.enum(['sw', 'en']).default('sw'), group_id: id.optional() });

function groupFor(req, requested) {
    const groupId = resolveGroupId(req, requested);
    assertCanManageGroup(req.user, groupId);
    return groupId;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function send(res, fmtName, buffer, filename) {
    const types = {
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf',
    };
    res.set('Content-Type', types[fmtName]);
    res.set('Content-Disposition', `attachment; filename="${filename}.${fmtName}"`);
    res.send(Buffer.from(buffer));
}

export async function monthly(req, res) {
    const q = monthlySchema.parse(req.query);
    const report = await Reports.monthlyReport(groupFor(req, q.group_id), q.period ?? currentPeriod());
    if (q.format === 'json') return res.json(report);
    if (!report.started) throw badRequest(`${report.period} has not been started for this group yet`);
    const name = `${slug(report.group.name)}-${report.period}`;
    send(res, q.format, q.format === 'xlsx' ? await Exports.monthlyXlsx(report) : await Exports.monthlyPdf(report), name);
}

export async function yearly(req, res) {
    const q = yearlySchema.parse(req.query);
    const report = await Reports.yearlyReport(groupFor(req, q.group_id), q.year ?? Number(today().slice(0, 4)));
    if (q.format === 'json') return res.json(report);
    const name = `${slug(report.group.name)}-${report.year}`;
    send(res, q.format, q.format === 'xlsx' ? await Exports.yearlyXlsx(report) : await Exports.yearlyPdf(report), name);
}

export async function reminders(req, res) {
    const q = remindersSchema.parse(req.query);
    res.json(await Reports.reminders(groupFor(req, q.group_id), { lang: q.lang }));
}

// Any logged-in member: their own months, payments and totals.
export async function mySummary(req, res) {
    if (!req.user.group_id) throw badRequest('Admins are not members of a group');
    res.json(await Reports.memberSummary(req.user.id));
}

// Leaders: one member's full record.
export async function memberSummary(req, res) {
    const summary = await Reports.memberSummary(id.parse(req.params.id));
    assertCanManageGroup(req.user, summary.group.id);
    res.json(summary);
}

const trendSchema = z.object({ months: z.coerce.number().int().min(3).max(36).default(12), group_id: id.optional() });

export async function trend(req, res) {
    const q = trendSchema.parse(req.query);
    res.json(await Reports.trend(groupFor(req, q.group_id), q.months));
}
