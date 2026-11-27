import { useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { download } from './api.js';
import { useAction, useToast } from './components.jsx';
import { dateLabel, money, monthLabel } from './format.js';

export const receiptNumber = (id) => `RCT-${String(id).padStart(6, '0')}`;

export function receiptText(p, group) {
    const months = p.applied_to.length ? p.applied_to.map((a) => monthLabel(a.period)).join(', ') : 'credit for next month';
    return [
        `${group.name}: receipt ${receiptNumber(p.id)}`,
        `${money(p.amount, group.currency)} from ${p.member_name} on ${dateLabel(p.paid_at)}`,
        `${p.method === 'mpesa' ? 'M-Pesa' : p.method}${p.reference ? ` ${p.reference}` : ''}`,
        `For: ${months}`,
    ].join('\n');
}

// "Receipt" (PDF) and "Copy" (WhatsApp text) buttons for one payment.
export function ReceiptButtons({ payment, group }) {
    const action = useAction();
    const toast = useToast();
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(receiptText(payment, group));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.warning('Could not copy. Download the PDF instead.');
        }
    };
    return (
        <span className="inline-flex gap-1">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => action.run(() => download(`/payments/${payment.id}/receipt`))} disabled={action.busy} title="Download receipt (PDF)">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Receipt
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copy} title="Copy receipt text for WhatsApp" aria-label="Copy receipt text">
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied && <span className="text-xs">Copied</span>}
            </button>
            {action.error && <span className="self-center text-xs text-rose-300">{action.error.message}</span>}
        </span>
    );
}
