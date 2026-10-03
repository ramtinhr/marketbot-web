import { Link } from 'react-router-dom';

import { format, renderMessage, t, useI18n } from '../../i18n';
import { cx } from '../../shared/lib';
import { usePageStatusStore, type StatusPill } from '../../shared/stores/pageStatus';
import { MenuIcon } from '../../shared/ui';
import type { PageMeta } from './nav';
import { useShellStore } from './shellStore';

export function Topbar({ page }: { page: PageMeta }) {
    const { t } = useI18n();
    const titles = usePageStatusStore((s) => s.titles);
    const topbarRight = usePageStatusStore((s) => s.topbarRight);
    const toggleSidebar = useShellStore((s) => s.toggleSidebar);

    return (
        <div className="topbar">
            <div className="topbar-title">
                <button className="menu-btn" type="button" aria-label={t('shell.toggleMenu')} onClick={toggleSidebar}>
                    <MenuIcon />
                </button>
                <div>
                    <h1>{titles?.title ?? t(page.title)}</h1>
                    <div className="sub">{titles?.subtitle ?? (page.subtitle ? t(page.subtitle) : '')}</div>
                </div>
            </div>
            <div className="topbar-right">
                {topbarRight}
                {page.link && <PageShortcut link={page.link} />}
                <LivePill fallback={page.status || 'status.connecting'} />
            </div>
        </div>
    );
}

/** The arrow points back towards the linked page, which in RTL is the other way round. */
function PageShortcut({ link }: { link: NonNullable<PageMeta['link']> }) {
    const { t, isRTL } = useI18n();
    const back = link.to !== 'forward';
    const arrow = <span aria-hidden="true">{back === !isRTL ? '←' : '→'}</span>;
    const label = <span>{t(link.label)}</span>;
    return (
        <Link to={link.href} className="nav-pill-link">
            {back ? <>{arrow} {label}</> : <>{label} {arrow}</>}
        </Link>
    );
}

function LivePill({ fallback }: { fallback: string }) {
    useI18n();
    const pill = usePageStatusStore((s) => s.pill);
    const healthy = pill.kind === 'lost' ? false : pill.kind === 'text' ? pill.healthy : true;
    return (
        <div className="live-pill">
            <span className={cx('status-dot', !healthy && 'error')} />
            <span>{pillText(pill, fallback)}</span>
        </div>
    );
}

function pillText(pill: StatusPill, fallback: string): string {
    switch (pill.kind) {
        case 'updated': return t('status.updated', { time: format.time(pill.at) });
        case 'lost': return t('status.connectionLost');
        case 'text': return renderMessage(pill.message);
        default: return t(fallback);
    }
}
