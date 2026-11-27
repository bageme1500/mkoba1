import { useEffect, useState } from 'react';
import { useApi } from './useApi.js';

const STATUS_STYLES = {
    Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    'Paid late': 'bg-sky-50 text-sky-700 ring-sky-600/20',
    Partial: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    Unpaid: 'bg-red-50 text-red-700 ring-red-600/20',
};

export function StatusBadge({ label }) {
    return (
        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[label] || 'bg-gray-100 text-gray-700 ring-gray-500/20'}`}>
            {label}
        </span>
    );
}

export function ErrorBox({ error, className = '' }) {
    if (!error) return null;
    return (
        <div role="alert" className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className}`}>
            <p>{error.message || String(error)}</p>
            {error.details?.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                    {error.details.map((d) => (
                        <li key={d}>{d}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function Notice({ children, tone = 'success', onClose }) {
    const tones = {
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        info: 'border-sky-200 bg-sky-50 text-sky-800',
        warning: 'border-amber-200 bg-amber-50 text-amber-900',
    };
    return (
        <div role="status" className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
            <div>{children}</div>
            {onClose && (
                <button type="button" onClick={onClose} className="text-xs underline" aria-label="Dismiss">
                    Close
                </button>
            )}
        </div>
    );
}

export function Loading({ label = 'Loading…' }) {
    return <p className="py-8 text-center text-sm text-gray-500">{label}</p>;
}

export function PageHeader({ title, subtitle, actions }) {
    return (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}

export function Stat({ label, value, hint, tone = 'default' }) {
    const tones = { default: 'text-gray-900', good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700' };
    return (
        <div className="card">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`mt-1 text-lg font-semibold sm:text-xl ${tones[tone]}`}>{value}</p>
            {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

export function Empty({ children }) {
    return <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">{children}</p>;
}

export function Modal({ title, onClose, children }) {
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                        Close
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

export function Field({ label, hint, children }) {
    return (
        <label className="block">
            <span className="label">{label}</span>
            {children}
            {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
        </label>
    );
}

// Dropdown of the group's active members.
export function MemberSelect({ value, onChange, required = false, allowEmpty = false, emptyLabel = 'Choose member' }) {
    const { data: members } = useApi('/users');
    return (
        <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')} required={required}>
            <option value="" disabled={!allowEmpty}>
                {emptyLabel}
            </option>
            {(members || []).map((m) => (
                <option key={m.id} value={m.id}>
                    {m.name}
                </option>
            ))}
        </select>
    );
}

// Runs an async action, tracking busy state and error.
export function useAction() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const run = async (fn) => {
        setBusy(true);
        setError(null);
        try {
            return await fn();
        } catch (err) {
            setError(err);
            return undefined;
        } finally {
            setBusy(false);
        }
    };
    return { busy, error, setError, run };
}
