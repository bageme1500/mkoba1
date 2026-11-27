// Kiswahili / English. Text is written in English in the code and looked up in
// the Kiswahili dictionary (i18n/sw.js); anything missing falls back to English.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import sw from './i18n/sw.js';

const KEY = 'mkoba_lang';
let current = readStored() || 'sw';

function readStored() {
    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

// For plain functions (date/month formatting) that are not React components.
export const getLang = () => current;

// In development, collect text that has no Kiswahili translation yet.
const missing = new Set();
if (import.meta.env.DEV) window.__mkobaMissingSw = missing;

export function translate(lang, key, vars) {
    let text = key;
    if (lang === 'sw') {
        if (sw[key]) text = sw[key];
        else if (import.meta.env.DEV) missing.add(key);
    }
    return vars ? text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : text;
}

const LangContext = createContext({ lang: 'sw', t: (k) => k, setLang: () => {} });

export function LanguageProvider({ children }) {
    const { user } = useAuth();
    const [lang, setLangState] = useState(current);

    // A logged-in user's saved choice wins.
    useEffect(() => {
        if (user?.language && user.language !== lang) setLangState(user.language);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.language]);

    current = lang;
    useEffect(() => {
        document.documentElement.lang = lang;
        try {
            localStorage.setItem(KEY, lang);
        } catch {
            /* ignore */
        }
    }, [lang]);

    const setLang = useCallback(
        (next) => {
            setLangState(next);
            if (user) api('/auth/me', { method: 'PATCH', body: { language: next } }).catch(() => {});
        },
        [user],
    );
    const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);
    const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
    return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useT = () => useContext(LangContext);

// Kiswahili | English switch.
export function LanguageSwitch({ className = '' }) {
    const { lang, setLang } = useT();
    return (
        <div className={`inline-flex rounded-xl border border-white/10 bg-white/5 p-0.5 ${className}`} role="group" aria-label="Language / Lugha">
            {[
                ['sw', 'Kiswahili'],
                ['en', 'English'],
            ].map(([code, label]) => (
                <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    aria-pressed={lang === code}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition ${lang === code ? 'bg-brand-400/20 text-brand-100' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
