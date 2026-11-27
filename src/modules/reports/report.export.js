// Turns report data into downloadable Excel and PDF files.
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { monthLabel, today } from '../../utils/dates.js';

const fmt = (n) => (n === null || n === undefined ? '' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n));
const MONEY = '#,##0.00';
const STATUS_FILL = { paid: 'FFD1FAE5', partial: 'FFFEF3C7', unpaid: 'FFFEE2E2' };
const STATUS_PDF = { paid: '#d1fae5', partial: '#fef3c7', unpaid: '#fee2e2' };
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- Excel ----------

function styleHeader(row) {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.eachCell((c) => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        c.alignment = { vertical: 'middle', wrapText: true };
    });
}

export async function monthlyXlsx(report) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(report.period);
    const { group, totals } = report;
    const cur = group.currency;

    ws.addRow([`${group.name}: contributions for ${monthLabel(`${report.period}-01`)}`]).font = { bold: true, size: 14 };
    ws.addRow([`Amount per member: ${cur} ${fmt(group.monthly_amount)}   Deadline: ${report.due_date ?? '-'}   Late fine: ${cur} ${fmt(group.late_fine)}`]);
    ws.addRow([`Generated ${today()}`]);
    ws.addRow([]);

    styleHeader(ws.addRow(['#', 'Member', 'Phone', `Required (${cur})`, `Fine (${cur})`, `Paid (${cur})`, `Balance (${cur})`, 'Status', 'Last payment']));
    report.rows.forEach((r, i) => {
        const row = ws.addRow([i + 1, r.member_name, r.member_phone, r.required_amount, r.fine, r.paid, r.balance, r.status_label, r.last_paid_at ?? '']);
        row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[r.status] } };
    });
    const totalRow = ws.addRow(['', 'TOTAL', '', totals.expected, totals.fines, totals.collected, totals.outstanding, '', '']);
    totalRow.font = { bold: true };

    ws.addRow([]);
    ws.addRow([`Paid: ${totals.paid}   Paid late: ${totals.paid_late}   Partial: ${totals.partial}   Unpaid: ${totals.unpaid}`]);

    [5, 26, 15, 14, 12, 14, 14, 12, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    [4, 5, 6, 7].forEach((c) => (ws.getColumn(c).numFmt = MONEY));
    return wb.xlsx.writeBuffer();
}

export async function yearlyXlsx(report) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(String(report.year));
    const { group } = report;
    const cur = group.currency;

    ws.addRow([`${group.name}: contributions for ${report.year} (${cur})`]).font = { bold: true, size: 14 };
    ws.addRow(['Each month shows the amount paid. Colour: green = paid, yellow = partial, red = unpaid.']);
    ws.addRow([`Generated ${today()}`]);
    ws.addRow([]);

    styleHeader(ws.addRow(['Member', ...SHORT, 'Required', 'Fines', 'Paid', 'Balance', 'Late months', 'Credit']));
    for (const r of report.rows) {
        const row = ws.addRow([
            r.member_name + (r.active ? '' : ' (inactive)'),
            ...report.months.map((p) => (r.months[p] ? r.months[p].paid : null)),
            r.totals.required, r.totals.fines, r.totals.paid, r.totals.balance, r.totals.late_months, r.credit,
        ]);
        report.months.forEach((p, i) => {
            const cell = r.months[p];
            if (cell) row.getCell(i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[cell.status] } };
        });
    }
    const t = report.totals;
    const totalRow = ws.addRow([
        'TOTAL',
        ...report.months.map((p) => report.month_totals[p]?.collected ?? null),
        t.required, t.fines, t.paid, t.balance, '', '',
    ]);
    totalRow.font = { bold: true };

    ws.getColumn(1).width = 26;
    for (let c = 2; c <= 13; c += 1) Object.assign(ws.getColumn(c), { width: 11, numFmt: MONEY });
    for (let c = 14; c <= 17; c += 1) Object.assign(ws.getColumn(c), { width: 13, numFmt: MONEY });
    ws.getColumn(18).width = 11;
    Object.assign(ws.getColumn(19), { width: 12, numFmt: MONEY });
    return wb.xlsx.writeBuffer();
}

// ---------- PDF ----------

function pdfBuffer(build, options) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4', ...options });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        build(doc);
        doc.end();
    });
}

