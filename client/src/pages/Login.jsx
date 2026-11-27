import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, useAction } from '../components.jsx';
import { LanguageSwitch, useT } from '../i18n.jsx';

export function AuthShell({ title, subtitle, children, footer, wide = false }) {
    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
            <div className={`animate-rise w-full ${wide ? 'max-w-lg' : 'max-w-sm'}`}>
                <div className="mb-6 flex flex-col items-center text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-300 to-emerald-500 text-2xl font-bold text-slate-950 shadow-[0_0_48px_-6px_rgb(45_212_191/0.8)]">M</span>
                    <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
                    <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
                </div>
                <div className="glass-strong rounded-3xl p-5 sm:p-6">{children}</div>
                {footer && <div className="mt-5 text-center text-sm text-slate-400">{footer}</div>}
                <div className="mt-5 flex justify-center">
                    <LanguageSwitch />
                </div>
            </div>
        </div>
    );
}

export default function Login() {
    const { login } = useAuth();
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const { busy, error, run } = useAction();
    const { t } = useT();

    const submit = (e) => {
        e.preventDefault();
        run(() => login(phone, password));
    };

    return (
        <AuthShell
            title="M-Koba Tracker"
            subtitle={t('Know who has paid, every month.')}
            footer={
                <>
                    {t('Group leader starting out?')}{' '}
                    <Link to="/register" className="font-medium text-brand-300 hover:underline">
                        {t('Register your group')}
                    </Link>
                </>
            }
        >
            <form onSubmit={submit} className="space-y-4">
                <Field label={t('Phone number')}>
                    <input className="input" type="tel" inputMode="tel" autoComplete="username" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </Field>
                <Field label={t('Password')}>
                    <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </Field>
                <ErrorBox error={error} />
                <button className="btn btn-primary w-full py-2.5" disabled={busy}>
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    {busy ? t('Logging in…') : t('Log in')}
                </button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {t("Your group's records are private to its members.")}
                </p>
            </form>
        </AuthShell>
    );
}
