// Small fetch wrapper: adds the login token, sends JSON, turns API errors into exceptions.
const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'mkoba_token';

let token = readToken();
let adminGroupId = null;
let onUnauthorized = () => {};

function readToken() {
    try {
        return localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setToken(value) {
    token = value;
    try {
        if (value) localStorage.setItem(TOKEN_KEY, value);
        else localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* private mode: token lives in memory only */
    }
}

export const getToken = () => token;

// Admins manage one group at a time; every request then carries ?group_id=.
export function setAdminGroup(id) {
    adminGroupId = id;
}

export function setUnauthorizedHandler(fn) {
    onUnauthorized = fn;
}

export class ApiError extends Error {
    constructor(message, status, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

function buildUrl(path, query = {}) {
    const url = new URL(BASE + path, window.location.origin);
    for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
    if (adminGroupId && !url.searchParams.has('group_id')) url.searchParams.set('group_id', adminGroupId);
    return url;
}

export async function api(path, { method = 'GET', body, query, form, raw = false } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    let res;
    try {
        res = await fetch(buildUrl(path, query), { method, headers, body: payload });
    } catch {
        throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }

    if (res.status === 401 && token) onUnauthorized();
    if (!res.ok) {
        const data = await res.json().catch(() => null);
        const details = data?.details?.map?.((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
        throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, details);
    }
    if (raw) return res;
    if (res.status === 204) return null;
    return res.json();
}

// Downloads a file (Excel/PDF report) using the logged-in session.
export async function download(path, query) {
    const res = await api(path, { query, raw: true });
    const disposition = res.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'report';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
