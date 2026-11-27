import db, { withTransaction } from '../../config/db.js';
import * as Payments from '../payments/payment.model.js';
import { reallocateMember } from '../payments/allocation.service.js';
import { badRequest } from '../../utils/httpError.js';
import { today } from '../../utils/dates.js';
import { extractName, extractPhone, nameKey, parseAmount, parseDate } from './statement.parser.js';

// Works out what each statement row is, without writing anything.
// Used both for the real import and so tests can check the matching rules.
export async function classifyRows({ groupId, parsed, mapping }, client = db) {
    for (const field of ['date', 'amount']) {
        if (!mapping[field]) throw badRequest(`Choose which column holds the ${field}`);
    }
    for (const [field, column] of Object.entries(mapping)) {
        if (column && !parsed.headers.includes(column)) throw badRequest(`Column "${column}" (for ${field}) is not in the file`);
    }

    const { rows: members } = await client.query('SELECT id, name, phone FROM users WHERE group_id = $1', [groupId]);
    const byPhone = new Map(members.map((m) => [m.phone, m]));
    // Only match by name when exactly one member has that name.
    const nameCounts = new Map();
    for (const m of members) nameCounts.set(nameKey(m.name), (nameCounts.get(nameKey(m.name)) || 0) + 1);
    const byName = new Map(members.filter((m) => nameCounts.get(nameKey(m.name)) === 1).map((m) => [nameKey(m.name), m]));

    const references = parsed.rows.map((r) => cleanReference(r.values[mapping.reference])).filter(Boolean);
    const { rows: existing } = await client.query(
        'SELECT reference FROM payments WHERE group_id = $1 AND reference = ANY($2::text[])',
        [groupId, references],
    );
    const alreadyRecorded = new Set(existing.map((r) => r.reference));
    const seenInFile = new Set();
    const now = today();

    return parsed.rows.map(({ row_number, values }) => {
        const rawAmount = String(values[mapping.amount] ?? '').trim();
        const amount = parseAmount(rawAmount);
        const paid_at = parseDate(values[mapping.date]);
        const reference = cleanReference(values[mapping.reference]);
        const phone = extractPhone(values, mapping.phone);
        const payer_name = mapping.name ? extractName(values[mapping.name]) : null;
        const row = { row_number, raw: values, amount, paid_at, reference, phone, payer_name, user_id: null };

        if (!rawAmount || (amount !== null && amount <= 0)) return { ...row, status: 'skipped', message: 'Not a deposit' };
        if (amount === null) return { ...row, status: 'invalid', message: `Could not read the amount "${rawAmount}"` };
        if (!paid_at) return { ...row, status: 'invalid', message: `Could not read the date "${values[mapping.date] ?? ''}"` };
        if (paid_at > now) return { ...row, status: 'invalid', message: 'Date is in the future' };
        if (reference && alreadyRecorded.has(reference)) {
            return { ...row, status: 'duplicate', message: 'Already recorded' };
        }
        if (reference && seenInFile.has(reference)) {
            return { ...row, status: 'duplicate', message: 'Appears twice in this file' };
        }
        if (reference) seenInFile.add(reference);

        const member = (phone && byPhone.get(phone)) || (payer_name && byName.get(nameKey(payer_name)));
        if (!member) {
            return { ...row, status: 'unmatched', message: phone ? `No member with phone ${phone}` : 'No phone number or known name' };
        }
        return { ...row, status: 'matched', user_id: member.id, message: `Matched to ${member.name}` };
    });
}

const cleanReference = (v) => {
    const s = String(v ?? '').trim().toUpperCase();
    return s || null;
};

const COUNT_FIELDS = { matched: 'matched_rows', duplicate: 'duplicate_rows', unmatched: 'unmatched_rows', invalid: 'invalid_rows', skipped: 'skipped_rows' };

