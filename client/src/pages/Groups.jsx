import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi } from '../useApi.js';
import { Empty, ErrorBox, Field, Loading, Modal, PageHeader, useAction } from '../components.jsx';
import { money, ordinal } from '../format.js';

// Admin only: every group in the system; pick one to manage it like a leader.
export default function Groups() {
    const { group: current, selectGroup } = useAuth();
    const navigate = useNavigate();
    const groups = useApi('/groups');
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ name: '', monthly_amount: '', due_day: 28, late_fine: 0 });
    const action = useAction();
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const manage = (g) => {
        selectGroup(g);
        navigate('/');
    };

    const create = (e) => {
        e.preventDefault();
        action.run(async () => {
            await api('/groups', {
                method: 'POST',
                body: { name: form.name, monthly_amount: Number(form.monthly_amount), due_day: Number(form.due_day), late_fine: Number(form.late_fine || 0) },
            });
            setCreating(false);
            groups.reload();
        });
    };

    return (
        <>
            <PageHeader
                title="All groups"
                subtitle="Choose a group to manage it."
                actions={
                    <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
                        New group
                    </button>
                }
            />
            <ErrorBox error={groups.error} className="mb-3" />
            {groups.loading && !groups.data ? (
                <Loading />
            ) : groups.data?.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {groups.data.map((g) => (
                        <div key={g.id} className={`card ${current?.id === g.id ? 'ring-2 ring-brand-600' : ''}`}>
                            <p className="font-semibold">{g.name}</p>
                            <p className="mt-1 text-sm text-gray-500">
                                {g.member_count} members · {money(g.monthly_amount, g.currency)} by the {ordinal(g.due_day)}
                            </p>
                            <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => manage(g)}>
                                {current?.id === g.id ? 'Managing' : 'Manage'}
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <Empty>No groups yet.</Empty>
            )}

            {creating && (
                <Modal title="New group" onClose={() => setCreating(false)}>
                    <form onSubmit={create} className="space-y-4">
                        <Field label="Group name">
                            <input className="input" value={form.name} onChange={set('name')} required />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field label="Monthly amount">
                                <input className="input" type="number" min="1" step="any" value={form.monthly_amount} onChange={set('monthly_amount')} required />
                            </Field>
                            <Field label="Deadline day">
                                <input className="input" type="number" min="1" max="28" value={form.due_day} onChange={set('due_day')} required />
                            </Field>
                            <Field label="Late fine">
                                <input className="input" type="number" min="0" step="any" value={form.late_fine} onChange={set('late_fine')} />
                            </Field>
                        </div>
                        <p className="text-xs text-gray-500">After creating it, manage the group and add its leader under Members.</p>
                        <ErrorBox error={action.error} />
                        <button className="btn btn-primary" disabled={action.busy}>
                            Create group
                        </button>
                    </form>
                </Modal>
            )}
        </>
    );
}
