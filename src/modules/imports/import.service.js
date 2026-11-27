import db, { withTransaction } from '../../config/db.js';
import * as Payments from '../payments/payment.model.js';
import * as Cash from '../cashbook/cashbook.model.js';
import * as Users from '../users/user.model.js';
import { reallocateMember } from '../payments/allocation.service.js';
import { audit, money } from '../../utils/audit.js';
import { badRequest } from '../../utils/httpError.js';
import { today } from '../../utils/dates.js';
import { extractName, extractPhone, nameKey, parseAmount, parseDate } from './statement.parser.js';

const CHARGE_WORDS = /charge|fee|ada|makato|tozo/i;

// Works out what each statement row is, without writing anything.
// Used both for the real import and so tests can check the matching rules.
//   matched / unmatched / duplicate / invalid: money in (deposits)
//   cashbook: money out (withdrawals, charges) -> pending cash book entry
//   skipped:  neither
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

    // References already used by a payment or a (non-rejected) cash book entry.
    const references = parsed.rows.map((r) => cleanReference(r.values[mapping.reference])).filter(Boolean);
    const { rows: existing } = await client.query(
        `SELECT reference FROM payments WHERE group_id = $1 AND reference = ANY($2::text[])
         UNION
         SELECT reference FROM cash_entries WHERE group_id = $1 AND status <> 'rejected' AND reference = ANY($2::text[])`,
        [groupId, references],
    );
    const alreadyRecorded = new Set(existing.map((r) => r.reference));
    const seenInFile = new Set();
    const now = today();

    return parsed.rows.map(({ row_number, values }) => {
        const rawAmount = String(values[mapping.amount] ?? '').trim();
        const parsedAmount = parseAmount(rawAmount);
        const rawOut = mapping.withdrawn ? String(values[mapping.withdrawn] ?? '').trim() : '';
        const outAmount = rawOut ? parseAmount(rawOut) : null;
        const paid_at = parseDate(values[mapping.date]);
        const reference = cleanReference(values[mapping.reference]);
        const phone = extractPhone(values, mapping.phone);
        const details = mapping.name ? String(values[mapping.name] ?? '').trim() : '';
        const payer_name = mapping.name ? extractName(details) : null;
        const base = { row_number, raw: values, paid_at, reference, phone, payer_name, user_id: null };

        // Money out: a value in the "withdrawn" column, or a negative amount.
        let direction = null;
        let amount = null;
        if (parsedAmount !== null && parsedAmount > 0) {
            direction = 'in';
            amount = parsedAmount;
        } else if (outAmount !== null && Math.abs(outAmount) > 0) {
            direction = 'out';
            amount = Math.abs(outAmount);
        } else if (parsedAmount !== null && parsedAmount < 0) {
            direction = 'out';
            amount = Math.abs(parsedAmount);
        }
        const row = { ...base, amount };

        if (rawAmount && parsedAmount === null) return { ...row, status: 'invalid', message: `Could not read the amount "${rawAmount}"` };
        if (!direction) return { ...row, status: 'skipped', message: 'No amount' };
        if (!paid_at) return { ...row, status: 'invalid', message: `Could not read the date "${values[mapping.date] ?? ''}"` };
        if (paid_at > now) return { ...row, status: 'invalid', message: 'Date is in the future' };
        if (reference && alreadyRecorded.has(reference)) return { ...row, status: 'duplicate', message: 'Already recorded' };
        if (reference && seenInFile.has(reference)) return { ...row, status: 'duplicate', message: 'Appears twice in this file' };
        if (reference) seenInFile.add(reference);

        if (direction === 'out') {
            const category = CHARGE_WORDS.test(details) ? 'charges' : 'withdrawal';
            return {
                ...row,
                status: 'cashbook',
                category,
                description: details || (category === 'charges' ? 'M-Pesa charges' : 'Withdrawal'),
                message: 'Sent to the cash book for approval',
            };
        }

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

const COUNT_FIELDS = {
    matched: 'matched_rows',
    duplicate: 'duplicate_rows',
    unmatched: 'unmatched_rows',
    invalid: 'invalid_rows',
    skipped: 'skipped_rows',
    cashbook: 'cashbook_rows',
};

export async function importStatement({ groupId, req, filename, parsed, mapping }) {
    const uploadedBy = req.user.id;
    return withTransaction(async (client) => {
        const rows = await classifyRows({ groupId, parsed, mapping }, client);
        const counts = Object.fromEntries(Object.values(COUNT_FIELDS).map((f) => [f, 0]));
        for (const r of rows) counts[COUNT_FIELDS[r.status]] += 1;

        const { rows: [imp] } = await client.query(
            `INSERT INTO statement_imports (group_id, filename, uploaded_by, mapping, total_rows, matched_rows,
                                            duplicate_rows, unmatched_rows, invalid_rows, skipped_rows, cashbook_rows)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [groupId, filename, uploadedBy, mapping, rows.length, counts.matched_rows, counts.duplicate_rows,
                counts.unmatched_rows, counts.invalid_rows, counts.skipped_rows, counts.cashbook_rows],
        );

        const touched = new Set();
        for (const r of rows) {
            let paymentId = null;
            let cashEntryId = null;
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
            } else if (r.status === 'cashbook') {
                // Money out from a statement still needs a second leader's approval.
                cashEntryId = await Cash.createEntry(client, {
                    group_id: groupId,
                    direction: 'out',
                    category: r.category,
                    amount: r.amount,
                    occurred_at: r.paid_at,
                    description: r.description.slice(0, 300),
                    reference: r.reference,
                    status: 'pending',
                    source: 'import',
                    created_by: uploadedBy,
                });
            }
            await insertRow(client, imp.id, r, paymentId, cashEntryId);
        }
        for (const userId of touched) await reallocateMember(client, userId);

        const total = rows.filter((r) => r.status === 'matched').reduce((t, r) => t + r.amount, 0);
        await audit(client, req, {
            groupId,
            action: 'import.create',
            entity: 'import',
            entityId: imp.id,
            summary: `Imported statement ${filename}: ${counts.matched_rows} payment(s) totalling ${money(total)}`
                + `${counts.cashbook_rows ? `, ${counts.cashbook_rows} money-out row(s) sent for approval` : ''}`
                + `${counts.unmatched_rows ? `, ${counts.unmatched_rows} need a member` : ''}`,
        });
        return imp.id;
    });
}

function insertRow(client, importId, r, paymentId, cashEntryId) {
    return client.query(
        `INSERT INTO import_rows (import_id, row_number, raw, paid_at, phone, payer_name, amount, reference, status, message,
                                  user_id, payment_id, cash_entry_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [importId, r.row_number, r.raw, r.paid_at, r.phone, r.payer_name, r.amount, r.reference, r.status, r.message,
            r.user_id, paymentId, cashEntryId],
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
        `SELECT r.*, m.name AS member_name, e.status AS cash_status FROM import_rows r
         LEFT JOIN users m ON m.id = r.user_id
         LEFT JOIN cash_entries e ON e.id = r.cash_entry_id
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
export async function assignRow(row, { userId, dueId, req }) {
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
            recorded_by: req.user.id,
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
        const member = await Users.findById(userId, client);
        await audit(client, req, {
            groupId: row.group_id,
            action: 'import.assign',
            entity: 'payment',
            entityId: paymentId,
            subjectUserId: userId,
            summary: `Assigned statement row ${row.row_number} (${money(row.amount)}${row.reference ? `, ${row.reference}` : ''}) to ${member.name}`,
        });
        return paymentId;
    });
}

// A leader says an unmatched row is not a member contribution.
export async function skipRow(row, req) {
    await withTransaction(async (client) => {
        await client.query(`UPDATE import_rows SET status = 'skipped', message = 'Dismissed by leader' WHERE id = $1`, [row.id]);
        await client.query(
            'UPDATE statement_imports SET skipped_rows = skipped_rows + 1, unmatched_rows = unmatched_rows - 1 WHERE id = $1',
            [row.import_id],
        );
        await audit(client, req, {
            groupId: row.group_id,
            action: 'import.skip',
            entity: 'import',
            entityId: row.import_id,
            summary: `Dismissed statement row ${row.row_number} (${money(row.amount)}${row.reference ? `, ${row.reference}` : ''}) as not a contribution`,
        });
    });
}
