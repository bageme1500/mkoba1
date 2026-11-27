import { useEffect, useState } from 'react';
import { CalendarRange, FileSpreadsheet, HandCoins, History, Landmark, Settings, UserRound, Wallet } from 'lucide-react';
import { api } from './api.js';
import { Avatar, Empty, ErrorBox, Loading } from './components.jsx';
import { dateLabel } from './format.js';

const ICONS = {
    payment: Wallet,
    submission: HandCoins,
    cash_entry: Landmark,
    balance_check: Landmark,
    member: UserRound,
    user: UserRound,
    month: CalendarRange,
    import: FileSpreadsheet,
    group: Settings,
};

const TONES = {
    create: 'text-emerald-300',
    approve: 'text-emerald-300',
    start: 'text-sky-300',
    update: 'text-amber-300',
    delete: 'text-rose-300',
    reject: 'text-rose-300',
    deactivate: 'text-rose-300',
};

const timeLabel = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayKey = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const show = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function Changes({ before, after }) {
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
    if (keys.length === 0) return null;
    return (
        <div className="glass-subtle mt-2 overflow-x-auto rounded-xl">
            <table className="w-full text-left text-xs">
                <thead>
                    <tr className="text-slate-500">
                        <th className="px-3 py-1.5 font-medium">Field</th>
                        {before && <th className="px-3 py-1.5 font-medium">Before</th>}
                        {after && <th className="px-3 py-1.5 font-medium">After</th>}
                    </tr>
                </thead>
                <tbody>
                    {keys.map((k) => (
                        <tr key={k} className="border-t border-white/5">
                            <td className="px-3 py-1.5 text-slate-400">{k.replaceAll('_', ' ')}</td>
                            {before && <td className="px-3 py-1.5 text-rose-200/90">{show(before[k])}</td>}
                            {after && <td className="px-3 py-1.5 text-emerald-200/90">{show(after[k])}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Item({ item }) {
    const [open, setOpen] = useState(false);
    const Icon = ICONS[item.entity] || History;
    const verb = item.action.split('.')[1];
    const hasDetails = item.before || item.after;
    return (
        <li className="relative flex gap-3 py-3">
            <span className="mt-0.5 rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
                <Icon className={`h-4 w-4 ${TONES[verb] || 'text-slate-300'}`} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-100">{item.summary}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    {item.actor_name ? (
                        <>
                            <Avatar name={item.actor_name} className="h-4 w-4 text-[8px]" /> {item.actor_name}
                        </>
                    ) : (
                        'System'
                    )}
                    <span>· {timeLabel(item.created_at)}</span>
                    {hasDetails && (
                        <button type="button" className="ml-1 text-brand-300 hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                            {open ? 'Hide details' : 'Details'}
                        </button>
                    )}
                </p>
                {open && <Changes before={item.before} after={item.after} />}
            </div>
        </li>
    );
}

// Timeline of audit entries grouped by day, with "Load older".
export default function ActivityList({ query, emptyText = 'Nothing recorded yet.' }) {
    const [items, setItems] = useState([]);
    const [next, setNext] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const key = JSON.stringify(query);

    const load = async (before) => {
        setLoading(true);
        setError(null);
        try {
            const page = await api('/audit', { query: { ...query, before } });
            setItems((prev) => (before ? [...prev, ...page.items] : page.items));
            setNext(page.next_before);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    if (error) return <ErrorBox error={error} />;
    if (loading && items.length === 0) return <Loading />;
    if (items.length === 0) return <Empty icon={History}>{emptyText}</Empty>;

    const days = [];
    for (const item of items) {
        const k = dayKey(item.created_at);
        if (!days.length || days[days.length - 1].key !== k) days.push({ key: k, items: [] });
        days[days.length - 1].items.push(item);
    }

    return (
        <div>
            {days.map((d) => (
                <section key={d.key} className="mb-2">
                    <h3 className="sticky top-14 z-10 py-1 text-xs font-semibold tracking-wide text-slate-500 uppercase lg:top-0">{dateLabel(d.key)}</h3>
                    <ul className="divide-y divide-white/5">
                        {d.items.map((item) => (
                            <Item key={item.id} item={item} />
                        ))}
                    </ul>
                </section>
            ))}
            {next && (
                <button type="button" className="btn btn-secondary mt-2 w-full" onClick={() => load(next)} disabled={loading}>
                    {loading ? 'Loading…' : 'Load older'}
                </button>
            )}
        </div>
    );
}
