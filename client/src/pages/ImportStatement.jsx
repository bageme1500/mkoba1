import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Empty, ErrorBox, Field, Loading, MemberSelect, Notice, PageHeader, useAction } from '../components.jsx';
import { dateLabel, money } from '../format.js';

const FIELDS = [
    { key: 'date', label: 'Date', required: true },
    { key: 'amount', label: 'Amount received', required: true, hint: 'e.g. "Paid In"' },
    { key: 'reference', label: 'Reference / receipt', hint: 'Stops the same payment being recorded twice' },
    { key: 'phone', label: 'Phone number', hint: 'Optional: phones inside other columns are found too' },
    { key: 'name', label: 'Payer name / details', hint: 'Used when there is no phone number' },
];

const STATUS = {
    matched: ['Recorded', 'bg-emerald-400/15 text-emerald-200'],
    unmatched: ['Needs a member', 'bg-amber-400/15 text-amber-200'],
    duplicate: ['Already recorded', 'bg-white/10 text-slate-300'],
    invalid: ['Could not read', 'bg-rose-400/15 text-rose-200'],
    skipped: ['Skipped', 'bg-white/10 text-slate-400'],
};

export default function ImportStatement() {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [mapping, setMapping] = useState({});
    const [result, setResult] = useState(null);
    const history = useApi('/imports');
    const action = useAction();

    const reset = () => {
        setFile(null);
        setPreview(null);
        setResult(null);
        setMapping({});
    };

    const upload = (e) => {
        e.preventDefault();
        if (!file) return;
        action.run(async () => {
            const form = new FormData();
            form.append('file', file);
            const p = await api('/imports/preview', { method: 'POST', form });
            setPreview(p);
            setMapping(p.suggested_mapping);
        });
    };

    const confirm = () =>
        action.run(async () => {
            const form = new FormData();
            form.append('file', file);
            form.append('mapping', JSON.stringify(mapping));
            setResult(await api('/imports', { method: 'POST', form }));
            setPreview(null);
            history.reload();
        });

    const openImport = (id) =>
        action.run(async () => {
            setPreview(null);
            setResult(await api(`/imports/${id}`));
        });

    return (
        <>
            <PageHeader
                icon={Upload}
                title="Upload statement"
                subtitle="Upload an M-Pesa or M-Koba statement (CSV or Excel). Deposits are matched to members by phone number."
                actions={
                    (preview || result) && (
                        <button type="button" className="btn btn-secondary" onClick={reset}>
                            Upload another
                        </button>
                    )
                }
            />
            <ErrorBox error={action.error} className="mb-4" />

            {!preview && !result && (
                <form onSubmit={upload} className="card mb-6 space-y-4">
                    <Field label="Statement file" hint=".csv or .xlsx, up to 5 MB">
                        <input className="input file:mr-3 file:rounded-lg file:border-0 file:bg-brand-400/20 file:px-3 file:py-1 file:text-brand-100" type="file" accept=".csv,.xlsx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
                    </Field>
                    <button className="btn btn-primary" disabled={!file || action.busy}>
                        {action.busy ? 'Reading…' : 'Next: check columns'}
                    </button>
                </form>
            )}

            {preview && (
                <section className="card mb-6 space-y-4">
                    <div>
                        <h2 className="font-semibold">Which column is which?</h2>
                        <p className="text-sm text-slate-400">
                            {preview.filename}: {preview.total_rows} rows. We guessed the columns; check them before importing.
                        </p>
                    </div>
                    {preview.warnings.map((w) => (
                        <Notice key={w} tone="warning">
                            {w}
                        </Notice>
                    ))}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {FIELDS.map((f) => (
                            <Field key={f.key} label={`${f.label}${f.required ? '' : ' (optional)'}`} hint={f.hint}>
                                <select className="input" value={mapping[f.key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))} required={f.required}>
                                    <option value="">{f.required ? 'Choose column' : 'Not in this file'}</option>
                                    {preview.headers.map((h) => (
                                        <option key={h} value={h}>
                                            {h}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        ))}
                    </div>
                    <div>
                        <p className="mb-2 text-sm font-medium text-slate-200">First rows of the file</p>
                        <div className="-mx-4 overflow-x-auto sm:mx-0">
                            <table className="table">
                                <thead>
                                    <tr>
                                        {preview.headers.map((h) => (
                                            <th key={h} className={Object.values(mapping).includes(h) ? '!bg-brand-400/15 !text-brand-200' : ''}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.sample.map((r) => (
                                        <tr key={r.row_number}>
                                            {preview.headers.map((h) => (
                                                <td key={h} className="max-w-xs truncate text-xs">
                                                    {r.values[h]}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <button type="button" className="btn btn-primary" onClick={confirm} disabled={action.busy || !mapping.date || !mapping.amount}>
                        {action.busy ? 'Importing…' : `Import ${preview.total_rows} rows`}
                    </button>
                </section>
            )}

            {result && <ImportResult result={result} onChange={setResult} />}

            <section className="card">
                <h2 className="mb-3 font-semibold">Previous uploads</h2>
                {history.loading && !history.data ? (
                    <Loading />
                ) : history.data?.length ? (
                    <ul className="divide-y divide-white/5">
                        {history.data.map((i) => (
                            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                <div>
                                    <p className="font-medium">{i.filename}</p>
                                    <p className="text-xs text-slate-400">
                                        {dateLabel(i.created_at)} by {i.uploaded_by_name || 'unknown'} · {i.matched_rows} recorded
                                        {i.unmatched_rows > 0 && <span className="text-amber-300"> · {i.unmatched_rows} need a member</span>}
                                    </p>
                                </div>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openImport(i.id)}>
                                    View
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <Empty icon={FileSpreadsheet}>No statements uploaded yet.</Empty>
                )}
            </section>
        </>
    );
}

function ImportResult({ result, onChange }) {
    const { group } = useAuth();
    const [show, setShow] = useState('attention');
    const rows = result.rows.filter((r) => (show === 'attention' ? ['unmatched', 'invalid'].includes(r.status) : show === 'all' ? true : r.status === show));

    return (
        <section className="card mb-6">
            <h2 className="font-semibold">Result: {result.filename}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                {[
                    ['matched', result.matched_rows],
                    ['unmatched', result.unmatched_rows],
                    ['duplicate', result.duplicate_rows],
                    ['invalid', result.invalid_rows],
                    ['skipped', result.skipped_rows],
                ].map(([status, n]) => (
                    <button key={status} type="button" onClick={() => setShow(status)} className={`rounded-lg px-3 py-2 text-left ${STATUS[status][1]} ${show === status ? 'ring-2 ring-brand-400' : ''}`}>
                        <span className="block text-lg font-semibold">{n}</span>
                        {STATUS[status][0]}
                    </button>
                ))}
            </div>
            <div className="mt-3 flex gap-2 text-sm">
                <button type="button" className={`btn btn-sm ${show === 'attention' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShow('attention')}>
                    Needs attention
                </button>
                <button type="button" className={`btn btn-sm ${show === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShow('all')}>
                    All rows
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="mt-4">
                    <Empty>{show === 'attention' ? 'Nothing needs attention.' : 'No rows here.'}</Empty>
                </div>
            ) : (
                <ul className="mt-4 divide-y divide-white/5">
                    {rows.map((r) => (
                        <ImportRow key={r.id} row={r} currency={group.currency} onChange={onChange} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function ImportRow({ row, currency, onChange }) {
    const [userId, setUserId] = useState('');
    const [period, setPeriod] = useState('');
    const action = useAction();

    const assign = () =>
        action.run(async () => {
            onChange(await api(`/imports/rows/${row.id}/assign`, { method: 'POST', body: { user_id: userId, period: period || undefined } }));
        });
    const skip = () => action.run(async () => onChange(await api(`/imports/rows/${row.id}/skip`, { method: 'POST' })));

    return (
        <li className="py-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-medium">
                        Row {row.row_number}: {row.amount !== null ? money(row.amount, currency) : '-'} {row.paid_at && <span className="font-normal text-slate-400">on {dateLabel(row.paid_at)}</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                        {[row.payer_name, row.phone, row.reference].filter(Boolean).join(' · ') || 'No details'}
                    </p>
                    <p className="text-xs text-slate-300">{row.member_name ? `${row.message} → ${row.member_name}` : row.message}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[row.status][1]}`}>{STATUS[row.status][0]}</span>
            </div>
            {row.status === 'unmatched' && (
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem_auto_auto]">
                    <MemberSelect value={userId} onChange={setUserId} emptyLabel="Who paid this?" />
                    <input className="input" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="For month (optional)" title="For month (optional)" />
                    <button type="button" className="btn btn-primary btn-sm" onClick={assign} disabled={!userId || action.busy}>
                        Record for member
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={skip} disabled={action.busy}>
                        Not a contribution
                    </button>
                </div>
            )}
            <ErrorBox error={action.error} className="mt-2" />
        </li>
    );
}
