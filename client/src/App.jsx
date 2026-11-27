import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Loading } from './components.jsx';
import Layout from './Layout.jsx';
import Login from './pages/Login.jsx';
import RegisterGroup from './pages/RegisterGroup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Payments from './pages/Payments.jsx';
import ImportStatement from './pages/ImportStatement.jsx';
import MonthlyReport from './pages/MonthlyReport.jsx';
import YearlyReport from './pages/YearlyReport.jsx';
import Members from './pages/Members.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import Settings from './pages/Settings.jsx';
import MyContributions from './pages/MyContributions.jsx';
import Groups from './pages/Groups.jsx';

export default function App() {
    const { loading, user, group, isLeader, isAdmin } = useAuth();

    if (loading) return <Loading />;

    if (!user) {
        return (
            <Routes>
                <Route path="/register" element={<RegisterGroup />} />
                <Route path="*" element={<Login />} />
            </Routes>
        );
    }

    // Admins first pick a group, then see the same pages as a leader.
    const leaderPages = isLeader && (!isAdmin || group);

    return (
        <Routes>
            <Route element={<Layout />}>
                {isAdmin && <Route path="/groups" element={<Groups />} />}
                {leaderPages ? (
                    <>
                        <Route index element={<Dashboard />} />
                        <Route path="payments" element={<Payments />} />
                        <Route path="import" element={<ImportStatement />} />
                        <Route path="reports/monthly" element={<MonthlyReport />} />
                        <Route path="reports/yearly" element={<YearlyReport />} />
                        <Route path="members" element={<Members />} />
                        <Route path="members/:id" element={<MemberDetail />} />
                        <Route path="settings" element={<Settings />} />
                    </>
                ) : isAdmin ? (
                    <Route index element={<Navigate to="/groups" replace />} />
                ) : (
                    <>
                        <Route index element={<MyContributions />} />
                        <Route path="settings" element={<Settings />} />
                    </>
                )}
                <Route path="*" element={<Navigate to={isAdmin && !group ? '/groups' : '/'} replace />} />
            </Route>
        </Routes>
    );
}
