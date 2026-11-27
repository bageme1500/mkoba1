import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { UserPlus, Users } from 'lucide-react';
import { Avatar, Empty, ErrorBox, Field, Loading, Modal, PageHeader, useAction, useConfirm, useToast } from '../components.jsx';
import { dateLabel, phoneLabel, todayIso } from '../format.js';
import { useT } from '../i18n.jsx';

const ROLES = { admin: 'Admin', leader: 'Leader', member: 'Member' };

function MemberForm({ initial, isNew, onSubmit, busy, error }) {
    const { t } = useT();
    const [form, setForm] = useState(initial);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit(form);
            }}
        >
            <Field label={t('Full name')}>
                <input className="input" value={form.name} onChange={set('name')} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('Phone number')} hint={t('The number they pay M-Koba from')}>
                    <input className="input" type="tel" inputMode="tel" placeholder="0712 345 678" value={form.phone} onChange={set('phone')} required />
                </Field>
                <Field label={t('Joined on')} hint={t('Months before this are not charged')}>
                    <input className="input" type="date" value={form.joined_at} onChange={set('joined_at')} required />
                </Field>
                <Field label={t('Role')}>
                    <select className="input" value={form.role} onChange={set('role')}>
                        <option value="member">{t('Member')}</option>
                        <option value="leader">{t('Leader (can record payments)')}</option>
                    </select>
                </Field>
                <Field label={isNew ? t('Password (optional)') : t('New password (optional)')} hint={t('Only needed if they will log in')}>
                    <input className="input" type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={set('password')} />
                </Field>
            </div>
            <ErrorBox error={error} />
            <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>
                {busy ? t('Saving…') : isNew ? t('Add member') : t('Save changes')}
            </button>
        </form>
    );
}

export default function Members() {
    const { user } = useAuth();
    const [showInactive, setShowInactive] = useState(false);
    const members = useApi('/users', { include_inactive: showInactive ? 'true' : undefined });
    const [editing, setEditing] = useState(null); // null | 'new' | member
    const action = useAction();
    const confirm = useConfirm();
    const toast = useToast();
    const { t } = useT();

    const save = (form) =>
        action.run(async () => {
            const body = { name: form.name, phone: form.phone, role: form.role, joined_at: form.joined_at };
            if (form.password) body.password = form.password;
            if (editing === 'new') await api('/users', { method: 'POST', body });
            else await api(`/users/${editing.id}`, { method: 'PUT', body });
            toast.success(editing === 'new' ? t('{name} added.', { name: form.name }) : t('Changes saved.'));
            setEditing(null);
            members.reload();
        });

    const toggleActive = (m) =>
        action.run(async () => {
            if (m.active) {
                if (!(await confirm({ title: t('Deactivate {name}?', { name: m.name }), message: t('They will not be charged for new months. Their history stays in the reports.'), confirmLabel: t('Deactivate'), tone: 'danger' }))) return;
                await api(`/users/${m.id}`, { method: 'DELETE' });
            } else {
                await api(`/users/${m.id}`, { method: 'PUT', body: { active: true } });
            }
            members.reload();
        });

    return (
        <>
            <PageHeader
                icon={Users}
                title={t('Members')}
                subtitle={t('Everyone who contributes. New members are charged from the next month that starts.')}
                actions={
                    <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
                        <UserPlus className="h-4 w-4" aria-hidden="true" /> {t('Add member')}
                    </button>
                }
            />
            <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" className="accent-teal-400" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                {t('Show inactive members')}
            </label>
            <ErrorBox error={members.error || (editing ? null : action.error)} className="mb-3" />

            {members.loading && !members.data ? (
                <Loading />
            ) : members.data?.length ? (
                <div className="card -mx-4 overflow-x-auto p-0 sm:mx-0 sm:p-0">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>{t('Name')}</th>
                                <th>{t('Phone')}</th>
                                <th>{t('Role')}</th>
                                <th>{t('Joined')}</th>
                                <th>{t('Login')}</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {members.data.map((m) => (
                                <tr key={m.id} className={m.active ? '' : 'text-slate-500'}>
                                    <td className="whitespace-nowrap font-medium">
                                        <Link to={`/members/${m.id}`} className="inline-flex items-center gap-2.5 hover:underline">
                                            <Avatar name={m.name} className="h-7 w-7 text-[11px]" />
                                            {m.name}
                                        </Link>
                                        {!m.active && <span className="ml-1 text-xs">({t('inactive')})</span>}
                                    </td>
                                    <td className="whitespace-nowrap">{phoneLabel(m.phone)}</td>
                                    <td>{t(ROLES[m.role])}</td>
                                    <td className="whitespace-nowrap">{dateLabel(m.joined_at)}</td>
                                    <td>{m.has_login ? t('Yes') : t('No')}</td>
                                    <td className="whitespace-nowrap text-right">
                                        <button type="button" className="btn btn-secondary btn-sm mr-1" onClick={() => setEditing(m)}>
                                            {t('Edit')}
                                        </button>
                                        {m.id !== user.id && (
                                            <button type="button" className={`btn btn-sm ${m.active ? 'btn-danger' : 'btn-secondary'}`} onClick={() => toggleActive(m)}>
                                                {m.active ? t('Deactivate') : t('Reactivate')}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Empty icon={Users}>{t('No members yet. Add the people in your group to start tracking.')}</Empty>
            )}

            {editing && (
                <Modal title={editing === 'new' ? t('Add member') : t('Edit {name}', { name: editing.name })} onClose={() => setEditing(null)}>
                    <MemberForm
                        isNew={editing === 'new'}
                        initial={
                            editing === 'new'
                                ? { name: '', phone: '', role: 'member', joined_at: todayIso(), password: '' }
                                : { name: editing.name, phone: `0${editing.phone.slice(3)}`, role: editing.role, joined_at: editing.joined_at, password: '' }
                        }
                        onSubmit={save}
                        busy={action.busy}
                        error={action.error}
                    />
                </Modal>
            )}
        </>
    );
}
