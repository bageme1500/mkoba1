import { Link, useParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { ErrorBox, Loading, PageHeader } from '../components.jsx';
import MemberRecord from '../MemberRecord.jsx';
import { phoneLabel } from '../format.js';

export default function MemberDetail() {
    const { id } = useParams();
    const { data, error, loading } = useApi(`/reports/members/${id}`);
    if (loading && !data) return <Loading />;
    if (error) return <ErrorBox error={error} />;
    const m = data.member;
    return (
        <>
            <PageHeader
                title={m.name}
                subtitle={`${phoneLabel(m.phone)} · ${m.role}${m.active ? '' : ' · inactive'}`}
                actions={
                    <Link to="/members" className="btn btn-secondary">
                        All members
                    </Link>
                }
            />
            <MemberRecord summary={data} />
        </>
    );
}
