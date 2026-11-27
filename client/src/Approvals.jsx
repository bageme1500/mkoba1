import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, HandCoins, Landmark, X } from 'lucide-react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { useApi } from './useApi.js';
import { ErrorBox, Field, Modal, useAction, useToast } from './components.jsx';
import { dateLabel, money, monthLabel } from './format.js';

const COUNTS_EVENT = 'mkoba:counts-changed';
export const countsChanged = () => window.dispatchEvent(new Event(COUNTS_EVENT));

// Pending approvals for the navigation badges; refreshes on page change and after any approval.
export function useApprovalCounts(pathname) {
    const { isLeader, group } = useAuth();
    const [counts, setCounts] = useState(null);
    const load = useCallback(() => {
        if (!isLeader || !group) return;
        api('/submissions/counts')
            .then(setCounts)
            .catch(() => setCounts(null));
    }, [isLeader, group]);
    useEffect(load, [load, pathname]);
    useEffect(() => {
        window.addEventListener(COUNTS_EVENT, load);
        return () => window.removeEventListener(COUNTS_EVENT, load);
    }, [load]);
    return counts;
}

// Dashboard panel: payments members reported, and money out waiting for approval.
export default function Approvals({ onChange }) {
    const { group, user } = useAuth();
    const submissions = useApi('/submissions', { status: 'pending' });
    const counts = useApprovalCounts();
    const action = useAction();
    const toast = useToast();
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState('');
    const cur = group.currency;

    const pending = (submissions.data || []).filter((s) => s.user_id !== user.id || user.role === 'admin');
    const cashbook = counts?.cashbook || 0;
    if (pending.length === 0 && cashbook === 0) return null;

    const done = (message) => {
        toast.success(message);
        submissions.reload();
        countsChanged();
        onChange?.();
    };
    const approve = (s) =>
        action.run(async () => {
            await api(`/submissions/${s.id}/approve`, { method: 'POST' });
            done(`${money(s.amount, cur)} from ${s.member_name} confirmed.`);
        });
    const reject = (e) => {
        e.preventDefault();
        action.run(async () => {
            await api(`/submissions/${rejecting.id}/reject`, { method: 'POST', body: { reason } });
            setRejecting(null);
            setReason('');
            done('Rejected. The member will see your reason.');
        });
    };

    return (
        <section className="card mb-6 border-amber-300/20">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-100">
                <HandCoins className="h-4 w-4 text-amber-300" aria-hidden="true" /> Needs your approval
            </h2>
            <ErrorBox error={action.error} className="mb-3" />
            {pending.length > 0 && (
                <ul className="divide-y divide-white/5">
                    {pending.map((s) => (
                        <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="font-medium text-white">
                                    {s.member_name} paid {money(s.amount, cur)}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {dateLabel(s.paid_at)} · {s.method === 'mpesa' ? 'M-Pesa' : s.method}
                                    {s.reference && <span className="font-mono"> · {s.reference}</span>}
                                    {s.period && ` · for ${monthLabel(s.period)}`}
                                    {s.note && ` · “${s.note}”`}
                                </p>
                                <p className="text-xs text-slate-500">Check this code in M-Koba before confirming.</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <button type="button" className="btn btn-primary btn-sm" onClick={() => approve(s)} disabled={action.busy}>
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> Confirm
                                </button>
                                <button type="button" className="btn btn-danger btn-sm" onClick={() => setRejecting(s)} disabled={action.busy}>
                                    <X className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {cashbook > 0 && (
                <Link to="/cashbook" className="glass-subtle mt-3 flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-white/[0.07]">
                    <span className="flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-brand-300" aria-hidden="true" />
                        {cashbook} money-out {cashbook === 1 ? 'entry is' : 'entries are'} waiting in the cash book
                    </span>
                    <span className="text-brand-300">Review</span>
                </Link>
            )}
            {rejecting && (
                <Modal title="Reject reported payment" onClose={() => setRejecting(null)}>
                    <form onSubmit={reject} className="space-y-4">
                        <p className="text-sm text-slate-300">
                            {rejecting.member_name}: {money(rejecting.amount, cur)} {rejecting.reference && `(${rejecting.reference})`}
                        </p>
                        <Field label="Reason (the member will see this)">
                            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required autoFocus placeholder="e.g. Code not found in M-Koba" />
                        </Field>
                        <button className="btn btn-danger" disabled={action.busy}>
                            Reject
                        </button>
                    </form>
                </Modal>
            )}
        </section>
    );
}
