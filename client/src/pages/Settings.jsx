import { useState } from 'react';
import { KeyRound, LogOut, Settings as SettingsIcon, Shuffle, Users } from 'lucide-react';
import { api, setToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, PageHeader, useAction, useConfirm, useToast } from '../components.jsx';
import { LanguageSwitch, useT } from '../i18n.jsx';
import { Languages } from 'lucide-react';

function Section({ icon: Icon, title, subtitle, children, onSubmit }) {
    const Tag = onSubmit ? 'form' : 'section';
    return (
        <Tag onSubmit={onSubmit} className="card space-y-4">
            <div className="flex items-start gap-3">
                <span className="rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
                    <Icon className="h-4 w-4 text-brand-300" aria-hidden="true" />
                </span>
                <div>
                    <h2 className="font-semibold text-white">{title}</h2>
                    {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
                </div>
            </div>
            {children}
        </Tag>
    );
}

const RULES = [
    ['current_first', 'Month it was paid in first', 'A payment made in November counts for November first. Extra money then clears older months.'],
    ['oldest_first', 'Oldest unpaid month first', 'Older debts are cleared before the current month. Stricter: arrears never pile up.'],
];

function GroupSettings() {
    const { group, setGroup } = useAuth();
    const toast = useToast();
    const { t } = useT();
    const [form, setForm] = useState({
        name: group.name,
        monthly_amount: group.monthly_amount,
        due_day: group.due_day,
        late_fine: group.late_fine,
        allocation_rule: group.allocation_rule,
        auto_start: group.auto_start,
        opening_balance: group.opening_balance,
        opening_balance_date: group.opening_balance_date || '',
    });
    const action = useAction();
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    const submit = (e) => {
        e.preventDefault();
        action.run(async () => {
            const updated = await api(`/groups/${group.id}`, {
                method: 'PUT',
                body: {
                    name: form.name,
                    monthly_amount: Number(form.monthly_amount),
                    due_day: Number(form.due_day),
                    late_fine: Number(form.late_fine || 0),
                    allocation_rule: form.allocation_rule,
                    auto_start: form.auto_start,
                    opening_balance: Number(form.opening_balance || 0),
                    opening_balance_date: form.opening_balance_date || null,
                },
            });
            setGroup(updated);
            toast.success(updated.allocation_rule !== group.allocation_rule ? t('Saved. Payments were re-spread using the new order.') : t('Settings saved.'));
        });
    };

    return (
        <Section icon={Users} title={t('Group settings')} subtitle={t('Amount, deadline and fine apply to months started from now on.')} onSubmit={submit}>
            <Field label={t('Group name')}>
                <input className="input" value={form.name} onChange={set('name')} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
                <Field label={`${t('Monthly amount')} (${group.currency})`}>
                    <input className="input" type="number" min="1" step="any" value={form.monthly_amount} onChange={set('monthly_amount')} required />
                </Field>
                <Field label={t('Deadline day')} hint="1–28">
                    <input className="input" type="number" min="1" max="28" value={form.due_day} onChange={set('due_day')} required />
                </Field>
                <Field label={`${t('Late fine')} (${group.currency})`}>
                    <input className="input" type="number" min="0" step="any" value={form.late_fine} onChange={set('late_fine')} />
                </Field>
            </div>

            <fieldset>
                <legend className="label">{t("When a payment doesn't say which month it is for")}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                    {RULES.map(([value, title, text]) => (
                        <label key={value} className={`glass-subtle flex cursor-pointer gap-3 rounded-xl p-3 transition ${form.allocation_rule === value ? 'ring-2 ring-brand-400/60' : 'hover:bg-white/[0.06]'}`}>
                            <input type="radio" name="allocation_rule" value={value} checked={form.allocation_rule === value} onChange={set('allocation_rule')} className="mt-1 accent-teal-400" />
                            <span>
                                <span className="block text-sm font-medium text-white">{t(title)}</span>
                                <span className="block text-xs text-slate-400">{t(text)}</span>
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <label className="glass-subtle flex cursor-pointer items-start gap-3 rounded-xl p-3">
                <input type="checkbox" checked={form.auto_start} onChange={set('auto_start')} className="mt-1 accent-teal-400" />
                <span>
                    <span className="block text-sm font-medium text-white">{t('Start each month automatically')}</span>
                    <span className="block text-xs text-slate-400">{t("On the 1st, every active member is given the month's amount to pay.")}</span>
                </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`${t('Opening balance')} (${group.currency})`} hint={t('Money already in M-Koba when you started using this system')}>
                    <input className="input" type="number" step="any" value={form.opening_balance} onChange={set('opening_balance')} />
                </Field>
                <Field label={t('Opening balance date')} hint={t('Payments before this date are part of the opening balance')}>
                    <input className="input" type="date" value={form.opening_balance_date} onChange={set('opening_balance_date')} />
                </Field>
            </div>

            <ErrorBox error={action.error} />
            <button className="btn btn-primary" disabled={action.busy}>
                {t('Save settings')}
            </button>
        </Section>
    );
}

function ChangePassword() {
    const [form, setForm] = useState({ current_password: '', new_password: '' });
    const toast = useToast();
    const { t } = useT();
    const action = useAction();

    const submit = (e) => {
        e.preventDefault();
        action.run(async () => {
            // Other devices are logged out; keep this one logged in with the new token.
            const { token } = await api('/auth/change-password', { method: 'POST', body: form });
            setToken(token);
            setForm({ current_password: '', new_password: '' });
            toast.success(t('Password changed. Other devices were logged out.'));
        });
    };

    return (
        <Section icon={KeyRound} title={t('Change password')} onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('Current password')}>
                    <input className="input" type="password" autoComplete="current-password" value={form.current_password} onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))} required />
                </Field>
                <Field label={t('New password')} hint={t('At least 6 characters')}>
                    <input className="input" type="password" autoComplete="new-password" minLength={6} value={form.new_password} onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))} required />
                </Field>
            </div>
            <ErrorBox error={action.error} />
            <button className="btn btn-primary" disabled={action.busy}>
                {t('Change password')}
            </button>
        </Section>
    );
}

function Sessions() {
    const toast = useToast();
    const { t } = useT();
    const confirm = useConfirm();
    const action = useAction();
    const logoutAll = () =>
        action.run(async () => {
            if (!(await confirm({ title: t('Log out other devices?'), message: t('Anyone logged in with your account on another phone or computer will be logged out.'), confirmLabel: t('Log them out') }))) return;
            const { token } = await api('/auth/logout-all', { method: 'POST' });
            setToken(token);
            toast.success(t('Other devices were logged out.'));
        });
    return (
        <Section icon={LogOut} title={t('Devices')} subtitle={t('Lost a phone or used a shared computer? Log out everywhere else.')}>
            <ErrorBox error={action.error} />
            <button type="button" className="btn btn-secondary" onClick={logoutAll} disabled={action.busy}>
                <Shuffle className="h-4 w-4" aria-hidden="true" /> {t('Log out all other devices')}
            </button>
        </Section>
    );
}

function Language() {
    const { t } = useT();
    return (
        <Section icon={Languages} title={t('Language')} subtitle={t('Choose the language for the app and for reminder messages.')}>
            <LanguageSwitch />
        </Section>
    );
}

export default function Settings() {
    const { isLeader, group } = useAuth();
    const { t } = useT();
    return (
        <>
            <PageHeader icon={SettingsIcon} title={t('Settings')} />
            <div className="space-y-6">
                <Language />
                {isLeader && group && <GroupSettings key={group.id} />}
                <ChangePassword />
                <Sessions />
            </div>
        </>
    );
}
