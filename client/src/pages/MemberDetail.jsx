import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApi } from '../useApi.js';
import { Avatar, ErrorBox, Loading } from '../components.jsx';
import MemberRecord from '../MemberRecord.jsx';
import ActivityList from '../ActivityList.jsx';
import { phoneLabel } from '../format.js';
import { useT } from '../i18n.jsx';

const ROLES = { admin: 'Admin', leader: 'Leader', member: 'Member' };

export default function MemberDetail() {
    const { id } = useParams();
    const { data, error, loading } = useApi(`/reports/members/${id}`);
    const { t } = useT();
    if (loading && !data) return <Loading />;
    if (error) return <ErrorBox error={error} />;
    const m = data.member;
    return (
        <>
            <div className="animate-rise mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Avatar name={m.name} className="h-12 w-12 text-base" />
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">{m.name}</h1>
                        <p className="text-sm text-slate-400">
                            {phoneLabel(m.phone)} · {t(ROLES[m.role])}
                            {m.active ? '' : ` · ${t('inactive')}`}
                        </p>
                    </div>
                </div>
                <Link to="/members" className="btn btn-secondary self-start sm:self-auto">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('All members')}
                </Link>
            </div>
            <MemberRecord summary={data} />
            <section className="card mt-6">
                <h2 className="mb-2 font-semibold">{t('History')}</h2>
                <ActivityList query={{ subject_user_id: m.id, limit: 20 }} emptyText={t('No changes recorded for this member yet.')} />
            </section>
        </>
    );
}
