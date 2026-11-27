import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Inbox, Info, TriangleAlert, X } from 'lucide-react';
import { useApi } from './useApi.js';

// ---------- background ----------

// Deep gradient with slowly drifting colour blobs that the glass panels blur.
export function Backdrop() {
    return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-to-br from-[#050b14] via-[#06201f] to-[#0d0b2a]">
            <div className="animate-drift-a absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-teal-500/25 blur-3xl" />
            <div className="animate-drift-b absolute top-1/3 -right-32 h-[32rem] w-[32rem] rounded-full bg-violet-600/20 blur-3xl" />
            <div className="animate-drift-a absolute -bottom-40 left-1/4 h-[26rem] w-[26rem] rounded-full bg-emerald-500/15 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(255_255_255/0.04),transparent_60%)]" />
        </div>
    );
}

// ---------- status ----------

const STATUS_STYLES = {
    Paid: 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/30',
    'Paid late': 'bg-sky-400/15 text-sky-200 ring-sky-300/30',
    Partial: 'bg-amber-400/15 text-amber-200 ring-amber-300/30',
    Unpaid: 'bg-rose-400/15 text-rose-200 ring-rose-300/30',
    Pending: 'bg-amber-400/15 text-amber-200 ring-amber-300/30',
    Approved: 'bg-emerald-400/15 text-emerald-200 ring-emerald-300/30',
    Rejected: 'bg-rose-400/15 text-rose-200 ring-rose-300/30',
};

export function StatusBadge({ label, children }) {
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${STATUS_STYLES[label] || 'bg-white/10 text-slate-200 ring-white/20'}`}>
            {children ?? label}
        </span>
    );
}

// ---------- messages ----------

export function ErrorBox({ error, className = '' }) {
    if (!error) return null;
    return (
        <div role="alert" className={`flex gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 ${className}`}>
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
            <div>
                <p>{error.message || String(error)}</p>
                {error.details?.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-rose-200/90">
                        {error.details.map((d) => (
                            <li key={d}>{d}</li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

const NOTICE = {
    success: ['border-emerald-400/30 bg-emerald-500/10 text-emerald-100', CircleCheck, 'text-emerald-300'],
    info: ['border-sky-400/30 bg-sky-500/10 text-sky-100', Info, 'text-sky-300'],
    warning: ['border-amber-400/30 bg-amber-500/10 text-amber-100', TriangleAlert, 'text-amber-300'],
};

export function Notice({ children, tone = 'success', onClose }) {
    const [cls, Icon, iconCls] = NOTICE[tone];
    return (
        <div role="status" className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${cls}`}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconCls}`} aria-hidden="true" />
            <div className="flex-1">{children}</div>
            {onClose && (
                <button type="button" onClick={onClose} className="rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss">
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}

// ---------- loading & empty ----------

export function Skeleton({ className = 'h-4 w-full' }) {
    return <div className={`skeleton ${className}`} />;
}

export function Loading({ label = 'Loading…', rows = 4 }) {
    return (
        <div className="space-y-3 py-4" aria-busy="true">
            <span className="sr-only">{label}</span>
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} className={`h-10 ${i % 2 ? 'w-11/12' : 'w-full'}`} />
            ))}
        </div>
    );
}

export function Empty({ children, icon: Icon = Inbox, action }) {
    return (
        <div className="glass-subtle flex flex-col items-center gap-2 rounded-2xl px-4 py-10 text-center">
            <span className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <Icon className="h-6 w-6 text-slate-400" aria-hidden="true" />
            </span>
            <p className="max-w-sm text-sm text-slate-400">{children}</p>
            {action}
        </div>
    );
}

// ---------- layout pieces ----------

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
    return (
        <div className="animate-rise mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
                {Icon && (
                    <span className="hidden rounded-2xl bg-gradient-to-br from-brand-400/30 to-emerald-500/20 p-2.5 ring-1 ring-white/15 sm:block">
                        <Icon className="h-6 w-6 text-brand-200" aria-hidden="true" />
                    </span>
                )}
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h1>
                    {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
                </div>
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}

const STAT_TONES = {
    default: ['text-white', 'from-white/15 to-white/5 text-slate-200'],
    good: ['text-emerald-300', 'from-emerald-400/30 to-emerald-500/5 text-emerald-200'],
    warn: ['text-amber-300', 'from-amber-400/30 to-amber-500/5 text-amber-200'],
    bad: ['text-rose-300', 'from-rose-400/30 to-rose-500/5 text-rose-200'],
    info: ['text-sky-300', 'from-sky-400/30 to-sky-500/5 text-sky-200'],
};

export function Stat({ label, value, hint, tone = 'default', icon: Icon }) {
    const [valueCls, iconCls] = STAT_TONES[tone];
    return (
        <div className="card animate-rise">
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
                {Icon && (
                    <span className={`rounded-xl bg-gradient-to-br p-1.5 ring-1 ring-white/10 ${iconCls}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                )}
            </div>
            <p className={`mt-1 text-lg font-semibold tracking-tight sm:text-xl ${valueCls}`}>{value}</p>
            {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
        </div>
    );
}

export function Modal({ title, onClose, children }) {
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="glass-strong animate-rise max-h-[90vh] w-full overflow-y-auto rounded-t-3xl p-5 sm:max-w-lg sm:rounded-3xl"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
                        <X className="h-4 w-4" />
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
            {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
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

// ---------- toasts ----------

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(0);

    const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
    const push = useCallback(
        (tone, message) => {
            const id = ++nextId.current;
            setToasts((t) => [...t.slice(-2), { id, tone, message }]);
            setTimeout(() => dismiss(id), 4500);
        },
        [dismiss],
    );
    const [api] = useState(() => ({}));
    api.success = (m) => push('success', m);
    api.info = (m) => push('info', m);
    api.warning = (m) => push('warning', m);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className="glass-strong animate-rise pointer-events-auto w-full max-w-sm rounded-2xl">
                        <Notice tone={t.tone} onClose={() => dismiss(t.id)}>
                            {t.message}
                        </Notice>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);

// ---------- confirm dialog ----------

const ConfirmContext = createContext(null);

// const confirm = useConfirm(); if (!(await confirm({ title, message }))) return;
export function ConfirmProvider({ children }) {
    const [dialog, setDialog] = useState(null);
    const confirm = useCallback(
        (opts) =>
            new Promise((resolve) => {
                setDialog({ ...opts, resolve });
            }),
        [],
    );
    const close = (answer) => {
        dialog?.resolve(answer);
        setDialog(null);
    };
    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {dialog && (
                <Modal title={dialog.title || 'Are you sure?'} onClose={() => close(false)}>
                    {dialog.message && <p className="text-sm text-slate-300">{dialog.message}</p>}
                    <div className="mt-5 flex justify-end gap-2">
                        <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
                            {dialog.cancelLabel || 'Cancel'}
                        </button>
                        <button type="button" autoFocus className={`btn ${dialog.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                            {dialog.confirmLabel || 'Confirm'}
                        </button>
                    </div>
                </Modal>
            )}
        </ConfirmContext.Provider>
    );
}

export const useConfirm = () => useContext(ConfirmContext);

export function Avatar({ name = '', className = 'h-9 w-9 text-sm' }) {
    const initials = name
        .split(/\s+/)
        .filter((w) => /^[a-z]/i.test(w))
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join('');
    return (
        <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-violet-500 font-semibold text-slate-950 ${className}`} aria-hidden="true">
            {initials || '?'}
        </span>
    );
}
