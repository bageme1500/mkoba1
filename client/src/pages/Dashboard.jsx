import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { Empty, ErrorBox, Loading, Notice, PageHeader, Stat, StatusBadge, useAction } from '../components.jsx';
import { dateLabel, money, monthLabel, ordinal, thisMonth } from '../format.js';

export default function Dashboard() {
    const { group } = useAuth();
    const period = thisMonth();
    const report = useApi('/reports/monthly', { period });
    const [lang, setLang] = useState('sw');
    const reminders = useApi('/reports/reminders', { lang });
    const recent = useApi('/payments', { from: `${period}-01` });
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
                    <p className="text-gray-700">{monthLabel(period)} has not been started yet.</p>
                    <p className="mt-1 text-sm text-gray-500">
                        Starting the month gives every active member {money(group.monthly_amount, cur)} to pay by the {ordinal(group.due_day)}.
                    </p>
                    <ErrorBox error={start.error} className="mt-3" />
                    <button type="button" className="btn btn-primary mt-4" onClick={startMonth} disabled={start.busy}>
                        {start.busy ? 'Starting…' : `Start ${monthLabel(period)}`}
                    </button>
                </div>
            </>
        );
    }

    const t = r.totals;
    const target = t.expected + t.fines;
    const pct = target > 0 ? Math.min(100, Math.round((t.collected / target) * 100)) : 0;
    const rem = reminders.data;

    return (
        <>
            <PageHeader
                title={monthLabel(period)}
                subtitle={`Deadline ${dateLabel(r.due_date)}${rem?.started ? ` · ${rem.days_left > 0 ? `${rem.days_left} day${rem.days_left === 1 ? '' : 's'} left` : rem.days_left === 0 ? 'today' : 'passed'}` : ''}`}
                actions={
                    <>
                        <Link to="/payments" className="btn btn-primary">
                            Record payment
                        </Link>
                        <Link to="/import" className="btn btn-secondary">
                            Upload statement
                        </Link>
                    </>
                }
            />

            <div className="card mb-4">
                <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-gray-700">Collected this month</span>
                    <span className="text-gray-500">
                        {money(t.collected, cur)} of {money(target, cur)}
                    </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-right text-xs text-gray-500">{pct}%</p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Paid" value={t.paid + t.paid_late} hint={t.paid_late ? `${t.paid_late} paid late` : `of ${t.members} members`} tone="good" />
                <Stat label="Partial" value={t.partial} tone="warn" />
                <Stat label="Not paid" value={t.unpaid} tone="bad" />
                <Stat label="Outstanding" value={money(t.outstanding, cur)} />
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
                <section className="card lg:col-span-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold">Still to pay</h2>
                        <div className="flex gap-1" role="group" aria-label="Message language">
                            {[
                                ['sw', 'Kiswahili'],
                                ['en', 'English'],
                            ].map(([code, label]) => (
                                <button key={code} type="button" onClick={() => setLang(code)} className={`btn btn-sm ${lang === code ? 'btn-primary' : 'btn-secondary'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <Reminders data={rem} loading={reminders.loading} error={reminders.error} currency={cur} />
                </section>

                <section className="card lg:col-span-2">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-semibold">Payments this month</h2>
                        <Link to="/payments" className="text-sm text-brand-700 hover:underline">
                            All
                        </Link>
                    </div>
                    {recent.loading && !recent.data ? (
                        <Loading />
                    ) : recent.data?.length ? (
                        <ul className="divide-y divide-gray-100">
                            {recent.data.slice(0, 8).map((p) => (
                                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                                    <div>
                                        <p className="font-medium">{p.member_name}</p>
                                        <p className="text-xs text-gray-500">
                                            {dateLabel(p.paid_at)} · {p.method.toUpperCase()}
                                        </p>
                                    </div>
                                    <span className="whitespace-nowrap font-medium">{money(p.amount, cur)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <Empty>No payments yet this month.</Empty>
                    )}
                </section>
            </div>
        </>
    );
}

function Reminders({ data, loading, error, currency }) {
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
            window.prompt('Copy this message:', data.message);
        }
    };
    const whatsapp = `https://wa.me/?text=${encodeURIComponent(data.message)}`;

    return (
        <>
            {data.members.length === 0 ? (
                <Notice>Everyone has paid for this month.</Notice>
            ) : (
                <ul className="divide-y divide-gray-100">
                    {data.members.map((m) => (
                        <li key={m.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <div>
                                <Link to={`/members/${m.user_id}`} className="font-medium hover:underline">
                                    {m.member_name}
                                </Link>
                                {m.owes_earlier > 0 && <p className="text-xs text-red-700">+ {money(m.owes_earlier, currency)} from earlier months</p>}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="whitespace-nowrap font-medium">{money(m.owes_this_month, currency)}</span>
                                <StatusBadge label={m.status_label} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <details className="mt-4 rounded-lg bg-gray-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">Reminder message for WhatsApp</summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-gray-800">{data.message}</pre>
            </details>
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
                    {copied ? 'Copied!' : 'Copy message'}
                </button>
                <a className="btn btn-secondary btn-sm" href={whatsapp} target="_blank" rel="noreferrer">
                    Open in WhatsApp
                </a>
            </div>
        </>
    );
}
