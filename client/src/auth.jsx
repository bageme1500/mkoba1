import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setAdminGroup, setToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
const ADMIN_GROUP_KEY = 'mkoba_admin_group';

function storedAdminGroup() {
    try {
        return Number(localStorage.getItem(ADMIN_GROUP_KEY)) || null;
    } catch {
        return null;
    }
}

export function AuthProvider({ children }) {
    const [state, setState] = useState({ loading: !!getToken(), user: null, group: null });

    const logout = useCallback(() => {
        setToken(null);
        setAdminGroup(null);
        setState({ loading: false, user: null, group: null });
    }, []);

    const applySession = useCallback(async (session) => {
        let group = session.group;
        if (session.user.role === 'admin') {
            const id = storedAdminGroup();
            setAdminGroup(id);
            group = id ? await api(`/groups/${id}`).catch(() => null) : null;
            if (!group) setAdminGroup(null);
        }
        setState({ loading: false, user: session.user, group });
    }, []);

    useEffect(() => {
        setUnauthorizedHandler(logout);
        if (!getToken()) return;
        api('/auth/me')
            .then(applySession)
            .catch(logout);
    }, [applySession, logout]);

    const value = useMemo(
        () => ({
            ...state,
            isLeader: state.user?.role === 'leader' || state.user?.role === 'admin',
            isAdmin: state.user?.role === 'admin',
            async login(phone, password) {
                const session = await api('/auth/login', { method: 'POST', body: { phone, password } });
                setToken(session.token);
                await applySession(session);
            },
            async registerGroup(payload) {
                const session = await api('/auth/register-group', { method: 'POST', body: payload });
                setToken(session.token);
                await applySession(session);
            },
            logout,
            // Admin: choose which group to manage.
            selectGroup(group) {
                try {
                    if (group) localStorage.setItem(ADMIN_GROUP_KEY, String(group.id));
                    else localStorage.removeItem(ADMIN_GROUP_KEY);
                } catch {
                    /* ignore */
                }
                setAdminGroup(group?.id ?? null);
                setState((s) => ({ ...s, group }));
            },
            // After the group's settings change.
            setGroup(group) {
                setState((s) => ({ ...s, group }));
            },
        }),
        [state, applySession, logout],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
