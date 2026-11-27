import { useState } from 'react';
import { Copy, FileText } from 'lucide-react';
import { download } from './api.js';
import { useAction, useToast } from './components.jsx';
import { translate, getLang, useT } from './i18n.jsx';
import { dateLabel, money, monthLabel } from './format.js';

export const receiptNumber = (id) => `RCT-${String(id).padStart(6, '0')}`;

export function receiptText(p, group) {
    const t = (k, v) => translate(getLang(), k, v);
    const months = p.applied_to.length ? p.applied_to.map((a) => monthLabel(a.period)).join(', ') : t('credit for next month');
    return [
        `${group.name}: ${t('receipt')} ${receiptNumber(p.id)}`,
        t('{amount} from {name} on {date}', { amount: money(p.amount, group.currency), name: p.member_name, date: dateLabel(p.paid_at) }),
        `${p.method === 'mpesa' ? 'M-Pesa' : t(p.method === 'cash' ? 'Cash' : 'Bank')}${p.reference ? ` ${p.reference}` : ''}`,
        `${t('For')}: ${months}`,
    ].join('\n');
}

// "Receipt" (PDF) and "Copy" (WhatsApp text) buttons for one payment.
export function ReceiptButtons({ payment, group }) {
    const action = useAction();
    const toast = useToast();
    const [copied, setCopied] = useState(false);
    const { t } = useT();
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(receiptText(payment, group));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.warning(t('Could not copy. Download the PDF instead.'));
        }
    };
    return (
        <span className="inline-flex gap-1">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => action.run(() => download(`/payments/${payment.id}/receipt`))} disabled={action.busy} title={t('Download receipt (PDF)')}>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" /> {t('Receipt')}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copy} title={t('Copy receipt text for WhatsApp')} aria-label={t('Copy receipt text for WhatsApp')}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {copied && <span className="text-xs">{t('Copied!')}</span>}
            </button>
            {action.error && <span className="self-center text-xs text-rose-300">{action.error.message}</span>}
        </span>
    );
}
