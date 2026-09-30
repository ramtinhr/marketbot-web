import {
    createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { useI18n } from '../i18n';
import { useTheme } from '../lib/theme';
import { NAV, PAGES } from './nav';

// ---- Page status: the live pill in the topbar and the error banner ----
//
// Every page reports health the same way: setStatus(true, "Updated 12:00:01")
// after a good poll, setStatus(false, ...) plus showError(...) when the API
// can't be reached. A healthy status also clears the banner.

interface PageStatus {
    setStatus: (healthy: boolean, text: string) => void;
    showError: (msg: string) => void;
    hideError: () => void;
    /** Replaces the topbar's right-hand slot (manual-trade puts its mode badge there). */
    setTopbarRight: (node: ReactNode) => void;
    /**
     * Overrides the topbar title/subtitle and the tab title with already
     * translated text (the provider editor names the venue). Null restores the
     * page's defaults.
     */
    setTitles: (titles: TitleOverride | null) => void;
}

export interface TitleOverride { title?: string; subtitle?: string; docTitle?: string }

const StatusContext = createContext<PageStatus | null>(null);

export function usePageStatus(): PageStatus {
    const ctx = useContext(StatusContext);
    if (!ctx) throw new Error('usePageStatus outside Layout');
    return ctx;
}

/** '/' and a trailing slash both mean the dashboard. */
function normalizePath(pathname: string): string {
    const path = (pathname || '/').replace(/\/+$/, '') || '/';
    return path === '/' ? '/dashboard' : path;
}

export default function Layout() {
    const { t, isRTL, locale, available, setLocale } = useI18n();
    const { theme, setTheme } = useTheme();
    const location = useLocation();
    const path = normalizePath(location.pathname);
    const page = PAGES[path] || PAGES['/dashboard'];
    const activeHref = page.nav || path;

    const [healthy, setHealthy] = useState(true);
    const [statusText, setStatusText] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [topbarRight, setTopbarRight] = useState<ReactNode>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [titles, setTitles] = useState<TitleOverride | null>(null);

    const docTitle = titles?.docTitle ?? t(page.docTitle);
    useEffect(() => { document.title = docTitle; }, [docTitle]);

    // A new page starts from its own defaults, not the last page's state. Reset
    // during render rather than in an effect: a parent's effects run after its
    // children's, so an effect here would wipe what the new page just set.
    const [shownPath, setShownPath] = useState(path);
    if (shownPath !== path) {
        setShownPath(path);
        setHealthy(true);
        setStatusText(null);
        setError(null);
        setTopbarRight(null);
        setTitles(null);
        setSidebarOpen(false);
    }

    // app.css drives the mobile drawer off body.sidebar-open.
    useEffect(() => {
        document.body.classList.toggle('sidebar-open', sidebarOpen);
    }, [sidebarOpen]);
    useEffect(() => setSidebarOpen(false), [locale]);

    const setStatus = useCallback((ok: boolean, text: string) => {
        setHealthy(ok);
        setStatusText(text);
        if (ok) setError(null);
    }, []);
    const showError = useCallback((msg: string) => setError(msg), []);
    const hideError = useCallback(() => setError(null), []);
    const status = useMemo(() => ({ setStatus, showError, hideError, setTopbarRight, setTitles }),
        [setStatus, showError, hideError]);

    const languages = available();
    const closeDrawer = () => setSidebarOpen(false);

    // The arrow points back towards the linked page, which in RTL is the other way round.
    let shortcut: ReactNode = null;
    if (page.link) {
        const back = page.link.to !== 'forward';
        const arrow = back === !isRTL ? '←' : '→';
        const label = <span>{t(page.link.label)}</span>;
        shortcut = (
            <Link to={page.link.href} className="nav-pill-link">
                {back
                    ? <><span aria-hidden="true">{arrow}</span> {label}</>
                    : <>{label} <span aria-hidden="true">{arrow}</span></>}
            </Link>
        );
    }

    return (
        <StatusContext.Provider value={status}>
            <div className="app-shell">
                <div className="sidebar-scrim" onClick={closeDrawer} />

                <aside className="sidebar">
                    <div className="sidebar-brand">
                        <div className="brand-mark" aria-hidden="true">M</div>
                        <div>
                            <h1>MarketBot</h1>
                            <div className="sub">{t('shell.brandSub')}</div>
                        </div>
                    </div>
                    <nav className="nav">
                        {NAV.map(group => (
                            <div className="nav-group" key={group.label}>
                                <div className="nav-label">{t(group.label)}</div>
                                {group.items.map(item => {
                                    const active = item.href === activeHref;
                                    return (
                                        <Link key={item.href} to={item.href} onClick={closeDrawer}
                                              className={`nav-link${active ? ' active' : ''}`}
                                              aria-current={active ? 'page' : undefined}>
                                            {item.icon}
                                            <span>{t(item.label)}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        ))}
                    </nav>
                    <div className="sidebar-footer">
                        {languages.length >= 2 && (
                            <div className="lang-toggle" role="group" aria-label={t('shell.languageLabel')}>
                                {languages.map(lang => (
                                    <button key={lang.code} type="button" lang={lang.code} dir={lang.dir}
                                            className={lang.code === locale ? 'active' : ''} title={lang.englishName}
                                            onClick={() => setLocale(lang.code)}>{lang.name}</button>
                                ))}
                            </div>
                        )}
                        <div className="theme-toggle" role="group" aria-label={t('shell.themeLabel')}>
                            <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                                <span>{t('shell.theme.dark')}</span>
                            </button>
                            <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                                <span>{t('shell.theme.light')}</span>
                            </button>
                        </div>
                        <div className="sidebar-meta">{t('shell.tagline')}</div>
                    </div>
                </aside>

                <div className="main">
                    <div className="topbar">
                        <div className="topbar-title">
                            <button className="menu-btn" type="button" aria-label={t('shell.toggleMenu')}
                                    onClick={() => setSidebarOpen(open => !open)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
                            </button>
                            <div>
                                <h1>{titles?.title ?? t(page.title)}</h1>
                                <div className="sub">{titles?.subtitle ?? (page.subtitle ? t(page.subtitle) : '')}</div>
                            </div>
                        </div>
                        <div className="topbar-right">
                            {topbarRight}
                            {shortcut}
                            <div className="live-pill">
                                <span className={`status-dot${healthy ? '' : ' error'}`} />
                                <span>{statusText ?? t(page.status || 'status.connecting')}</span>
                            </div>
                        </div>
                    </div>

                    <div className="container">
                        <div className="content-body">
                            <div className={`error-banner${error ? ' show' : ''}`}>
                                <span>⚠️</span>
                                <span>{error ?? t('error.banner')}</span>
                            </div>
                            {/* Keyed by path so each page mounts fresh, like a page load. */}
                            <Outlet key={path} />
                        </div>
                    </div>
                </div>
            </div>
        </StatusContext.Provider>
    );
}
