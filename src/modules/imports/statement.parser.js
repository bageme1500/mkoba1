// Reads CSV / Excel statements into plain rows and pulls out date, amount, phone,
// name and reference. Statement layouts differ, so the leader maps columns; these
// helpers only guess a starting mapping and parse the values.
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { normalizePhone } from '../../utils/phone.js';
import { badRequest } from '../../utils/httpError.js';

export const MAX_ROWS = 5000;

// ---------- reading files ----------

function cellToString(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
    if (typeof value === 'object') {
        if ('result' in value) return cellToString(value.result); // formula
        if ('richText' in value) return value.richText.map((r) => r.text).join('');
        if ('text' in value) return String(value.text); // hyperlink
        return '';
    }
    return String(value).trim();
}

async function readExcel(buffer) {
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(buffer);
    } catch {
        throw badRequest('Could not read this Excel file. Save it as .xlsx or .csv and try again.');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest('The Excel file has no sheets');
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
        const values = [];
        for (let i = 1; i <= row.cellCount; i += 1) values.push(cellToString(row.getCell(i).value));
        rows.push(values);
    });
    return rows;
}

function readCsv(buffer) {
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0];
    const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    try {
        return parseCsv(text, { delimiter, relax_column_count: true, skip_empty_lines: true, trim: true });
    } catch (err) {
        throw badRequest(`Could not read this CSV file: ${err.message}`);
    }
}

const isBlank = (row) => row.every((c) => c === '');

// Returns { headers, rows: [{ row_number, values: {header: value} }] }.
export async function readStatement(buffer, filename = '') {
    const name = filename.toLowerCase();
    let table;
    if (name.endsWith('.xlsx')) table = await readExcel(buffer);
    else if (name.endsWith('.csv') || name.endsWith('.txt')) table = readCsv(buffer);
    else throw badRequest('Upload a .csv or .xlsx file');

    table = table.filter((r) => !isBlank(r));
    if (table.length === 0) throw badRequest('The file is empty');

    const headerIndex = findHeaderRow(table);
    const headers = uniqueHeaders(table[headerIndex]);
    const body = table.slice(headerIndex + 1);
    if (body.length > MAX_ROWS) throw badRequest(`The file has more than ${MAX_ROWS} rows. Split it into smaller files.`);

    return {
        headers,
        rows: body.map((cells, i) => ({
            row_number: headerIndex + i + 2,
            values: Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ''])),
        })),
    };
}

const HEADER_WORDS = /date|time|amount|paid in|receipt|reference|details|description|phone|name|transaction|deposit|credit|kiasi|tarehe|jina/i;

// Statements often have a title block before the table. The header row is the first
// row (in the top 30) with at least two cells that look like column names.
function findHeaderRow(table) {
    for (let i = 0; i < Math.min(table.length, 30); i += 1) {
        if (table[i].filter((c) => HEADER_WORDS.test(c)).length >= 2) return i;
    }
    return 0;
}

function uniqueHeaders(row) {
    const seen = new Map();
    return row.map((raw, i) => {
        const base = raw || `Column ${i + 1}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        return n === 1 ? base : `${base} (${n})`;
    });
}

// ---------- guessing the mapping ----------

const GUESSES = {
    // Order matters: the first pattern that matches a header wins.
    date: [/completion time/i, /transaction date/i, /^date/i, /date|time|tarehe/i],
    amount: [/paid in/i, /deposit/i, /credit/i, /^amount/i, /amount|kiasi/i],
    reference: [/receipt/i, /reference|ref\b|transaction id|code/i],
    phone: [/phone|msisdn|mobile|namba/i],
    name: [/other party|sender|payer/i, /^name|jina/i, /details|description/i],
};

export function suggestMapping(headers) {
    const mapping = {};
    const used = new Set();
    for (const [field, patterns] of Object.entries(GUESSES)) {
        for (const pattern of patterns) {
            const hit = headers.find((h) => !used.has(h) && pattern.test(h));
            if (hit) {
                mapping[field] = hit;
                used.add(hit);
                break;
            }
        }
    }
    return mapping;
}

// ---------- parsing values ----------

// "50,000.00", "TZS 50000", "+50 000" -> 50000. Returns null if not a number.
export function parseAmount(value) {
    if (value === null || value === undefined) return null;
    let s = String(value).trim();
    if (!s || s === '-') return null;
    const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
    s = s.replace(/[^\d.,]/g, '');
    // "50.000,00" style (comma decimals) vs "50,000.00": treat the last separator
    // as decimal only if 1-2 digits follow it.
    const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    let normalised;
    if (lastSep >= 0 && s.length - lastSep - 1 <= 2 && s.length - lastSep - 1 > 0) {
        normalised = `${s.slice(0, lastSep).replace(/[.,]/g, '')}.${s.slice(lastSep + 1)}`;
    } else {
        normalised = s.replace(/[.,]/g, '');
    }
    if (!normalised) return null;
    const n = Number(normalised);
    if (!Number.isFinite(n)) return null;
    return Math.round((negative ? -n : n) * 100) / 100;
}

const pad = (n) => String(n).padStart(2, '0');
const valid = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

// Accepts 2026-03-05, 2026-03-05 14:22:10, 05/03/2026, 5-3-2026, 05.03.2026 (day first,
// as used in Tanzania) and Excel serial numbers. Returns YYYY-MM-DD or null.
export function parseDate(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    if (!s) return null;

    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) {
        const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
        return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
    }
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) {
        const [d, mo] = [Number(m[1]), Number(m[2])];
        let y = Number(m[3]);
        if (y < 100) y += 2000;
        return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) {
        // Excel serial date (days since 1899-12-30).
        const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
        return dt.toISOString().slice(0, 10);
    }
    return null;
}

const PHONE_IN_TEXT = /(?:\+?255|\b0)[\s-]?[67]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/;

// Uses the mapped phone column first, then looks for a phone number anywhere in the row
// (M-Pesa puts it inside "Details", e.g. "Funds received from - 255712345678 - ASHA").
export function extractPhone(values, phoneColumn) {
    if (phoneColumn) {
        const direct = normalizePhone(values[phoneColumn]);
        if (direct) return direct;
    }
    for (const cell of Object.values(values)) {
        const hit = String(cell).match(PHONE_IN_TEXT);
        if (hit) {
            const p = normalizePhone(hit[0]);
            if (p) return p;
        }
    }
    return null;
}

// "Funds received from - 255712345678 - ASHA MOHAMED" -> "ASHA MOHAMED"
export function extractName(value) {
    if (!value) return null;
    const parts = String(value)
        .split(/\s+-\s+|\s*\|\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
    const candidate = parts.reverse().find((p) => /[a-z]/i.test(p) && !/received|from|transfer|deposit|payment|funds/i.test(p));
    return candidate || null;
}

export const nameKey = (name) => (name ? name.toLowerCase().replace(/[^a-z]/g, '') : '');
