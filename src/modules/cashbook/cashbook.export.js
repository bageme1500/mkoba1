// Monthly cash book (statement of account) as Excel or PDF.
import ExcelJS from 'exceljs';
import { MONEY, drawTable, fmt, pdfBuffer, styleHeader } from '../reports/report.export.js';
import { monthLabel, today } from '../../utils/dates.js';

const LABELS = {
    contribution: 'Contribution',
    withdrawal: 'Withdrawal',
    expense: 'Expense',
    charges: 'M-Pesa charges',
    payout: 'Payout',
    other_out: 'Other out',
    other_income: 'Other income',
    adjustment: 'Adjustment',
};

const lineText = (l) => (l.kind === 'contribution' ? `Contribution: ${l.description}` : `${LABELS[l.category]}: ${l.description}`);
const statusNote = (l) => (l.status === 'approved' ? '' : l.status === 'pending' ? 'Pending' : `Rejected${l.reject_reason ? `: ${l.reject_reason}` : ''}`);

function categoryRows(book) {
    return [
        ...Object.entries(book.in_by_category).map(([k, v]) => [`In: ${LABELS[k]}`, v]),
        ...Object.entries(book.out_by_category).map(([k, v]) => [`Out: ${LABELS[k]}`, -v]),
    ];
}

export async function cashbookXlsx(book) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Cash book ${book.period}`);
    const cur = book.group.currency;

    ws.addRow([`${book.group.name}: cash book for ${monthLabel(`${book.period}-01`)} (${cur})`]).font = { bold: true, size: 14 };
    ws.addRow([`Generated ${today()}. Pending and rejected entries are listed but do not change the balance.`]);
    ws.addRow([]);
    ws.addRow(['Opening balance', book.opening_balance]).font = { bold: true };
    for (const [label, value] of categoryRows(book)) ws.addRow([label, value]);
    ws.addRow(['Closing balance', book.closing_balance]).font = { bold: true };
    if (book.pending_out > 0) ws.addRow(['Waiting for approval (not counted)', -book.pending_out]);
    ws.addRow([]);

    styleHeader(ws.addRow(['Date', 'Description', 'Reference', 'In', 'Out', 'Balance', 'Note']));
    for (const l of book.lines) {
        const row = ws.addRow([
            l.date,
            lineText(l),
            l.reference ?? '',
            l.direction === 'in' ? l.amount : null,
            l.direction === 'out' ? l.amount : null,
            l.counts ? l.balance : null,
            statusNote(l),
        ]);
        if (!l.counts) row.font = { italic: true, color: { argb: 'FF6B7280' } };
    }
    [12, 44, 16, 14, 14, 14, 28].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    [2, 4, 5, 6].forEach((c) => (ws.getColumn(c).numFmt = MONEY));
    return wb.xlsx.writeBuffer();
}

export function cashbookPdf(book) {
    const cur = book.group.currency;
    return pdfBuffer((doc) => {
        doc.font('Helvetica-Bold').fontSize(16).text(book.group.name);
        doc.font('Helvetica').fontSize(12).text(`Cash book for ${monthLabel(`${book.period}-01`)}`);
        doc.fontSize(9).fillColor('#4b5563').text(`Amounts in ${cur}. Generated ${today()}. Pending and rejected entries do not change the balance.`);
        doc.moveDown();

        drawTable(doc, {
            columns: [
                { label: 'Summary', width: 260 },
                { label: `Amount (${cur})`, width: 120, align: 'right' },
            ],
            rows: [
                { bold: true, cells: ['Opening balance', fmt(book.opening_balance)] },
                ...categoryRows(book).map(([label, value]) => ({ cells: [label, fmt(value)] })),
                { bold: true, cells: ['Closing balance', fmt(book.closing_balance)] },
                ...(book.pending_out > 0 ? [{ cells: ['Waiting for approval (not counted)', fmt(-book.pending_out)] }] : []),
            ],
        });

        const fills = book.lines.map((l) => (l.counts ? [] : Array(7).fill(l.status === 'pending' ? '#fef3c7' : '#fee2e2')));
        drawTable(doc, {
            columns: [
                { label: 'Date', width: 58 },
                { label: 'Description', width: 170 },
                { label: 'Reference', width: 70 },
                { label: 'In', width: 55, align: 'right' },
                { label: 'Out', width: 55, align: 'right' },
                { label: 'Balance', width: 62, align: 'right' },
                { label: 'Note', width: 65 },
            ],
            rows: book.lines.map((l) => ({
                cells: [
                    l.date,
                    lineText(l),
                    l.reference ?? '',
                    l.direction === 'in' ? fmt(l.amount) : '',
                    l.direction === 'out' ? fmt(l.amount) : '',
                    l.counts ? fmt(l.balance) : '',
                    statusNote(l),
                ],
            })),
            fills,
            fontSize: 8,
        });
    });
}
