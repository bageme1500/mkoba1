import { useState } from 'react';
import { HandCoins, LayoutDashboard } from 'lucide-react';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import { ErrorBox, Field, Loading, Modal, PageHeader, StatusBadge, useAction, useToast } from '../components.jsx';
import MemberRecord from '../MemberRecord.jsx';
import { dateLabel, money, ordinal, todayIso } from '../format.js';

function SubmitPaymentForm({ defaultAmount, onDone }) {
    const [form, setForm] = useState({ amount: defaultAmount, paid_at: todayIso(), method: 'mpesa', reference: '', period: '', note: '' });
    const action = useAction();
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const submit = (e) => {
        e.preventDefault();
        action.run(async () => {
            await api('/me/submissions', {
                method: 'POST',
                body: { ...form, amount: Number(form.amount), reference: form.reference || null, period: form.period || null, note: form.note || null },
            });
            onDone();
        });
    };
    return (
        <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-300">Tell your leaders about a payment you made. They will check it in M-Koba and confirm it.</p>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount (TZS)">
                    <input className="input" type="number" min="0.01" step="any" inputMode="decimal" value={form.amount} onChange={set('amount')} required />
                </Field>
                <Field label="Date paid">
                    <input className="input" type="date" max={todayIso()} value={form.paid_at} onChange={set('paid_at')} required />
                </Field>
                <Field label="Method">
                    <select className="input" value={form.method} onChange={set('method')}>
                        <option value="mpesa">M-Pesa</option>
                        <option value="cash">Cash</option>
                        <option value="bank">Bank</option>
                    </select>
                </Field>
                <Field label={form.method === 'mpesa' ? 'M-Pesa code' : 'Receipt no. (optional)'} hint={form.method === 'mpesa' ? 'From the confirmation SMS, e.g. TKR1A2B3C4' : undefined}>
                    <input className="input uppercase" value={form.reference} onChange={set('reference')} required={form.method === 'mpesa'} />
                </Field>
                <Field label="For month (optional)">
                    <input className="input" type="month" value={form.period} onChange={set('period')} />
                </Field>
                <Field label="Note (optional)">
                    <input className="input" value={form.note} onChange={set('note')} />
                </Field>
            </div>
            <ErrorBox error={action.error} />
            <button className="btn btn-primary w-full sm:w-auto" disabled={action.busy}>
                {action.busy ? 'Sending…' : 'Send to leaders'}
            </button>
        </form>
    );
}

const STATUS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

export default function MyContributions() {
    const { data, error, loading, reload } = useApi('/me/summary');
    const submissions = useApi('/me/submissions');
    const [open, setOpen] = useState(false);
    const toast = useToast();

    if (loading && !data) return <Loading />;
    if (error) return <ErrorBox error={error} />;
    const g = data.group;
    const recent = (submissions.data || []).slice(0, 5);

    return (
        <>
            <PageHeader
                icon={LayoutDashboard}
                title="My contributions"
                subtitle={`${g.name}: ${money(g.monthly_amount, g.currency)} every month by the ${ordinal(g.due_day)}${g.late_fine ? `, late fine ${money(g.late_fine, g.currency)}` : ''}.`}
                actions={
                    <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
                        <HandCoins className="h-4 w-4" aria-hidden="true" /> I have paid
                    </button>
                }
            />

            {recent.length > 0 && (
                <section className="card mb-6">
                    <h2 className="mb-2 font-semibold">Payments I reported</h2>
                    <ul className="divide-y divide-white/5">
                        {recent.map((s) => (
                            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                                <div>
                                    <p className="font-medium text-white">
                                        {money(s.amount, g.currency)} <span className="font-normal text-slate-400">· {dateLabel(s.paid_at)}{s.reference ? ` · ${s.reference}` : ''}</span>
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {s.status === 'pending' && 'Waiting for a leader to confirm'}
                                        {s.status === 'approved' && `Confirmed by ${s.reviewed_by_name}`}
                                        {s.status === 'rejected' && `Not accepted: ${s.reject_reason}`}
                                    </p>
                                </div>
                                <StatusBadge label={STATUS[s.status]} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <MemberRecord summary={data} />

            {open && (
                <Modal title="I have paid" onClose={() => setOpen(false)}>
                    <SubmitPaymentForm
                        defaultAmount={g.monthly_amount}
                        onDone={() => {
                            setOpen(false);
                            toast.success('Sent. Your leaders will confirm it.');
                            submissions.reload();
                            reload();
                        }}
                    />
                </Modal>
            )}
        </>
    );
}
