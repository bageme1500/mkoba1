import { CircleCheck, Clock, PiggyBank, Wallet } from 'lucide-react';
import { Empty, Stat, StatusBadge } from './components.jsx';
import { ReceiptButtons } from './receipts.jsx';
import { useT } from './i18n.jsx';
import { dateLabel, money, monthLabel } from './format.js';

// A member's months and payments. Used by the member's own page and by leaders.
export default function MemberRecord({ summary }) {
    const { totals, group, months, payments, credit } = summary;
    const cur = group.currency;
    const { t } = useT();

    return (
        <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('Paid in total')} icon={CircleCheck} value={money(totals.paid, cur)} tone="good" />
                <Stat label={t('Still owes')} icon={Wallet} value={money(totals.balance, cur)} tone={totals.balance ? 'bad' : 'good'} hint={totals.fines ? t('incl. {amount} fines', { amount: money(totals.fines, cur) }) : undefined} />
                <Stat label={t('Months late')} icon={Clock} value={totals.late_months} tone={totals.late_months ? 'warn' : 'default'} />
                <Stat label={t('Credit')} icon={PiggyBank} tone="info" value={money(credit, cur)} hint={t('Paid ahead, used for the next month')} />
            </div>

            <section className="card mb-6">
                <h2 className="mb-3 font-semibold">{t('Months')}</h2>
                {months.length === 0 ? (
                    <Empty>{t('No months yet.')}</Empty>
                ) : (
                    <div className="-mx-4 overflow-x-auto sm:mx-0">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>{t('Month')}</th>
                                    <th>{t('Deadline')}</th>
                                    <th className="text-right">{t('Required')}</th>
                                    <th className="text-right">{t('Fine')}</th>
                                    <th className="text-right">{t('Paid')}</th>
                                    <th className="text-right">{t('Balance')}</th>
                                    <th>{t('Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {months.map((m) => (
                                    <tr key={m.id}>
                                        <td className="whitespace-nowrap font-medium">{monthLabel(m.period)}</td>
                                        <td className="whitespace-nowrap text-slate-300">{dateLabel(m.due_date)}</td>
                                        <td className="text-right">{m.required_amount.toLocaleString()}</td>
                                        <td className="text-right">{m.fine ? m.fine.toLocaleString() : '-'}</td>
                                        <td className="text-right">{m.paid_total.toLocaleString()}</td>
                                        <td className={`text-right font-medium ${m.balance ? 'text-rose-300' : ''}`}>{m.balance.toLocaleString()}</td>
                                        <td>
                                            <StatusBadge label={m.status_label} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="card">
                <h2 className="mb-3 font-semibold">{t('Payments')}</h2>
                {payments.length === 0 ? (
                    <Empty>{t('No payments recorded.')}</Empty>
                ) : (
                    <ul className="divide-y divide-white/5">
                        {payments.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                <div>
                                    <p className="font-medium">
                                        {money(p.amount, cur)} <span className="font-normal text-slate-400">· {dateLabel(p.paid_at)} · {p.method.toUpperCase()}</span>
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        {p.reference && <span className="font-mono">{p.reference} · </span>}
                                        {p.applied_to.length ? t('For {months}', { months: p.applied_to.map((a) => monthLabel(a.period)).join(', ') }) : t('Kept as credit')}
                                    </p>
                                </div>
                                <ReceiptButtons payment={p} group={group} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </>
    );
}