export async function importStatement({ groupId, uploadedBy, filename, parsed, mapping }) {
    return withTransaction(async (client) => {
        const rows = await classifyRows({ groupId, parsed, mapping }, client);
        const counts = Object.fromEntries(Object.values(COUNT_FIELDS).map((f) => [f, 0]));
        for (const r of rows) counts[COUNT_FIELDS[r.status]] += 1;

        const { rows: [imp] } = await client.query(
            `INSERT INTO statement_imports (group_id, filename, uploaded_by, mapping, total_rows,
                                            matched_rows, duplicate_rows, unmatched_rows, invalid_rows, skipped_rows)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
            [groupId, filename, uploadedBy, mapping, rows.length, counts.matched_rows, counts.duplicate_rows,
                counts.unmatched_rows, counts.invalid_rows, counts.skipped_rows],
        );

        const touched = new Set();
        for (const r of rows) {
            let paymentId = null;
            if (r.status === 'matched') {
                paymentId = await Payments.createPayment(client, {
                    group_id: groupId,
                    user_id: r.user_id,
                    amount: r.amount,
                    paid_at: r.paid_at,
                    method: 'mpesa',
                    reference: r.reference,
                    note: `Imported from ${filename}, row ${r.row_number}`,
                    source: 'import',
                    recorded_by: uploadedBy,
                });
                touched.add(r.user_id);
            }
            await insertRow(client, imp.id, r, paymentId);
        }
        for (const userId of touched) await reallocateMember(client, userId);
        return imp.id;
    });
}

function insertRow(client, importId, r, paymentId) {
    return client.query(
        `INSERT INTO import_rows (import_id, row_number, raw, paid_at, phone, payer_name, amount, reference, status, message, user_id, payment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [importId, r.row_number, r.raw, r.paid_at, r.phone, r.payer_name, r.amount, r.reference, r.status, r.message, r.user_id, paymentId],
    );
}

export async function listImports(groupId) {
    const { rows } = await db.query(
        `SELECT i.*, u.name AS uploaded_by_name FROM statement_imports i
         LEFT JOIN users u ON u.id = i.uploaded_by
         WHERE i.group_id = $1 ORDER BY i.created_at DESC`,
        [groupId],
    );
    return rows;
}

export async function getImport(id) {
    const { rows: [imp] } = await db.query(
        `SELECT i.*, u.name AS uploaded_by_name FROM statement_imports i
         LEFT JOIN users u ON u.id = i.uploaded_by WHERE i.id = $1`,
        [id],
    );
    if (!imp) return null;
    const { rows } = await db.query(
        `SELECT r.*, m.name AS member_name FROM import_rows r
         LEFT JOIN users m ON m.id = r.user_id
         WHERE r.import_id = $1 ORDER BY r.row_number`,
        [id],
    );
    return { ...imp, rows };
}

export async function findRow(rowId) {
    const { rows } = await db.query(
        `SELECT r.*, i.group_id, i.filename FROM import_rows r
         JOIN statement_imports i ON i.id = r.import_id WHERE r.id = $1`,
        [rowId],
    );
    return rows[0];
}

// A leader says who an unmatched deposit belongs to: record it as their payment.
export async function assignRow(row, { userId, dueId, recordedBy }) {
    return withTransaction(async (client) => {
        const paymentId = await Payments.createPayment(client, {
            group_id: row.group_id,
            user_id: userId,
            due_id: dueId,
            amount: row.amount,
            paid_at: row.paid_at,
            method: 'mpesa',
            reference: row.reference,
            note: `Imported from ${row.filename}, row ${row.row_number} (assigned by hand)`,
            source: 'import',
            recorded_by: recordedBy,
        });
        await client.query(
            `UPDATE import_rows SET status = 'matched', user_id = $2, payment_id = $3, message = 'Assigned by hand' WHERE id = $1`,
            [row.id, userId, paymentId],
        );
        await client.query(
            'UPDATE statement_imports SET matched_rows = matched_rows + 1, unmatched_rows = unmatched_rows - 1 WHERE id = $1',
            [row.import_id],
        );
        await reallocateMember(client, userId);
        return paymentId;
    });
}

// A leader says an unmatched row is not a member contribution.
export async function skipRow(row) {
    await withTransaction(async (client) => {
        await client.query(`UPDATE import_rows SET status = 'skipped', message = 'Dismissed by leader' WHERE id = $1`, [row.id]);
        await client.query(
            'UPDATE statement_imports SET skipped_rows = skipped_rows + 1, unmatched_rows = unmatched_rows - 1 WHERE id = $1',
            [row.import_id],
        );
    });
}
