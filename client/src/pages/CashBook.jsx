import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Download, Landmark, Plus, Scale, Trash2, X } from 'lucide-react';
import { api, download } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { Empty, ErrorBox, Field, Loading, Modal, Notice, PageHeader, Stat, StatusBadge, useAction, useConfirm, useToast } from '../components.jsx';
import { addMonths, dateLabel, money, monthLabel, thisMonth, todayIso } from '../format.js';
import { countsChanged } from '../Approvals.jsx';

export const CATEGORIES = {
    out: [
        ['withdrawal', 'Withdrawal'],
        ['expense', 'Expense'],
        ['charges', 'M-Pesa charges'],
        ['payout', 'Payout to members'],
        ['other_out', 'Other money out'],
    ],
    in: [
        ['other_income', 'Other income'],
        ['adjustment', 'Adjustment'],
    ],
};
export const CATEGORY_LABEL = Object.fromEntries([...CATEGORIES.out, ...CATEGORIES.in, ['contribution', 'Contribution']]);

function EntryForm({ onDone }) {
    const [form, setForm] = useState({ direction: 'out', category: 'withdrawal', amount: '', occurred_at: todayIso(), description: '', reference: '' });
    const action = useAction();
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const setDirection = (direction) => setForm((f) => ({ ...f, direction, category: CATEGORIES[direction][0][0] }));

    const submit = (e) => {
        e.preventDefault();
        action.run(async () => {
            const entry = await api('/cashbook/entries', { method: 'POST', body: { ...form, amount: Number(form.amount), reference: form.reference || null } });
            onDone(entry);
        });
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Direction">
                {[
                    ['out', 'Money out', ArrowUpRight],
                    ['in', 'Money in', ArrowDownLeft],
                ].map(([value, label, Icon]) => (
                    <button key={value} type="button" onClick={() => setDirection(value)} className={`btn ${form.direction === value ? 'btn-primary' : 'btn-secondary'}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                    </button>
                ))}
            </div>
            {form.direction === 'out' && <Notice tone="info">Money out is only counted after another leader approves it.</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                    <select className="input" value={form.category} onChange={set('category')}>
                        {CATEGORIES[form.direction].map(([v, l]) => (
                            <option key={v} value={v}>
                                {l}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Amount (TZS)">
                    <input className="input" type="number" min="0.01" step="any" inputMode="decimal" value={form.amount} onChange={set('amount')} required />
                </Field>
                <Field label="Date">
                    <input className="input" type="date" max={todayIso()} value={form.occurred_at} onChange={set('occurred_at')} required />
                </Field>
                <Field label="Reference (optional)" hint="M-Pesa code or receipt no.">
                    <input className="input uppercase" value={form.reference} onChange={set('reference')} />
                </Field>
            </div>
            <Field label="What was it for?">
                <input className="input" value={form.description} onChange={set('description')} minLength={3} required placeholder="e.g. Stationery for the meeting" />
            </Field>
            <ErrorBox error={action.error} />
            <button className="btn btn-primary w-full sm:w-auto" disabled={action.busy}>
                {action.busy ? 'Saving…' : form.direction === 'out' ? 'Send for approval' : 'Save'}
            </button>
        </form>
    );
}

function CheckForm({ onDone }) {
    const [form, setForm] = useState({ checked_on: todayIso(), actual_balance: '', note: '' });
    const action = useAction();
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const submit = (e) => {
        e.preventDefault();
        action.run(async () => onDone(await api('/cashbook/checks', { method: 'POST', body: { ...form, actual_balance: Number(form.actual_balance) } })));
    };
    return (
        <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-300">Open the group's M-Koba and type the balance it shows. We'll compare it with what the system expects.</p>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Balance in M-Koba (TZS)">
                    <input className="input" type="number" step="any" inputMode="decimal" value={form.actual_balance} onChange={set('actual_balance')} required />
                </Field>
                <Field label="On date">
                    <input className="input" type="date" max={todayIso()} value={form.checked_on} onChange={set('checked_on')} required />
                </Field>
            </div>
            <Field label="Note (optional)">
                <input className="input" value={form.note} onChange={set('note')} />
            </Field>
            <ErrorBox error={action.error} />
            <button className="btn btn-primary" disabled={action.busy}>
                Compare
            </button>
        </form>
    );
}

function Pending({ entries, onChange, currency }) {
    const { user } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const action = useAction();
    const [rejecting, setRejecting] = useState(null);
    const [reason, setReason] = useState('');

    const approve = (e) =>
        action.run(async () => {
            if (!(await confirm({ title: 'Approve this payment out?', message: `${money(e.amount, currency)}: ${e.description}. It will be taken off the group balance.`, confirmLabel: 'Approve' }))) return;
            await api(`/cashbook/entries/${e.id}/approve`, { method: 'POST' });
            toast.success('Approved.');
            onChange();
        });
    const reject = (ev) => {
        ev.preventDefault();
        action.run(async () => {
            await api(`/cashbook/entries/${rejecting.id}/reject`, { method: 'POST', body: { reason } });
            toast.info('Rejected.');
            setRejecting(null);
            setReason('');
            onChange();
        });
    };
    const remove = (e) =>
        action.run(async () => {
            if (!(await confirm({ title: 'Delete this entry?', confirmLabel: 'Delete', tone: 'danger' }))) return;
            await api(`/cashbook/entries/${e.id}`, { method: 'DELETE' });
            onChange();
        });

    if (entries.length === 0) return null;
    return (
        <section className="card mb-6 border-amber-300/20">
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-amber-100">
                <Scale className="h-4 w-4 text-amber-300" aria-hidden="true" /> Waiting for approval
            </h2>
            <p className="mb-3 text-sm text-slate-400">Money out only counts once a second leader approves it.</p>
            <ErrorBox error={action.error} className="mb-3" />
            <ul className="divide-y divide-white/5">
                {entries.map((e) => {
                    const mine = e.created_by === user.id && user.role !== 'admin';
                    return (
                        <li key={e.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="font-medium text-white">
                                    {money(e.amount, currency)} <span className="font-normal text-slate-400">· {CATEGORY_LABEL[e.category]}</span>
                                </p>
                                <p className="truncate text-sm text-slate-300">{e.description}</p>
                                <p className="text-xs text-slate-500">
                                    {dateLabel(e.occurred_at)} · recorded by {e.created_by_name || 'unknown'}
                                    {e.source === 'import' && ' from a statement'}
                                    {e.reference && ` · ${e.reference}`}
                                </p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                {mine ? (
                                    <>
                                        <span className="self-center text-xs text-slate-400">Waiting for another leader</span>
                                        <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(e)} disabled={action.busy} aria-label="Delete">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button type="button" className="btn btn-primary btn-sm" onClick={() => approve(e)} disabled={action.busy}>
                                            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Approve
                                        </button>
                                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setRejecting(e)} disabled={action.busy}>
                                            <X className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                                        </button>
                                    </>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
            {rejecting && (
                <Modal title="Reject entry" onClose={() => setRejecting(null)}>
                    <form onSubmit={reject} className="space-y-4">
                        <p className="text-sm text-slate-300">
                            {money(rejecting.amount, currency)}: {rejecting.description}
                        </p>
                        <Field label="Why are you rejecting it?">
                            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required autoFocus />
                        </Field>
                        <ErrorBox error={action.error} />
                        <button className="btn btn-danger" disabled={action.busy}>
                            Reject
                        </button>
                    </form>
                </Modal>
            )}
        </section>
    );
}

export default function CashBook() {
    const { group } = useAuth();
    const toast = useToast();
    const [period, setPeriod] = useState(thisMonth());
    const summary = useApi('/cashbook/summary', { period });
    const pending = useApi('/cashbook/entries', { status: 'pending' });
    const checks = useApi('/cashbook/checks');
    const [modal, setModal] = useState(null);
    const action = useAction();
    const cur = group.currency;
    const s = summary.data;

    const reload = () => {
        summary.reload();
        pending.reload();
        checks.reload();
        countsChanged();
    };
    const get = (format) => action.run(() => download('/cashbook/report', { period, format }));
    const last = s?.last_check;

    return (
        <>
            <PageHeader
                icon={Landmark}
                title="Cash book"
                subtitle="Every shilling in and out of the group's M-Koba."
                actions={
                    <>
                        <button type="button" className="btn btn-primary" onClick={() => setModal('entry')}>
                            <Plus className="h-4 w-4" aria-hidden="true" /> Record money
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setModal('check')}>
                            <Scale className="h-4 w-4" aria-hidden="true" /> Check balance
                        </button>
                    </>
                }
            />

            {s && s.leader_count < 2 && (
                <div className="mb-4">
                    <Notice tone="warning">Your group has only one leader. Make another member a leader (under Members) so money going out can be approved.</Notice>
                </div>
            )}

            <ErrorBox error={summary.error || action.error} className="mb-4" />
            {!s ? (
                <Loading />
            ) : (
                <>
                    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Stat label="Balance now" icon={Landmark} value={money(s.expected_now, cur)} hint="What M-Koba should show" tone="info" />
                        <Stat
                            label="Last check"
                            icon={Scale}
                            value={last ? money(last.actual_balance, cur) : 'Not yet'}
                            hint={last ? (last.difference === 0 ? `Matched on ${dateLabel(last.checked_on)}` : `${last.difference > 0 ? '+' : ''}${money(last.difference, cur)} off on ${dateLabel(last.checked_on)}`) : 'Compare with M-Koba'}
                            tone={!last ? 'default' : last.difference === 0 ? 'good' : 'bad'}
                        />
                        <Stat label={`In · ${monthLabel(period).split(' ')[0]}`} icon={ArrowDownLeft} value={money(s.total_in, cur)} tone="good" />
                        <Stat label={`Out · ${monthLabel(period).split(' ')[0]}`} icon={ArrowUpRight} value={money(s.total_out, cur)} tone="bad" hint={s.pending_out ? `+ ${money(s.pending_out, cur)} waiting` : undefined} />
                    </div>

                    <Pending entries={pending.data || []} onChange={reload} currency={cur} />

                    <section className="card mb-6">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPeriod(addMonths(period, -1))} aria-label="Previous month">
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <input className="input w-auto" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPeriod(addMonths(period, 1))} aria-label="Next month">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => get('xlsx')} disabled={action.busy}>
                                    <Download className="h-3.5 w-3.5" aria-hidden="true" /> Excel
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => get('pdf')} disabled={action.busy}>
                                    <Download className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                                </button>
                            </div>
                        </div>
                        <div className="-mx-4 overflow-x-auto sm:mx-0">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Description</th>
                                        <th className="text-right">In</th>
                                        <th className="text-right">Out</th>
                                        <th className="text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-white/[0.03]">
                                        <td className="whitespace-nowrap text-slate-400">{dateLabel(s.from)}</td>
                                        <td className="font-medium">Opening balance</td>
                                        <td />
                                        <td />
                                        <td className="text-right font-semibold">{s.opening_balance.toLocaleString()}</td>
                                    </tr>
                                    {s.lines.map((l) => (
                                        <tr key={`${l.kind}-${l.id}`} className={l.counts ? '' : 'opacity-60'}>
                                            <td className="whitespace-nowrap text-slate-400">{dateLabel(l.date)}</td>
                                            <td>
                                                <span className="text-slate-100">{l.kind === 'contribution' ? `Contribution · ${l.description}` : l.description}</span>
                                                <span className="ml-2 text-xs text-slate-500">{l.kind === 'entry' && CATEGORY_LABEL[l.category]}</span>
                                                {l.status !== 'approved' && (
                                                    <span className="ml-2">
                                                        <StatusBadge label={l.status === 'pending' ? 'Pending' : 'Rejected'} />
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-right text-emerald-300">{l.direction === 'in' ? l.amount.toLocaleString() : ''}</td>
                                            <td className="text-right text-rose-300">{l.direction === 'out' ? l.amount.toLocaleString() : ''}</td>
                                            <td className="text-right">{l.counts ? l.balance.toLocaleString() : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="font-semibold">
                                        <td className="px-3 py-2.5" />
                                        <td className="px-3 py-2.5">Closing balance</td>
                                        <td className="px-3 py-2.5 text-right text-emerald-300">{s.total_in.toLocaleString()}</td>
                                        <td className="px-3 py-2.5 text-right text-rose-300">{s.total_out.toLocaleString()}</td>
                                        <td className="px-3 py-2.5 text-right">{s.closing_balance.toLocaleString()}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        {s.lines.length === 0 && <p className="mt-3 text-center text-sm text-slate-500">Nothing recorded in {monthLabel(period)}.</p>}
                    </section>

                    <section className="card">
                        <h2 className="mb-3 font-semibold">Balance checks</h2>
                        {checks.data?.length ? (
                            <ul className="divide-y divide-white/5">
                                {checks.data.map((c) => (
                                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                                        <div>
                                            <p className="font-medium text-white">
                                                {dateLabel(c.checked_on)}: M-Koba showed {money(c.actual_balance, cur)}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                System expected {money(c.expected_balance, cur)} · by {c.created_by_name || 'unknown'}
                                                {c.note && ` · ${c.note}`}
                                            </p>
                                        </div>
                                        <StatusBadge label={c.difference === 0 ? 'Approved' : 'Rejected'}>{c.difference === 0 ? 'Matches' : `${c.difference > 0 ? '+' : ''}${c.difference.toLocaleString()}`}</StatusBadge>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <Empty icon={Scale}>No checks yet. Compare the system with the real M-Koba balance from time to time.</Empty>
                        )}
                    </section>
                </>
            )}

            {modal === 'entry' && (
                <Modal title="Record money in or out" onClose={() => setModal(null)}>
                    <EntryForm
                        onDone={(e) => {
                            setModal(null);
                            toast.success(e.status === 'pending' ? 'Saved. Another leader must approve it.' : 'Saved.');
                            reload();
                        }}
                    />
                </Modal>
            )}
            {modal === 'check' && (
                <Modal title="Check M-Koba balance" onClose={() => setModal(null)}>
                    <CheckForm
                        onDone={(c) => {
                            setModal(null);
                            if (c.difference === 0) toast.success('The balance matches.');
                            else toast.warning(`M-Koba shows ${money(Math.abs(c.difference), cur)} ${c.difference > 0 ? 'more' : 'less'} than expected. Look for missing payments or withdrawals.`);
                            reload();
                        }}
                    />
                </Modal>
            )}
        </>
    );
}
