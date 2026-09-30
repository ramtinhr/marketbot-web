import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';

const THEME_KEY = 'marketbot-theme';

function readTheme(): Theme {
    try {
        const v = localStorage.getItem(THEME_KEY);
        if (v === 'dark' || v === 'light') return v;
    } catch { /* ignore */ }
    return 'dark';
}

interface ThemeValue {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Theme is stamped on <html data-theme>, which is what app.css keys off.
 * Charts and provider colours can't inherit a CSS variable inside a canvas, so
 * they read `theme` from this context and rebuild when it changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(readTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const setTheme = useCallback((next: Theme) => {
        setThemeState(next);
        try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
    }, []);

    return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme outside ThemeProvider');
    return ctx;
}
