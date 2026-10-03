import { useMemo } from 'react';
import { create } from 'zustand';

import * as runtime from './runtime';
import en from './locales/en';
import fa from './locales/fa';
import type { Vars } from './runtime';

// Adding a language is one catalogue file plus one line here; the switcher
// lists whatever is registered, in this order.
runtime.register('en', en);
runtime.register('fa', fa);
runtime.init();

export const { t, has, plural, format, setLocale, available } = runtime;
export type { Vars };

const useLocaleStore = create<{ locale: string }>()(() => ({ locale: runtime.getLocale() }));
runtime.onChange(({ locale }) => useLocaleStore.setState({ locale }));

export interface I18nValue {
    locale: string;
    dir: 'ltr' | 'rtl';
    isRTL: boolean;
    t: typeof runtime.t;
    plural: typeof runtime.plural;
    format: typeof runtime.format;
    setLocale: typeof runtime.setLocale;
    available: typeof runtime.available;
}

/**
 * The translation functions are module-level and always current; reading them
 * through this hook is what makes a component re-render when the language
 * changes. Use `locale` as an effect dependency to redo anything painted
 * outside React (charts).
 */
export function useI18n(): I18nValue {
    const locale = useLocaleStore((s) => s.locale);
    return useMemo<I18nValue>(() => {
        const dir = runtime.getDir();
        return {
            locale, dir, isRTL: dir === 'rtl',
            t: runtime.t, plural: runtime.plural, format: runtime.format,
            setLocale: runtime.setLocale, available: runtime.available,
        };
    }, [locale]);
}

/**
 * Something to tell the user, kept untranslated until shown so it follows a
 * language switch: a catalogue key, or text that is already final (the API's
 * own error message).
 */
export type Message = { key: string; vars?: Vars } | { text: string };

export const msg = (key: string, vars?: Vars): Message => ({ key, vars });
export const rawMsg = (text: string): Message => ({ text });

export function renderMessage(m: Message): string {
    return 'text' in m ? m.text : t(m.key, m.vars);
}
