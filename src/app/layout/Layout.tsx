import { useEffect, useLayoutEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { renderMessage, useI18n } from '../../i18n';
import { API_BASE } from '../../shared/api';
import { cx } from '../../shared/lib';
import { usePageStatusStore } from '../../shared/stores/pageStatus';
import { normalizePath, pageFor } from './nav';
import { useShellStore } from './shellStore';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export default function Layout() {
    const { t, locale } = useI18n();
    const path = normalizePath(useLocation().pathname);
    const page = pageFor(path);
    const docTitle = usePageStatusStore((s) => s.titles?.docTitle) ?? t(page.docTitle);

    // A new page starts from its own defaults, not the last page's state. A
    // layout effect runs before the new page's own effects can report.
    useLayoutEffect(() => {
        usePageStatusStore.getState().actions.reset();
        useShellStore.getState().setSidebarOpen(false);
    }, [path]);
    useEffect(() => useShellStore.getState().setSidebarOpen(false), [locale]);
    useEffect(() => { document.title = docTitle; }, [docTitle]);

    return (
        <div className="app-shell">
            <div className="sidebar-scrim" onClick={() => useShellStore.getState().setSidebarOpen(false)} />
            <Sidebar activeHref={page.nav || path} />
            <div className="main">
                <Topbar page={page} />
                <div className="container">
                    <div className="content-body">
                        <ErrorBanner />
                        {/* Keyed by path so each page mounts fresh, like a page load. */}
                        <Outlet key={path} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function ErrorBanner() {
    const { t } = useI18n();
    const banner = usePageStatusStore((s) => s.banner);
    const text = !banner ? t('error.banner')
        : banner.kind === 'unreachable' ? t('error.unreachable', { base: API_BASE })
            : banner.kind === 'message' ? renderMessage(banner.message)
                : banner.text;
    return (
        <div className={cx('error-banner', banner && 'show')}>
            <span>⚠️</span>
            <span>{text}</span>
        </div>
    );
}
