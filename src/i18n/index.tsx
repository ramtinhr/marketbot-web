import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as runtime from './runtime';
import en from './locales/en';
import fa from './locales/fa';

// Adding a language is one catalogue file plus one line here; the switcher
// lists whatever is registered, in this order.
runtime.register('en', en);
runtime.register('fa', fa);
runtime.init();

export const { t, plural, format, setLocale, available } = runtime;

interface I18nValue {
    locale: string;
    dir: 'ltr' | 'rtl';
    isRTL: boolean;
    t: typeof runtime.t;
    plural: typeof runtime.plural;
    format: typeof runtime.format;
    setLocale: typeof runtime.setLocale;
    available: typeof runtime.available;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState(runtime.getLocale());
    useEffect(() => runtime.onChange(({ locale }) => setLocaleState(locale)), []);

    const value = useMemo<I18nValue>(() => {
        const dir = runtime.getDir();
        return {
            locale, dir, isRTL: dir === 'rtl',
            t: runtime.t, plural: runtime.plural, format: runtime.format,
            setLocale: runtime.setLocale, available: runtime.available,
        };
    }, [locale]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * The translation functions are module-level and always current; reading them
 * through this hook is what makes a component re-render when the language
 * changes. Use `locale` as an effect dependency to redo anything painted
 * outside React (charts).
 */
export function useI18n(): I18nValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n outside I18nProvider');
    return ctx;
}