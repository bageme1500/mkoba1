import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { CalendarRange, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Empty, ErrorBox, Loading, PageHeader, Stat, useAction } from '../components.jsx';
import { money, monthLabel, shortMonth } from '../format.js';
import { useT } from '../i18n.jsx';
import { BarChart } from '../charts.jsx';

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
    const { t } = useT();
    const cur = group.currency;
    const r = report.data;
    const get = (format) => action.run(() => download('/reports/yearly', { year, format }));

    return (
        <>
            <PageHeader
                icon={CalendarRange}
                title={t('Yearly summary')}
                subtitle={t('What each member has paid every month, and what they still owe.')}
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setYear((y) => y - 1)} aria-label={t('Previous year')}>
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-16 text-center font-semibold">{year}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setYear((y) => y + 1)} aria-label={t('Next year')}>
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            <ErrorBox error={report.error || action.error} className="mb-4" />
            {report.loading && !r ? (
                <Loading />
            ) : r && r.rows.length === 0 ? (
                <Empty>{t('No months started in {year}.', { year })}</Empty>
            ) : r ? (
                <>
                    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Stat label={t('Required')} value={money(r.totals.required, cur)} />
                        <Stat label={t('Fines')} value={money(r.totals.fines, cur)} />
                        <Stat label={t('Paid')} value={money(r.totals.paid, cur)} tone="good" />
                        <Stat label={t('Still owed')} value={money(r.totals.balance, cur)} tone={r.totals.balance ? 'bad' : 'good'} />
                    </div>
                    <section className="card mb-5">
                        <h2 className="mb-3 font-semibold">{t('Collected per month')}</h2>
                        <BarChart
                            ariaLabel={t('Expected and collected per month')}
                            data={r.months.map((m) => ({ label: shortMonth(m), title: monthLabel(m), values: [r.month_totals[m]?.expected ?? 0, r.month_totals[m]?.collected ?? 0] }))}
                            series={[
                                { name: t('Expected'), color: 'rgb(148 163 184)' },
                                { name: t('Collected'), color: 'rgb(45 212 191)' },
                            ]}
                            height={180}
                        />
                    </section>
                    <div className="card -mx-4 overflow-x-auto p-0 sm:mx-0 sm:p-0">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10">{t('Member')}</th>
                                    {r.months.map((m) => (
                                        <th key={m} className="text-right">
                                            {shortMonth(m)}
                                        </th>
                                    ))}
                                    <th className="text-right">{t('Paid')}</th>
                                    <th className="text-right">{t('Owes')}</th>
                                    <th className="text-right">{t('Late')}</th>
                                    <th className="text-right">{t('Credit')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {r.rows.map((row) => (
                                    <tr key={row.user_id}>
                                        <td className="sticky left-0 z-10 whitespace-nowrap bg-[#0b1726] font-medium">
                                            <Link to={`/members/${row.user_id}`} className="hover:underline">
                                                {row.member_name}
                                            </Link>
                                            {!row.active && <span className="ml-1 text-xs text-slate-500">({t('inactive')})</span>}
                                        </td>
                                        {r.months.map((m) => {
                                            const c = row.months[m];
                                            return (
                                                <td key={m} className={`text-right text-xs ${c ? CELL[c.status] : 'text-slate-600'}`} title={c ? `${t(c.status_label)}${c.balance ? `, ${t('owes {amount}', { amount: c.balance.toLocaleString() })}` : ''}` : t('Not a member yet')}>
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
                        {t('Amounts paid per month in {currency}. Green = paid, yellow = partial, red = unpaid. Hover a cell for details.', { currency: cur })}
                    </p>
                </>
            ) : null}
        </>
    );
}
