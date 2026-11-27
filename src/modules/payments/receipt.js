// One-page PDF receipt for a payment.
import { pdfBuffer, fmt } from '../reports/report.export.js';
import { monthLabel, today } from '../../utils/dates.js';

export const receiptNumber = (paymentId) => `RCT-${String(paymentId).padStart(6, '0')}`;

const METHODS = { mpesa: 'M-Pesa', cash: 'Cash', bank: 'Bank' };
const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');

/**
 * @param payment  payment with member_name, applied_to, recorded_by_name
 * @param group    group row
 * @param months   due_status rows for the months the payment paid (for balances left)
 */
export function receiptPdf({ payment, group, months }) {
    const cur = group.currency;
    return pdfBuffer(
        (doc) => {
            const left = doc.page.margins.left;
            const width = doc.page.width - left - doc.page.margins.right;

            // Header band
            doc.rect(0, 0, doc.page.width, 92).fill('#0f766e');
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(group.name, left, 26, { width });
            doc.font('Helvetica').fontSize(10).fillColor('#ccfbf1').text('Payment receipt', left, 52);
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff').text(receiptNumber(payment.id), left, 52, { width, align: 'right' });

            // Amount
            doc.fillColor('#6b7280').font('Helvetica').fontSize(9).text('AMOUNT RECEIVED', left, 116);
            doc.fillColor('#111827').font('Helvetica-Bold').fontSize(26).text(`${cur} ${fmt(payment.amount)}`, left, 130);

            // Details
            const rows = [
                ['Received from', payment.member_name],
                ['Date paid', dmy(payment.paid_at)],
                ['Method', METHODS[payment.method] || payment.method],
                ['Reference', payment.reference || '-'],
                ['Recorded by', payment.recorded_by_name || '-'],
            ];
            let y = 178;
            for (const [label, value] of rows) {
                doc.fillColor('#6b7280').font('Helvetica').fontSize(9).text(label, left, y);
                doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text(String(value), left + 110, y - 1, { width: width - 110 });
                y += 20;
            }

            // Months paid
            y += 10;
            doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Applied to', left, y);
            y += 18;
            if (payment.applied_to.length === 0) {
                doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Kept as credit for the next month.', left, y);
                y += 18;
            } else {
                doc.rect(left, y, width, 18).fill('#f0fdfa');
                doc.fillColor('#115e59').font('Helvetica-Bold').fontSize(9);
                doc.text('Month', left + 6, y + 5);
                doc.text('Paid by this receipt', left + 150, y + 5, { width: 120, align: 'right' });
                doc.text('Still owed for the month', left + 280, y + 5, { width: width - 286, align: 'right' });
                y += 18;
                for (const a of payment.applied_to) {
                    const m = months.find((d) => d.id === a.due_id);
                    doc.fillColor('#111827').font('Helvetica').fontSize(10);
                    doc.text(monthLabel(`${a.period}-01`), left + 6, y + 5);
                    doc.text(`${cur} ${fmt(a.amount)}`, left + 150, y + 5, { width: 120, align: 'right' });
                    doc.text(m ? (m.balance > 0 ? `${cur} ${fmt(m.balance)}` : 'Fully paid') : '-', left + 280, y + 5, { width: width - 286, align: 'right' });
                    y += 20;
                    doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
                }
                const credit = Math.round((payment.amount - payment.applied_to.reduce((t, a) => t + a.amount, 0)) * 100) / 100;
                if (credit > 0) {
                    y += 6;
                    doc.fillColor('#374151').font('Helvetica').fontSize(10).text(`${cur} ${fmt(credit)} kept as credit for the next month.`, left, y);
                    y += 16;
                }
            }

            doc.fillColor('#9ca3af').font('Helvetica').fontSize(8).text(
                `Generated ${dmy(today())} by M-Koba Tracker. Check any doubts with your group leader using the receipt number.`,
                left,
                doc.page.height - doc.page.margins.bottom - 20,
                { width, align: 'center' },
            );
        },
        { size: 'A5', margin: 32 },
    );
}
