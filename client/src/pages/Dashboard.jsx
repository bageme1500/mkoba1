import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, CircleX, Copy, Hourglass, MessageCircle, Plus, Upload, Wallet } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useT } from '../i18n.jsx';
import { useApi } from '../useApi.js';
import Approvals from '../Approvals.jsx';
import { BarChart, Donut } from '../charts.jsx';
import { Avatar, Empty, ErrorBox, Loading, Notice, PageHeader, Stat, StatusBadge, useAction } from '../components.jsx';
import { dateLabel, money, monthLabel, ordinal, shortMonth, thisMonth } from '../format.js';

export default function Dashboard() {
    const { group } = useAuth();
    const { t, lang } = useT();
    const period = thisMonth();
    const report = useApi('/reports/monthly', { period });
    const [msgLang, setMsgLang] = useState(lang);
    const reminders = useApi('/reports/reminders', { lang: msgLang });
    const recent = useApi('/payments', { from: `${period}-01` });
    const trend = useApi('/reports/trend', { months: 12 });
    const start = useAction();

    const startMonth = () =>
        start.run(async () => {
            await api('/dues/generate', { method: 'POST', body: { period } });
            report.reload();
            reminders.reload();
        });

    if (report.loading && !report.data) return <Loading />;
    if (report.error) return <ErrorBox error={report.error} />;
    const r = report.data;
    const cur = group.currency;

    if (!r.started) {
        return (
            <>
                <PageHeader title={monthLabel(period)} subtitle={group.name} />
                <div className="card text-center">
                    <p className="text-slate-200">{t('{month} has not been started yet.', { month: monthLabel(period) })}</p>
                    <p className="mt-1 text-sm text-slate-400">
                        {t('Starting the month gives every active member {amount} to pay by the {day}.', { amount: money(group.monthly_amount, cur), day: ordinal(group.due_day) })}
                    </p>
                    <ErrorBox error={start.error} className="mt-3" />
                    <button type="button" className="btn btn-primary mt-4" onClick={startMonth} disabled={start.busy}>
                        {start.busy ? t('Starting…') : t('Start {month}', { month: monthLabel(period) })}
                    </button>
                </div>
            </>
        );
    }

    const tot = r.totals;
    const target = tot.expected + tot.fines;
    const pct = target > 0 ? Math.min(100, Math.round((tot.collected / target) * 100)) : 0;
    const rem = reminders.data;
    const daysText = !rem?.started
        ? ''
        : rem.days_left > 1
          ? t('{n} days left', { n: rem.days_left })
          : rem.days_left === 1
            ? t('1 day left')
            : rem.days_left === 0
              ? t('due today')
              : t('deadline passed');

    return (
        <>
            <PageHeader
                title={monthLabel(period)}
                subtitle={`${t('Deadline {date}', { date: dateLabel(r.due_date) })}${daysText ? ` · ${daysText}` : ''}`}
                actions={
                    <>
                        <Link to="/payments" className="btn btn-primary">
                            <Plus className="h-4 w-4" aria-hidden="true" /> {t('Record payment')}
                        </Link>
                        <Link to="/import" className="btn btn-secondary">
                            <Upload className="h-4 w-4" aria-hidden="true" /> {t('Upload statement')}
                        </Link>
                    </>
                }
            />

            <Approvals
                onChange={() => {
                    report.reload();
                    reminders.reload();
                    recent.reload();
                }}
            />

            <div className="card mb-4">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-200">{t('Collected this month')}</span>
                    <span className="text-right text-slate-400">{t('{collected} of {target}', { collected: money(tot.collected, cur), target: money(target, cur) })}</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-emerald-400 shadow-[0_0_16px_rgb(45_212_191/0.6)] transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-right text-xs text-slate-400">{pct}%</p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t('Paid')} icon={CircleCheck} value={tot.paid + tot.paid_late} hint={tot.paid_late ? t('{n} paid late', { n: tot.paid_late }) : t('of {n} members', { n: tot.members })} tone="good" />
                <Stat label={t('Partial')} icon={Hourglass} value={tot.partial} tone="warn" />
                <Stat label={t('Not paid')} icon={CircleX} value={tot.unpaid} tone="bad" />
                <Stat label={t('Outstanding')} icon={Wallet} value={money(tot.outstanding, cur)} />
            </div>

            <div className="mb-6 grid gap-6 lg:grid-cols-5">
                <section className="card lg:col-span-3">
                    <h2 className="mb-3 font-semibold">{t('Last 12 months')}</h2>
                    {trend.data ? (
                        <BarChart
                            ariaLabel={t('Expected and collected per month')}
                            data={trend.data.map((m) => ({ label: shortMonth(m.period), title: monthLabel(m.period), values: [m.expected, m.collected] }))}
                            series={[
                                { name: t('Expected'), color: 'rgb(148 163 184)' },
                                { name: t('Collected'), color: 'rgb(45 212 191)' },
                            ]}
                        />
                    ) : (
                        <Loading rows={3} />
                    )}
                </section>
                <section className="card lg:col-span-2">
                    <h2 className="mb-4 font-semibold">{t('This month')}</h2>
                    <Donut
                        ariaLabel={t('Members by status this month')}
                        centerValue={`${pct}%`}
                        centerLabel={t('collected')}
                        segments={[
                            { label: t('Paid'), value: tot.paid, color: 'rgb(52 211 153)' },
                            { label: t('Paid late'), value: tot.paid_late, color: 'rgb(56 189 248)' },
                            { label: t('Partial'), value: tot.partial, color: 'rgb(251 191 36)' },
                            { label: t('Unpaid'), value: tot.unpaid, color: 'rgb(251 113 133)' },
                        ]}
                    />
                </section>
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
                <section className="card lg:col-span-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold">{t('Still to pay')}</h2>
                        <div className="flex gap-1" role="group" aria-label={t('Message language')}>
                            {[
                                ['sw', 'Kiswahili'],
                                ['en', 'English'],
                            ].map(([code, label]) => (
                                <button key={code} type="button" onClick={() => setMsgLang(code)} className={`btn btn-sm ${msgLang === code ? 'btn-primary' : 'btn-secondary'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Reminders data={rem} loading={reminders.loading} error={reminders.error} currency={cur} />
                </section>

                <section className="card lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-semibold">{t('Payments this month')}</h2>
                        <Link to="/payments" className="text-sm text-brand-300 hover:underline">
                            {t('All')}
                        </Link>
                    </div>
                    {recent.loading && !recent.data ? (
                        <Loading />
                    ) : recent.data?.length ? (
                        <ul className="divide-y divide-white/5">
                            {recent.data.slice(0, 8).map((p) => (
                                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                                    <Avatar name={p.member_name} className="h-8 w-8 text-xs" />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium">{p.member_name}</p>
                                        <p className="text-xs text-slate-400">
                                            {dateLabel(p.paid_at)} · {p.method.toUpperCase()}
                                        </p>
                                    </div>
                                    <span className="whitespace-nowrap font-medium">{money(p.amount, cur)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <Empty icon={Wallet}>{t('No payments yet this month.')}</Empty>
                    )}
                </section>
            </div>
        </>
    );
}

function Reminders({ data, loading, error, currency }) {
    const { t } = useT();
    const [copied, setCopied] = useState(false);
    if (error) return <ErrorBox error={error} />;
    if (loading && !data) return <Loading />;
    if (!data?.started) return null;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(data.message);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            window.prompt(t('Copy this message:'), data.message);
        }
    };
    const whatsapp = `https://wa.me/?text=${encodeURIComponent(data.message)}`;

    return (
        <>
            {data.members.length === 0 ? (
                <Notice>{t('Everyone has paid for this month.')}</Notice>
            ) : (
                <ul className="divide-y divide-white/5">
                    {data.members.map((m) => (
                        <li key={m.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <div>
                                <Link to={`/members/${m.user_id}`} className="font-medium hover:underline">
                                    {m.member_name}
                                </Link>
                                {m.owes_earlier > 0 && <p className="text-xs text-rose-300">{t('+ {amount} from earlier months', { amount: money(m.owes_earlier, currency) })}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="whitespace-nowrap font-medium">{money(m.owes_this_month, currency)}</span>
                                <StatusBadge label={m.status_label} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <details className="glass-subtle mt-4 rounded-xl p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-200">{t('Reminder message for WhatsApp')}</summary>
                <pre className="mt-2 font-sans text-sm whitespace-pre-wrap text-slate-100">{data.message}</pre>
            </details>
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? t('Copied!') : t('Copy message')}
                </button>
                <a className="btn btn-secondary btn-sm" href={whatsapp} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t('Open in WhatsApp')}
                </a>
            </div>
        </>
    );
}