// Draws a simple table, starting a new page (with the header repeated) when needed.
function drawTable(doc, { columns, rows, fontSize = 9, rowHeight = 18, fills = [] }) {
    const x0 = doc.page.margins.left;
    const bottom = doc.page.height - doc.page.margins.bottom;
    let y = doc.y;

    const drawRow = (cells, { bold = false, fill = null, cellFills = [] } = {}) => {
        if (y + rowHeight > bottom) {
            doc.addPage();
            y = doc.page.margins.top;
            drawRow(columns.map((c) => c.label), { bold: true, fill: '#0f766e' });
        }
        let x = x0;
        const total = columns.reduce((t, c) => t + c.width, 0);
        if (fill) doc.rect(x0, y, total, rowHeight).fill(fill);
        columns.forEach((col, i) => {
            if (cellFills[i]) doc.rect(x, y, col.width, rowHeight).fill(cellFills[i]);
            doc.fillColor(fill === '#0f766e' ? '#ffffff' : '#111827')
                .font(bold ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(fontSize)
                .text(String(cells[i] ?? ''), x + 3, y + (rowHeight - fontSize) / 2, {
                    width: col.width - 6,
                    align: col.align || 'left',
                    lineBreak: false,
                    ellipsis: true,
                });
            x += col.width;
        });
        doc.moveTo(x0, y + rowHeight).lineTo(x0 + total, y + rowHeight).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
        y += rowHeight;
    };

    drawRow(columns.map((c) => c.label), { bold: true, fill: '#0f766e' });
    rows.forEach((r, i) => drawRow(r.cells, { bold: r.bold, cellFills: fills[i] || [] }));
    doc.y = y + 10;
    doc.x = x0;
}

export function monthlyPdf(report) {
    const { group, totals } = report;
    const cur = group.currency;
    return pdfBuffer((doc) => {
        doc.font('Helvetica-Bold').fontSize(16).text(group.name);
        doc.font('Helvetica').fontSize(12).text(`Contributions for ${monthLabel(`${report.period}-01`)}`);
        doc.fontSize(9).fillColor('#4b5563')
            .text(`Amount per member: ${cur} ${fmt(group.monthly_amount)}  |  Deadline: ${report.due_date ?? '-'}  |  Late fine: ${cur} ${fmt(group.late_fine)}  |  Generated ${today()}`);
        doc.moveDown();

        doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold')
            .text(`Collected ${cur} ${fmt(totals.collected)} of ${fmt(totals.expected + totals.fines)}   Outstanding ${cur} ${fmt(totals.outstanding)}`);
        doc.font('Helvetica').text(`Paid: ${totals.paid}   Paid late: ${totals.paid_late}   Partial: ${totals.partial}   Unpaid: ${totals.unpaid}`);
        doc.moveDown();

        const columns = [
            { label: '#', width: 22 },
            { label: 'Member', width: 130 },
            { label: 'Required', width: 62, align: 'right' },
            { label: 'Fine', width: 48, align: 'right' },
            { label: 'Paid', width: 62, align: 'right' },
            { label: 'Balance', width: 62, align: 'right' },
            { label: 'Status', width: 66 },
            { label: 'Last paid', width: 83 },
        ];
        const rows = report.rows.map((r, i) => ({
            cells: [i + 1, r.member_name, fmt(r.required_amount), fmt(r.fine), fmt(r.paid), fmt(r.balance), r.status_label, r.last_paid_at ?? '-'],
        }));
        rows.push({ bold: true, cells: ['', 'TOTAL', fmt(totals.expected), fmt(totals.fines), fmt(totals.collected), fmt(totals.outstanding), '', ''] });
        const fills = report.rows.map((r) => {
            const f = [];
            f[6] = STATUS_PDF[r.status];
            return f;
        });
        drawTable(doc, { columns, rows, fills });
    });
}

export function yearlyPdf(report) {
    const { group } = report;
    return pdfBuffer(
        (doc) => {
            doc.font('Helvetica-Bold').fontSize(16).text(group.name);
            doc.font('Helvetica').fontSize(12).text(`Contributions for ${report.year} (${group.currency})`);
            doc.fontSize(8).fillColor('#4b5563').text(`Amounts paid per month. Green = paid, yellow = partial, red = unpaid. Generated ${today()}`);
            doc.moveDown();

            const columns = [
                { label: 'Member', width: 110 },
                ...SHORT.map((m) => ({ label: m, width: 42, align: 'right' })),
                { label: 'Paid', width: 58, align: 'right' },
                { label: 'Balance', width: 58, align: 'right' },
                { label: 'Late', width: 28, align: 'right' },
            ];
            const rows = report.rows.map((r) => ({
                cells: [
                    r.member_name,
                    ...report.months.map((p) => (r.months[p] ? fmt(r.months[p].paid) : '')),
                    fmt(r.totals.paid),
                    fmt(r.totals.balance),
                    r.totals.late_months,
                ],
            }));
            rows.push({
                bold: true,
                cells: ['TOTAL', ...report.months.map((p) => fmt(report.month_totals[p]?.collected)), fmt(report.totals.paid), fmt(report.totals.balance), ''],
            });
            const fills = report.rows.map((r) => ['', ...report.months.map((p) => (r.months[p] ? STATUS_PDF[r.months[p].status] : null))]);
            drawTable(doc, { columns, rows, fills, fontSize: 7, rowHeight: 16 });
        },
        { layout: 'landscape' },
    );
}
