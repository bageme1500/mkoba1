import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Settings as SettingsIcon } from 'lucide-react';
import { ErrorBox, Field, Notice, PageHeader, useAction } from '../components.jsx';

function GroupSettings() {
    const { group, setGroup } = useAuth();
    const [form, setForm] = useState({
        name: group.name,
        monthly_amount: group.monthly_amount,
        due_day: group.due_day,
        late_fine: group.late_fine,
    });
    const [saved, setSaved] = useState(false);
    const action = useAction();
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
                },
            });
            setGroup(updated);
            setSaved(true);
        });
    };

    return (
        <form onSubmit={submit} className="card space-y-4">
            <div>
                <h2 className="font-semibold">Group settings</h2>
                <p className="text-sm text-slate-400">Changes apply to months you start from now on. Months already started keep their amount and fine.</p>
            </div>
            <Field label="Group name">
                <input className="input" value={form.name} onChange={set('name')} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
                <Field label={`Monthly amount (${group.currency})`}>
                    <input className="input" type="number" min="1" step="any" value={form.monthly_amount} onChange={set('monthly_amount')} required />
                </Field>
                <Field label="Deadline day" hint="1–28">
                    <input className="input" type="number" min="1" max="28" value={form.due_day} onChange={set('due_day')} required />
                </Field>
                <Field label={`Late fine (${group.currency})`}>
                    <input className="input" type="number" min="0" step="any" value={form.late_fine} onChange={set('late_fine')} />
                </Field>
            </div>
            <ErrorBox error={action.error} />
            {saved && <Notice onClose={() => setSaved(false)}>Settings saved.</Notice>}
            <button className="btn btn-primary" disabled={action.busy}>
                Save settings
            </button>
        </form>
    );
}

function ChangePassword() {
    const [form, setForm] = useState({ current_password: '', new_password: '' });
    const [saved, setSaved] = useState(false);
    const action = useAction();

    const submit = (e) => {
        e.preventDefault();
        action.run(async () => {
            await api('/auth/change-password', { method: 'POST', body: form });
            setForm({ current_password: '', new_password: '' });
            setSaved(true);
        });
    };

    return (
        <form onSubmit={submit} className="card space-y-4">
            <h2 className="font-semibold">Change password</h2>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current password">
                    <input className="input" type="password" autoComplete="current-password" value={form.current_password} onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))} required />
                </Field>
                <Field label="New password" hint="At least 6 characters">
                    <input className="input" type="password" autoComplete="new-password" minLength={6} value={form.new_password} onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))} required />
                </Field>
            </div>
            <ErrorBox error={action.error} />
            {saved && <Notice onClose={() => setSaved(false)}>Password changed.</Notice>}
            <button className="btn btn-primary" disabled={action.busy}>
                Change password
            </button>
        </form>
    );
}

export default function Settings() {
    const { isLeader, group } = useAuth();
    return (
        <>
            <PageHeader icon={SettingsIcon} title="Settings" />
            <div className="space-y-6">
                {isLeader && group && <GroupSettings key={group.id} />}
                <ChangePassword />
            </div>
        </>
    );
}
