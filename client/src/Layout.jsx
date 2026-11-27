import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    Building2,
    CalendarRange,
    Ellipsis,
    FileChartColumn,
    Landmark,
    LayoutDashboard,
    LogOut,
    Settings,
    Upload,
    Users,
    Wallet,
    X,
} from 'lucide-react';
import { useAuth } from './auth.jsx';
import { Avatar } from './components.jsx';
import { useApprovalCounts } from './Approvals.jsx';

// `mobile: true` items appear in the phone's bottom bar; the rest go under "More".
const LEADER_LINKS = [
    { to: '/', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true, mobile: true },
    { to: '/payments', label: 'Payments', icon: Wallet, mobile: true },
    { to: '/import', label: 'Upload statement', icon: Upload },
    { to: '/cashbook', label: 'Cash book', icon: Landmark },
    { to: '/reports/monthly', label: 'Monthly report', short: 'Reports', icon: FileChartColumn, mobile: true },
    { to: '/reports/yearly', label: 'Yearly summary', icon: CalendarRange },
    { to: '/members', label: 'Members', icon: Users, mobile: true },
    { to: '/settings', label: 'Settings', icon: Settings },
];
const MEMBER_LINKS = [
    { to: '/', label: 'My contributions', short: 'Home', icon: LayoutDashboard, end: true, mobile: true },
    { to: '/settings', label: 'Settings', icon: Settings, mobile: true },
];
const GROUPS_LINK = { to: '/groups', label: 'All groups', short: 'Groups', icon: Building2, mobile: true };

function useLinks() {
    const { isLeader, isAdmin, group } = useAuth();
    if (isAdmin) return [GROUPS_LINK, ...(group ? LEADER_LINKS.map((l) => (l.to === '/members' ? { ...l, mobile: false } : l)) : [])];
    return isLeader ? LEADER_LINKS : MEMBER_LINKS;
}

function Badge({ count, className = '' }) {
    if (!count) return null;
    return (
        <span className={`inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] leading-5 font-semibold text-slate-950 ${className}`} aria-label={`${count} waiting`}>
            {count}
        </span>
    );
}

function SideLink({ link, onClick }) {
    const Icon = link.icon;
    return (
        <NavLink
            to={link.to}
            end={link.end}
            onClick={onClick}
            className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                        ? 'bg-gradient-to-r from-brand-400/25 to-emerald-400/10 text-white shadow-[inset_0_0_0_1px_rgb(94_234_212/0.25)]'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                }`
            }
        >
            {({ isActive }) => (
                <>
                    <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300'}`} aria-hidden="true" />
                    <span className="flex-1">{link.label}</span>
                    <Badge count={link.badge} />
                </>
            )}
        </NavLink>
    );
}

function Brand() {
    const { group } = useAuth();
    return (
        <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-300 to-emerald-500 text-base font-bold text-slate-950 shadow-[0_0_24px_-4px_rgb(45_212_191/0.7)]">M</span>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-white">M-Koba Tracker</p>
                {group && <p className="truncate text-xs text-slate-400">{group.name}</p>}
            </div>
        </div>
    );
}

function UserCard() {
    const { user, logout } = useAuth();
    return (
        <div className="glass-subtle flex items-center gap-3 rounded-2xl p-3">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user.name}</p>
                <p className="text-xs text-slate-400 capitalize">{user.role}</p>
            </div>
            <button type="button" onClick={logout} className="btn btn-ghost btn-sm" aria-label="Log out" title="Log out">
                <LogOut className="h-4 w-4" />
            </button>
        </div>
    );
}

export default function Layout() {
    const location = useLocation();
    const counts = useApprovalCounts(location.pathname);
    const badges = { '/': (counts?.submissions || 0) + (counts?.cashbook || 0), '/cashbook': counts?.cashbook || 0 };
    const links = useLinks().map((l) => ({ ...l, badge: badges[l.to] }));
    const [moreOpen, setMoreOpen] = useState(false);
    const mobile = links.filter((l) => l.mobile).slice(0, 4);
    const more = links.filter((l) => !mobile.includes(l));

    useEffect(() => setMoreOpen(false), [location.pathname]);

    return (
        <div className="min-h-screen lg:flex">
            {/* Desktop sidebar */}
            <aside className="glass-strong sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between rounded-none border-y-0 border-l-0 p-4 lg:flex">
                <div>
                    <div className="mb-8 px-2 pt-1">
                        <Brand />
                    </div>
                    <nav className="flex flex-col gap-1" aria-label="Main">
                        {links.map((l) => (
                            <SideLink key={l.to} link={l} />
                        ))}
                    </nav>
                </div>
                <UserCard />
            </aside>

            {/* Phone top bar */}
            <header className="glass-strong sticky top-0 z-40 flex items-center justify-between rounded-none border-x-0 border-t-0 px-4 py-3 lg:hidden">
                <Brand />
            </header>

            <main className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:pt-8 lg:pb-10">
                <Outlet />
            </main>

            {/* Phone bottom bar */}
            <nav className="glass-strong fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-2xl px-1 py-1.5 lg:hidden" aria-label="Main">
                {mobile.map((l) => {
                    const Icon = l.icon;
                    return (
                        <NavLink
                            key={l.to}
                            to={l.to}
                            end={l.end}
                            className={({ isActive }) =>
                                `flex min-w-14 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium transition ${isActive ? 'bg-brand-400/15 text-brand-200' : 'text-slate-400'}`
                            }
                        >
                            <span className="relative">
                                <Icon className="h-5 w-5" aria-hidden="true" />
                                <Badge count={l.badge} className="absolute -top-1.5 -right-3" />
                            </span>
                            {l.short || l.label}
                        </NavLink>
                    );
                })}
                <button
                        type="button"
                        onClick={() => setMoreOpen(true)}
                        className={`flex min-w-14 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium ${moreOpen ? 'text-brand-200' : 'text-slate-400'}`}
                        aria-expanded={moreOpen}
                    >
                        <Ellipsis className="h-5 w-5" aria-hidden="true" />
                        More
                    </button>
            </nav>

            {moreOpen && (
                <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm lg:hidden" onClick={() => setMoreOpen(false)}>
                    <div className="glass-strong animate-rise absolute inset-x-3 bottom-3 rounded-3xl p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">More</p>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoreOpen(false)} aria-label="Close">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <nav className="mb-3 flex flex-col gap-1" aria-label="More">
                            {more.map((l) => (
                                <SideLink key={l.to} link={l} />
                            ))}
                        </nav>
                        <UserCard />
                    </div>
                </div>
            )}
        </div>
    );
}
