import { CircleCheck, Clock, PiggyBank, Wallet } from 'lucide-react';
import { Empty, Stat, StatusBadge } from './components.jsx';
import { ReceiptButtons } from './receipts.jsx';
import { dateLabel, money, monthLabel } from './format.js';

// A member's months and payments. Used by the member's own page and by leaders.
export default function MemberRecord({ summary }) {
    const { totals, group, months, payments, credit } = summary;
    const cur = group.currency;

    return (
        <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Paid in total" icon={CircleCheck} value={money(totals.paid, cur)} tone="good" />
                <Stat label="Still owes" icon={Wallet} value={money(totals.balance, cur)} tone={totals.balance ? 'bad' : 'good'} hint={totals.fines ? `incl. ${money(totals.fines, cur)} fines` : undefined} />
                <Stat label="Months late" icon={Clock} value={totals.late_months} tone={totals.late_months ? 'warn' : 'default'} />
                <Stat label="Credit" icon={PiggyBank} tone="info" value={money(credit, cur)} hint="Paid ahead, used for the next month" />
            </div>

            <section className="card mb-6">
                <h2 className="mb-3 font-semibold">Months</h2>
                {months.length === 0 ? (
                    <Empty>No months yet.</Empty>
                ) : (
                    <div className="-mx-4 overflow-x-auto sm:mx-0">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Month</th>
                                    <th>Deadline</th>
                                    <th className="text-right">Required</th>
                                    <th className="text-right">Fine</th>
                                    <th className="text-right">Paid</th>
                                    <th className="text-right">Balance</th>
                                    <th>Status</th>
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
                <h2 className="mb-3 font-semibold">Payments</h2>
                {payments.length === 0 ? (
                    <Empty>No payments recorded.</Empty>
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
                                        {p.applied_to.length ? `For ${p.applied_to.map((a) => monthLabel(a.period)).join(', ')}` : 'Kept as credit'}
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
