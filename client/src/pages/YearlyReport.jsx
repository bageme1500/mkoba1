import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { CalendarRange, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Empty, ErrorBox, Loading, PageHeader, Stat, useAction } from '../components.jsx';
import { money, shortMonth } from '../format.js';

const CELL = {
    paid: 'bg-emerald-400/15 text-emerald-200',
    partial: 'bg-amber-400/15 text-amber-200',
    unpaid: 'bg-rose-400/15 text-rose-200',
};

export default function YearlyReport() {
    const { group } = useAuth();
    const [year, setYear] = useState(new Date().getFullYear());
    const report = useApi('/reports/yearly', { year });
    const action = useAction();
    const cur = group.currency;
    const r = report.data;
    const get = (format) => action.run(() => download('/reports/yearly', { year, format }));

    return (
        <>
            <PageHeader
                icon={CalendarRange}
                title="Yearly summary"
                subtitle="What each member has paid every month, and what they still owe."
                actions={
                    r?.rows.length > 0 && (
                        <>
                            <button type="button" className="btn btn-secondary" onClick={() => get('xlsx')} disabled={action.busy}>
                                <Download className="h-4 w-4" aria-hidden="true" /> Excel
                            </button>
                            <button type="button" className="btn btn-secondary" onClick={() => get('pdf')} disabled={action.busy}>
                                <Download className="h-4 w-4" aria-hidden="true" /> PDF
                            </button>
                        </>
                    )
                }
            />
            <div className="mb-5 flex items-center gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-16 text-center font-semibold">{year}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            <ErrorBox error={report.error || action.error} className="mb-4" />
            {report.loading && !r ? (
                <Loading />
            ) : r && r.rows.length === 0 ? (
                <Empty>No months started in {year}.</Empty>
            ) : r ? (
                <>
                    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Stat label="Required" value={money(r.totals.required, cur)} />
                        <Stat label="Fines" value={money(r.totals.fines, cur)} />
                        <Stat label="Paid" value={money(r.totals.paid, cur)} tone="good" />
                        <Stat label="Still owed" value={money(r.totals.balance, cur)} tone={r.totals.balance ? 'bad' : 'good'} />
                    </div>
                    <div className="card -mx-4 overflow-x-auto p-0 sm:mx-0 sm:p-0">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10">Member</th>
                                    {r.months.map((m) => (
                                        <th key={m} className="text-right">
                                            {shortMonth(m)}
                                        </th>
                                    ))}
                                    <th className="text-right">Paid</th>
                                    <th className="text-right">Owes</th>
                                    <th className="text-right">Late</th>
                                    <th className="text-right">Credit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {r.rows.map((row) => (
                                    <tr key={row.user_id}>
                                        <td className="sticky left-0 z-10 whitespace-nowrap bg-[#0b1726] font-medium">
                                            <Link to={`/members/${row.user_id}`} className="hover:underline">
                                                {row.member_name}
                                            </Link>
                                            {!row.active && <span className="ml-1 text-xs text-slate-500">(inactive)</span>}
                                        </td>
                                        {r.months.map((m) => {
                                            const c = row.months[m];
                                            return (
                                                <td key={m} className={`text-right text-xs ${c ? CELL[c.status] : 'text-slate-600'}`} title={c ? `${c.status_label}${c.balance ? `, owes ${c.balance.toLocaleString()}` : ''}` : 'Not a member yet'}>
                                                    {c ? c.paid.toLocaleString() : '·'}
                                                </td>
                                            );
                                        })}
                                        <td className="text-right font-medium">{row.totals.paid.toLocaleString()}</td>
                                        <td className={`text-right font-medium ${row.totals.balance ? 'text-rose-300' : ''}`}>{row.totals.balance.toLocaleString()}</td>
                                        <td className="text-right">{row.totals.late_months}</td>
                                        <td className="text-right">{row.credit ? row.credit.toLocaleString() : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                        Amounts paid per month in {cur}. Green = paid, yellow = partial, red = unpaid. Hover a cell for details.
                    </p>
                </>
            ) : null}
        </>
    );
}
