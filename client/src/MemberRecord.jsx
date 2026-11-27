import { Empty, Stat, StatusBadge } from './components.jsx';
import { dateLabel, money, monthLabel } from './format.js';

// A member's months and payments. Used by the member's own page and by leaders.
export default function MemberRecord({ summary }) {
    const { totals, group, months, payments, credit } = summary;
    const cur = group.currency;

    return (
        <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Paid in total" value={money(totals.paid, cur)} tone="good" />
                <Stat label="Still owes" value={money(totals.balance, cur)} tone={totals.balance ? 'bad' : 'good'} hint={totals.fines ? `incl. ${money(totals.fines, cur)} fines` : undefined} />
                <Stat label="Months late" value={totals.late_months} tone={totals.late_months ? 'warn' : 'default'} />
                <Stat label="Credit" value={money(credit, cur)} hint="Paid ahead, used for the next month" />
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
                                        <td className="whitespace-nowrap text-gray-600">{dateLabel(m.due_date)}</td>
                                        <td className="text-right">{m.required_amount.toLocaleString()}</td>
                                        <td className="text-right">{m.fine ? m.fine.toLocaleString() : '-'}</td>
                                        <td className="text-right">{m.paid_total.toLocaleString()}</td>
                                        <td className={`text-right font-medium ${m.balance ? 'text-red-700' : ''}`}>{m.balance.toLocaleString()}</td>
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
                    <ul className="divide-y divide-gray-100">
                        {payments.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                <div>
                                    <p className="font-medium">
                                        {money(p.amount, cur)} <span className="font-normal text-gray-500">· {dateLabel(p.paid_at)} · {p.method.toUpperCase()}</span>
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {p.reference && <span className="font-mono">{p.reference} · </span>}
                                        {p.applied_to.length ? `For ${p.applied_to.map((a) => monthLabel(a.period)).join(', ')}` : 'Kept as credit'}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </>
    );
}
