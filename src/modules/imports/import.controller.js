import { z } from 'zod';
import * as Imports from './import.service.js';
import * as Users from '../users/user.model.js';
import * as Dues from '../dues/due.model.js';
import { readStatement, suggestMapping } from './statement.parser.js';
import { assertCanManageGroup, resolveGroupId } from '../../middleware/auth.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import { id, period } from '../../utils/schemas.js';

const column = z.string().trim().min(1).optional().nullable().transform((v) => v || undefined);
const mappingSchema = z.object({
    date: z.string().trim().min(1, 'Choose the date column'),
    amount: z.string().trim().min(1, 'Choose the amount column'),
    phone: column,
    name: column,
    reference: column,
    withdrawn: column,
});
const assignSchema = z.object({ user_id: id, period: period.optional() });

function groupFor(req) {
    const groupId = resolveGroupId(req, req.query.group_id ?? req.body?.group_id);
    assertCanManageGroup(req.user, groupId);
    return groupId;
}

async function parseUpload(req) {
    if (!req.file) throw badRequest('Attach the statement file in a field called "file"');
    return readStatement(req.file.buffer, req.file.originalname);
}

// Step 1: upload the file, get its columns, a few sample rows and a suggested mapping.
export async function preview(req, res) {
    groupFor(req);
    const parsed = await parseUpload(req);
    const mapping = suggestMapping(parsed.headers);
    res.json({
        filename: req.file.originalname,
        headers: parsed.headers,
        total_rows: parsed.rows.length,
        sample: parsed.rows.slice(0, 10),
        suggested_mapping: mapping,
        warnings: mapping.reference
            ? []
            : ['No reference/receipt column found. Without it, uploading the same file twice would record payments twice.'],
    });
}

// Step 2: upload the same file with the chosen mapping (JSON string in field "mapping").
export async function create(req, res) {
    const groupId = groupFor(req);
    let rawMapping;
    try {
        rawMapping = typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping;
    } catch {
        throw badRequest('mapping must be JSON, e.g. {"date":"Completion Time","amount":"Paid In"}');
    }
    const mapping = mappingSchema.parse(rawMapping ?? {});
    const parsed = await parseUpload(req);

    const importId = await Imports.importStatement({
        groupId,
        req,
        filename: req.file.originalname,
        parsed,
        mapping,
    });
    res.status(201).json(await Imports.getImport(importId));
}

export async function list(req, res) {
    res.json(await Imports.listImports(groupFor(req)));
}

export async function get(req, res) {
    const imp = await Imports.getImport(id.parse(req.params.id));
    if (!imp) throw notFound('Import not found');
    assertCanManageGroup(req.user, imp.group_id);
    res.json(imp);
}

async function loadUnmatchedRow(req) {
    const row = await Imports.findRow(id.parse(req.params.rowId));
    if (!row) throw notFound('Row not found');
    assertCanManageGroup(req.user, row.group_id);
    if (row.status !== 'unmatched') throw conflict(`This row is already ${row.status}`);
    return row;
}

export async function assignRow(req, res) {
    const row = await loadUnmatchedRow(req);
    const data = assignSchema.parse(req.body);
    const member = await Users.findById(data.user_id);
    if (!member || member.group_id !== row.group_id) throw badRequest('Member is not in this group');
    let dueId = null;
    if (data.period) {
        const due = await Dues.findByUserAndPeriod(member.id, data.period);
        if (!due) throw badRequest(`${member.name} has no ${data.period.slice(0, 7)} month yet`);
        dueId = due.id;
    }
    await Imports.assignRow(row, { userId: member.id, dueId, req });
    res.json(await Imports.getImport(row.import_id));
}

export async function skipRow(req, res) {
    const row = await loadUnmatchedRow(req);
    await Imports.skipRow(row, req);
    res.json(await Imports.getImport(row.import_id));
}
