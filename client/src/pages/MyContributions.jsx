import { useApi } from '../useApi.js';
import { ErrorBox, Loading, PageHeader } from '../components.jsx';
import MemberRecord from '../MemberRecord.jsx';
import { money, ordinal } from '../format.js';

export default function MyContributions() {
    const { data, error, loading } = useApi('/me/summary');
    if (loading && !data) return <Loading />;
    if (error) return <ErrorBox error={error} />;
    const g = data.group;
    return (
        <>
            <PageHeader
                title="My contributions"
                subtitle={`${g.name}: ${money(g.monthly_amount, g.currency)} every month by the ${ordinal(g.due_day)}${g.late_fine ? `, late fine ${money(g.late_fine, g.currency)}` : ''}.`}
            />
            <MemberRecord summary={data} />
        </>
    );
}
