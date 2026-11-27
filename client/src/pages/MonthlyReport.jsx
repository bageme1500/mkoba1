import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { ErrorBox, Loading, PageHeader, Stat, StatusBadge, useAction } from '../components.jsx';
import { addMonths, dateLabel, money, monthLabel, thisMonth } from '../format.js';

export default function MonthlyReport() {
    const { group } = useAuth();
    const [period, setPeriod] = useState(thisMonth());
    const report = useApi('/reports/monthly', { period });
    const action = useAction();
    const cur = group.currency;

    const start = () =>
        action.run(async () => {
            await api('/dues/generate', { method: 'POST', body: { period } });
            report.reload();
        });
    const waive = (row) =>
        action.run(async () => {
            if (!window.confirm(`Remove the ${money(row.fine, cur)} late fine for ${row.member_name}?`)) return;
            await api(`/dues/${row.due_id}`, { method: 'PUT', body: { late_fine: 0 } });
            report.reload();
        });
    const get = (format) => action.run(() => download('/reports/monthly', { period, format }));

    const r = report.data;

    return (
        <>
            <PageHeader
                title="Monthly report"
                subtitle={r?.started ? `Deadline ${dateLabel(r.due_date)}${r.deadline_passed ? ' (passed)' : ''}` : undefined}
                actions={
                    r?.started && (
                        <>
                            <button type="button" className="btn btn-secondary" onClick={() => get('xlsx')} disabled={action.busy}>
                                Download Excel
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => get('pdf')} disabled={action.busy}>
                                Download PDF
                            </button>
                        </>
                    )
                }
            />

            <div className="mb-5 flex items-center gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPeriod(addMonths(period, -1))} aria-label="Previous month">
                    ‹
                </button>
                <input className="input w-auto" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPeriod(addMonths(period, 1))} aria-label="Next month">
                    ›
                </button>
            </div>

            <ErrorBox error={report.error || action.error} className="mb-4" />
            {report.loading && !r ? (
                <Loading />
            ) : r && !r.started ? (
                <div className="card text-center">
                    <p className="text-gray-700">{monthLabel(period)} has not been started.</p>
                    <button type="button" className="btn btn-primary mt-3" onClick={start} disabled={action.busy}>
                        Start {monthLabel(period)}
                    </button>
                </div>
            ) : r ? (
                <>
                    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Stat label="Expected" value={money(r.totals.expected + r.totals.fines, cur)} hint={r.totals.fines ? `incl. ${money(r.totals.fines, cur)} fines` : undefined} />
                        <Stat label="Collected" value={money(r.totals.collected, cur)} tone="good" />
                        <Stat label="Outstanding" value={money(r.totals.outstanding, cur)} tone={r.totals.outstanding ? 'bad' : 'good'} />
                        <Stat label="Members" value={`${r.totals.paid + r.totals.paid_late} / ${r.totals.members} paid`} hint={`${r.totals.partial} partial · ${r.totals.unpaid} unpaid`} />
                    </div>
                    <div className="card -mx-4 overflow-x-auto p-0 sm:mx-0 sm:p-0">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Member</th>
                                    <th className="text-right">Required</th>
                                    <th className="text-right">Fine</th>
                                    <th className="text-right">Paid</th>
                                    <th className="text-right">Balance</th>
                                    <th>Status</th>
                                    <th>Last paid</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {r.rows.map((row) => (
                                    <tr key={row.due_id}>
                                        <td className="whitespace-nowrap font-medium">
                                            <Link to={`/members/${row.user_id}`} className="hover:underline">
                                                {row.member_name}
                                            </Link>
                                        </td>
                                        <td className="text-right">{row.required_amount.toLocaleString()}</td>
                                        <td className="text-right">{row.fine ? row.fine.toLocaleString() : '-'}</td>
                                        <td className="text-right">{row.paid.toLocaleString()}</td>
                                        <td className={`text-right font-medium ${row.balance > 0 ? 'text-red-700' : ''}`}>{row.balance.toLocaleString()}</td>
                                        <td>
                                            <StatusBadge label={row.status_label} />
                                        </td>
                                        <td className="whitespace-nowrap text-gray-600">{dateLabel(row.last_paid_at)}</td>
                                        <td className="text-right">
                                            {row.fine > 0 && (
                                                <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={() => waive(row)}>
                                                    Waive fine
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-semibold">
                                    <td className="px-3 py-2">Total</td>
                                    <td className="px-3 py-2 text-right">{r.totals.expected.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">{r.totals.fines.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">{r.totals.collected.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">{r.totals.outstanding.toLocaleString()}</td>
                                    <td colSpan={3} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Amounts in {cur}. Members who joined after this month are not listed.</p>
                </>
            ) : null}
        </>
    );
}
