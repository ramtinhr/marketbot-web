import { create } from 'zustand';

import { readStore, writeStore } from '../lib/storage';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'marketbot-theme';

function storedTheme(): Theme {
    const v = readStore(THEME_KEY);
    return v === 'light' ? 'light' : 'dark';
}

interface ThemeState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

/**
 * Theme is stamped on <html data-theme>, which is what app.css keys off.
 * Charts and provider colours can't inherit a CSS variable inside a canvas, so
 * they subscribe here and rebuild when it changes.
 */
export const useThemeStore = create<ThemeState>()((set) => ({
    theme: storedTheme(),
    setTheme: (theme) => {
        writeStore(THEME_KEY, theme);
        set({ theme });
    },
}));

const stamp = (theme: Theme) => document.documentElement.setAttribute('data-theme', theme);
stamp(useThemeStore.getState().theme);
useThemeStore.subscribe((state, prev) => { if (state.theme !== prev.theme) stamp(state.theme); });

export function useTheme(): ThemeState {
    const theme = useThemeStore((s) => s.theme);
    const setTheme = useThemeStore((s) => s.setTheme);
    return { theme, setTheme };
}
