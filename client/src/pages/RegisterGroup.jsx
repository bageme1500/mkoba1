import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { AuthShell } from './Login.jsx';
import { ErrorBox, Field, useAction } from '../components.jsx';
import { useT } from '../i18n.jsx';

export default function RegisterGroup() {
    const { registerGroup } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({
        groupName: '',
        monthly_amount: '',
        due_day: 28,
        late_fine: 0,
        name: '',
        phone: '',
        password: '',
    });
    const { busy, error, run } = useAction();
    const { t } = useT();
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = (e) => {
        e.preventDefault();
        run(async () => {
            await registerGroup({
                group: {
                    name: form.groupName,
                    monthly_amount: Number(form.monthly_amount),
                    due_day: Number(form.due_day),
                    late_fine: Number(form.late_fine || 0),
                },
                leader: { name: form.name, phone: form.phone, password: form.password },
            });
            navigate('/members');
        });
    };

    return (
        <AuthShell
            wide
            title={t('Register your M-Koba group')}
            subtitle={t('You will be the group leader. You can add members next.')}
            footer={
                <>
                    {t('Already registered?')}{' '}
                    <Link to="/" className="font-medium text-brand-300 hover:underline">
                        {t('Log in')}
                    </Link>
                </>
            }
        >
        <form onSubmit={submit} className="space-y-5">
            <fieldset className="space-y-4">
                <legend className="mb-1 text-sm font-semibold text-brand-200">{t('Group')}</legend>
                <Field label={t('Group name')}>
                    <input className="input" value={form.groupName} onChange={set('groupName')} required />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t('Monthly amount (TZS)')}>
                        <input className="input" type="number" min="1" step="any" inputMode="numeric" value={form.monthly_amount} onChange={set('monthly_amount')} required />
                    </Field>
                    <Field label={t('Deadline day')} hint={t('1–28 of each month')}>
                        <input className="input" type="number" min="1" max="28" value={form.due_day} onChange={set('due_day')} required />
                    </Field>
                    <Field label={t('Late fine (TZS)')} hint={t('0 for no fine')}>
                        <input className="input" type="number" min="0" step="any" inputMode="numeric" value={form.late_fine} onChange={set('late_fine')} />
                    </Field>
                </div>
            </fieldset>
            <fieldset className="space-y-4">
                <legend className="mb-1 text-sm font-semibold text-brand-200">{t('You (leader)')}</legend>
                <Field label={t('Your name')}>
                    <input className="input" value={form.name} onChange={set('name')} required />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('Phone number')}>
                        <input className="input" type="tel" inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={set('phone')} required />
                    </Field>
                    <Field label={t('Password')} hint={t('At least 6 characters')}>
                        <input className="input" type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={set('password')} required />
                    </Field>
                </div>
            </fieldset>
            <ErrorBox error={error} />
            <button className="btn btn-primary w-full" disabled={busy}>
                {busy ? t('Creating…') : t('Create group')}
            </button>
        </form>
        </AuthShell>
    );
}
