import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { Wallet } from 'lucide-react';
import { Empty, ErrorBox, Field, Loading, MemberSelect, Modal, PageHeader, useAction, useConfirm, useToast } from '../components.jsx';
import { dateLabel, money, monthEnd, thisMonth, todayIso } from '../format.js';
import { ReceiptButtons } from '../receipts.jsx';
import { useT } from '../i18n.jsx';

const blank = (amount) => ({ user_id: '', amount, paid_at: todayIso(), method: 'mpesa', reference: '', period: '', note: '' });

function toBody(form) {
    return {
        user_id: Number(form.user_id),
        amount: Number(form.amount),
        paid_at: form.paid_at,
        method: form.method,
        reference: form.reference || null,
        period: form.period || null,
        note: form.note || null,
    };
}

function PaymentForm({ initial, submitLabel, onSubmit, busy, error, rule }) {
    const { t } = useT();
    const [form, setForm] = useState(initial);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit(form, () => setForm(blank(initial.amount)));
            }}
        >
            <Field label={t('Member')}>
                <MemberSelect value={form.user_id} onChange={(v) => setForm((f) => ({ ...f, user_id: v }))} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('Amount (TZS)')}>
                    <input className="input" type="number" min="0.01" step="any" inputMode="decimal" value={form.amount} onChange={set('amount')} required />
                </Field>
                <Field label={t('Date paid')}>
                    <input className="input" type="date" max={todayIso()} value={form.paid_at} onChange={set('paid_at')} required />
                </Field>
                <Field label={t('Method')}>
                    <select className="input" value={form.method} onChange={set('method')}>
                        <option value="mpesa">M-Pesa</option>
                        <option value="cash">{t('Cash')}</option>
                        <option value="bank">{t('Bank')}</option>
                    </select>
                </Field>
                <Field label={t('Reference')} hint={t('M-Pesa code or receipt no.')}>
                    <input className="input uppercase" value={form.reference} onChange={set('reference')} placeholder={t('e.g. TKR1A2B3C4')} />
                </Field>
                <Field label={t('For month (optional)')} hint={rule === 'oldest_first' ? t('Empty = oldest unpaid month first') : t('Empty = the month it was paid in first')}>
                    <input className="input" type="month" value={form.period} onChange={set('period')} />
                </Field>
                <Field label={t('Note (optional)')}>
                    <input className="input" value={form.note} onChange={set('note')} />
                </Field>
            </div>
            <ErrorBox error={error} />
            <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>
                {busy ? t('Saving…') : submitLabel}
            </button>
        </form>
    );
}

export default function Payments() {
    const { group } = useAuth();
    const [filter, setFilter] = useState({ user_id: '', month: thisMonth() });
    const query = {
        user_id: filter.user_id || undefined,
        from: filter.month ? `${filter.month}-01` : undefined,
        to: filter.month ? monthEnd(filter.month) : undefined,
    };
    const payments = useApi('/payments', query);
    const create = useAction();
    const edit = useAction();
    const [editing, setEditing] = useState(null);
    const toast = useToast();
    const confirm = useConfirm();
    const { t } = useT();

    const record = (form, reset) =>
        create.run(async () => {
            const p = await api('/payments', { method: 'POST', body: toBody(form) });
            const months = p.applied_to.map((a) => a.period).join(', ');
            toast.success(months ? t('Saved {amount} from {name} (applied to {months}).', { amount: money(p.amount, group.currency), name: p.member_name, months }) : t('Saved {amount} from {name} (kept as credit).', { amount: money(p.amount, group.currency), name: p.member_name }));
            reset();
            payments.reload();
        });

    const update = (form) =>
        edit.run(async () => {
            await api(`/payments/${editing.id}`, { method: 'PUT', body: toBody(form) });
            setEditing(null);
            payments.reload();
        });

    const remove = (p) =>
        edit.run(async () => {
            const ok = await confirm({ title: t('Delete payment?'), message: t('{amount} from {name} on {date} will be removed and their months recalculated.', { amount: money(p.amount, group.currency), name: p.member_name, date: dateLabel(p.paid_at) }), confirmLabel: t('Delete'), tone: 'danger' });
            if (!ok) return;
            await api(`/payments/${p.id}`, { method: 'DELETE' });
            payments.reload();
        });

    return (
        <>
            <PageHeader icon={Wallet} title={t('Payments')} subtitle={t("Record deposits made to the group's M-Koba.")} />

            <section className="card mb-6">
                <h2 className="mb-3 font-semibold">{t('Record a payment')}</h2>
                <PaymentForm initial={blank(group.monthly_amount)} submitLabel={t('Save payment')} rule={group.allocation_rule} onSubmit={record} busy={create.busy} error={create.error} />
            </section>

            <section className="card">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <h2 className="font-semibold">{t('Recorded payments')}</h2>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                        <MemberSelect value={filter.user_id} onChange={(v) => setFilter((f) => ({ ...f, user_id: v }))} allowEmpty emptyLabel={t('All members')} />
                        <input className="input" type="month" value={filter.month} onChange={(e) => setFilter((f) => ({ ...f, month: e.target.value }))} aria-label={t('Month paid')} />
                    </div>
                </div>
                <ErrorBox error={payments.error || edit.error} className="mb-3" />
                {payments.loading && !payments.data ? (
                    <Loading />
                ) : payments.data?.length ? (
                    <div className="-mx-4 overflow-x-auto sm:mx-0">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>{t('Date')}</th>
                                    <th>{t('Member')}</th>
                                    <th className="text-right">{t('Amount')}</th>
                                    <th>{t('Method')}</th>
                                    <th>{t('Reference')}</th>
                                    <th>{t('Applied to')}</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {payments.data.map((p) => (
                                    <tr key={p.id}>
                                        <td className="whitespace-nowrap">{dateLabel(p.paid_at)}</td>
                                        <td className="whitespace-nowrap font-medium">{p.member_name}</td>
                                        <td className="whitespace-nowrap text-right">{money(p.amount, group.currency)}</td>
                                        <td className="uppercase">{p.method}</td>
                                        <td className="font-mono text-xs">{p.reference || '-'}</td>
                                        <td className="text-xs text-slate-300">
                                            {p.applied_to.length ? p.applied_to.map((a) => `${a.period}: ${a.amount.toLocaleString()}`).join(', ') : t('Credit')}
                                            {p.source === 'import' && <span className="ml-1 rounded bg-white/10 px-1 text-slate-400">{t('imported')}</span>}
                                        </td>
                                        <td className="whitespace-nowrap text-right">
                                            <span className="mr-1"><ReceiptButtons payment={p} group={group} /></span>
                                            <button type="button" className="btn btn-secondary btn-sm mr-1" onClick={() => setEditing(p)}>
                                                {t('Edit')}
                                            </button>
                                            <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(p)}>
                                                {t('Delete')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Empty icon={Wallet}>{t('No payments for this filter.')}</Empty>
                )}
            </section>

            {editing && (
                <Modal title={t('Edit payment')} onClose={() => setEditing(null)}>
                    <PaymentForm
                        initial={{
                            user_id: editing.user_id,
                            amount: editing.amount,
                            paid_at: editing.paid_at,
                            method: editing.method,
                            reference: editing.reference || '',
                            period: editing.for_period || '',
                            note: editing.note || '',
                        }}
                        submitLabel={t('Save changes')}
                        rule={group.allocation_rule}
                        onSubmit={update}
                        busy={edit.busy}
                        error={edit.error}
                    />
                </Modal>
            )}
        </>
    );
}
