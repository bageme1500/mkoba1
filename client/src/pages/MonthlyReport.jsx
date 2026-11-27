import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { ChevronLeft, ChevronRight, CircleCheck, Download, FileChartColumn, Target, Wallet } from 'lucide-react';
import { ErrorBox, Loading, PageHeader, Stat, StatusBadge, useAction, useConfirm } from '../components.jsx';
import { addMonths, dateLabel, money, monthLabel, thisMonth } from '../format.js';
import { useT } from '../i18n.jsx';

export default function MonthlyReport() {
    const { group } = useAuth();
    const [period, setPeriod] = useState(thisMonth());
    const report = useApi('/reports/monthly', { period });
    const action = useAction();
    const confirm = useConfirm();
    const { t } = useT();
    const cur = group.currency;

    const start = () =>
        action.run(async () => {
            await api('/dues/generate', { method: 'POST', body: { period } });
            report.reload();
        });
    const waive = (row) =>
        action.run(async () => {
            if (!(await confirm({ title: t('Waive late fine?'), message: t('Remove the {amount} late fine for {name} for {month}.', { amount: money(row.fine, cur), name: row.member_name, month: monthLabel(period) }), confirmLabel: t('Waive fine') }))) return;
            await api(`/dues/${row.due_id}`, { method: 'PUT', body: { late_fine: 0 } });
            report.reload();
        });
    const get = (format) => action.run(() => download('/reports/monthly', { period, format }));

    const r = report.data;

    return (
        <>
            <PageHeader
                icon={FileChartColumn}
                title={t('Monthly report')}
                subtitle={r?.started ? `${t('Deadline {date}', { date: dateLabel(r.due_date) })}${r.deadline_passed ? ` (${t('passed')})` : ''}` : undefined}
                actions={
                    r?.started && (
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
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPeriod(addMonths(period, -1))} aria-label={t('Previous month')}>
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <input className="input w-auto" type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPeriod(addMonths(period, 1))} aria-label={t('Next month')}>
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            <ErrorBox error={report.error || action.error} className="mb-4" />
            {report.loading && !r ? (
                <Loading />
            ) : r && !r.started ? (
                <div className="card text-center">
                    <p className="text-slate-200">{t('{month} has not been started yet.', { month: monthLabel(period) })}</p>
                    <button type="button" className="btn btn-primary mt-3" onClick={start} disabled={action.busy}>
                        {t('Start {month}', { month: monthLabel(period) })}
                    </button>
                </div>
            ) : r ? (
                <>
                    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Stat label={t('Expected')} icon={Target} value={money(r.totals.expected + r.totals.fines, cur)} hint={r.totals.fines ? t('incl. {amount} fines', { amount: money(r.totals.fines, cur) }) : undefined} />
                        <Stat label={t('Collected')} icon={Wallet} value={money(r.totals.collected, cur)} tone="good" />
                        <Stat label={t('Outstanding')} value={money(r.totals.outstanding, cur)} tone={r.totals.outstanding ? 'bad' : 'good'} />
                        <Stat label={t('Members')} icon={CircleCheck} tone="info" value={t('{paid} / {total} paid', { paid: r.totals.paid + r.totals.paid_late, total: r.totals.members })} hint={t('{partial} partial · {unpaid} unpaid', { partial: r.totals.partial, unpaid: r.totals.unpaid })} />
                    </div>
                    <div className="card -mx-4 overflow-x-auto p-0 sm:mx-0 sm:p-0">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>{t('Member')}</th>
                                    <th className="text-right">{t('Required')}</th>
                                    <th className="text-right">{t('Fine')}</th>
                                    <th className="text-right">{t('Paid')}</th>
                                    <th className="text-right">{t('Balance')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Last paid')}</th>
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
                                        <td className={`text-right font-medium ${row.balance > 0 ? 'text-rose-300' : ''}`}>{row.balance.toLocaleString()}</td>
                                        <td>
                                            <StatusBadge label={row.status_label} />
                                        </td>
                                        <td className="whitespace-nowrap text-slate-300">{dateLabel(row.last_paid_at)}</td>
                                        <td className="text-right">
                                            {row.fine > 0 && (
                                                <button type="button" className="btn btn-secondary btn-sm whitespace-nowrap" onClick={() => waive(row)}>
                                                    {t('Waive fine')}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-semibold">
                                    <td className="px-3 py-2">{t('Total')}</td>
                                    <td className="px-3 py-2 text-right">{r.totals.expected.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">{r.totals.fines.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">{r.totals.collected.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">{r.totals.outstanding.toLocaleString()}</td>
                                    <td colSpan={3} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{t('Amounts in {currency}. Members who joined after this month are not listed.', { currency: cur })}</p>
                </>
            ) : null}
        </>
    );
}
