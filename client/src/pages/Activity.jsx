import { useState } from 'react';
import { History } from 'lucide-react';
import { PageHeader, MemberSelect } from '../components.jsx';
import ActivityList from '../ActivityList.jsx';
import { useT } from '../i18n.jsx';

const AREAS = [
    ['', 'Everything'],
    ['payments', 'Payments'],
    ['cashbook', 'Cash book'],
    ['members', 'Members'],
    ['months', 'Months'],
    ['imports', 'Statements'],
    ['settings', 'Settings'],
];

export default function Activity() {
    const [area, setArea] = useState('');
    const [subject, setSubject] = useState('');
    const { t } = useT();
    return (
        <>
            <PageHeader icon={History} title={t('Activity')} subtitle={t('Every change in the group: who did it and when. Entries cannot be edited or deleted.')} />
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Filter')}>
                    {AREAS.map(([value, label]) => (
                        <button key={value || 'all'} type="button" onClick={() => setArea(value)} className={`btn btn-sm ${area === value ? 'btn-primary' : 'btn-secondary'}`}>
                            {t(label)}
                        </button>
                    ))}
                </div>
                <div className="sm:w-56">
                    <MemberSelect value={subject} onChange={setSubject} allowEmpty emptyLabel={t('About any member')} />
                </div>
            </div>
            <div className="card">
                <ActivityList query={{ area: area || undefined, subject_user_id: subject || undefined }} emptyText={t('No activity for this filter.')} />
            </div>
        </>
    );
}
