import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth.jsx';

const LEADER_LINKS = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/payments', label: 'Payments' },
    { to: '/import', label: 'Upload statement' },
    { to: '/reports/monthly', label: 'Monthly report' },
    { to: '/reports/yearly', label: 'Yearly summary' },
    { to: '/members', label: 'Members' },
    { to: '/settings', label: 'Settings' },
];
const MEMBER_LINKS = [
    { to: '/', label: 'My contributions', end: true },
    { to: '/settings', label: 'Settings' },
];

export default function Layout() {
    const { user, group, isLeader, isAdmin, logout } = useAuth();
    const [open, setOpen] = useState(false);

    let links = isLeader ? LEADER_LINKS : MEMBER_LINKS;
    if (isAdmin) links = [{ to: '/groups', label: 'All groups' }, ...(group ? LEADER_LINKS : [])];

    const nav = (
        <nav className="flex flex-col gap-1">
            {links.map((l) => (
                <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                        `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-700 text-white' : 'text-gray-700 hover:bg-gray-100'}`
                    }
                >
                    {l.label}
                </NavLink>
            ))}
        </nav>
    );

    const who = (
        <div className="text-sm">
            <p className="font-medium text-gray-900">{user.name}</p>
            <p className="text-xs capitalize text-gray-500">
                {user.role}
                {group ? ` · ${group.name}` : ''}
            </p>
            <button type="button" onClick={logout} className="mt-2 text-xs font-medium text-brand-700 hover:underline">
                Log out
            </button>
        </div>
    );

    return (
        <div className="min-h-screen lg:flex">
            {/* Phone / tablet: top bar with a menu button */}
            <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
                <div>
                    <p className="text-sm font-semibold text-brand-700">M-Koba Tracker</p>
                    {group && <p className="text-xs text-gray-500">{group.name}</p>}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                    {open ? 'Close' : 'Menu'}
                </button>
            </header>
            {open && (
                <div className="border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
                    {nav}
                    <div className="mt-3 border-t border-gray-100 pt-3">{who}</div>
                </div>
            )}

            {/* Desktop: sidebar */}
            <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-gray-200 bg-white p-4 lg:flex lg:min-h-screen">
                <div>
                    <p className="mb-1 px-3 text-base font-semibold text-brand-700">M-Koba Tracker</p>
                    {group && <p className="mb-5 px-3 text-xs text-gray-500">{group.name}</p>}
                    {nav}
                </div>
                <div className="px-3">{who}</div>
            </aside>

            <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
                <Outlet />
            </main>
        </div>
    );
}
