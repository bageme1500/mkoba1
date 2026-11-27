import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

// Loads data from the API and reloads when `path` or `query` change.
// Returns { data, error, loading, reload, setData }.
export function useApi(path, query) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(!!path);
    const key = path ? `${path}?${JSON.stringify(query ?? {})}` : null;
    const latest = useRef(0);

    const load = useCallback(async () => {
        if (!path) return;
        const call = ++latest.current;
        setLoading(true);
        setError(null);
        try {
            const result = await api(path, { query });
            if (call === latest.current) setData(result);
        } catch (err) {
            if (call === latest.current) setError(err);
        } finally {
            if (call === latest.current) setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    useEffect(() => {
        load();
    }, [load]);

    return { data, error, loading, reload: load, setData };
}
