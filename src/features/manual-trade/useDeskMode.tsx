import { useEffect } from 'react';

import { useI18n } from '../../i18n';
import { usePageStatus } from '../../shared/stores/pageStatus';
import { StatusBadge } from '../../shared/ui';
import type { DeskConfig } from './api';

export interface DeskMode {
    badge: { tone: string; key: string };
    notice: { tone?: 'red'; key: string } | null;
}

// The badge and the notice are two views of one state, so they are decided
// in one place.
function deskMode(config: DeskConfig | undefined, tried: boolean): DeskMode {
    if (!tried) return { badge: { tone: 'pending', key: 'manual.badge.loading' }, notice: null };
    if (!config) return { badge: { tone: 'failed', key: 'manual.badge.offline' }, notice: null };
    if (!config.available) return { badge: { tone: 'failed', key: 'manual.badge.unavailable' }, notice: { tone: 'red', key: 'manual.notice.unavailable' } };
    if (!config.enabled) return { badge: { tone: 'stale', key: 'manual.badge.previewOnly' }, notice: { key: 'manual.notice.disabled' } };
    if (config.simulate_orders) return { badge: { tone: 'simulated', key: 'manual.badge.simulation' }, notice: { key: 'manual.notice.simulation' } };
    return { badge: { tone: 'failed', key: 'manual.badge.live' }, notice: null };
}

/** What the desk will do with an order, with its badge in the topbar for as long as the page is open. */
export function useDeskMode(config: DeskConfig | undefined, tried: boolean): DeskMode {
    const { t } = useI18n();
    const { setTopbarRight } = usePageStatus();
    const mode = deskMode(config, tried);
    const { tone, key } = mode.badge;

    useEffect(() => { setTopbarRight(<StatusBadge tone={tone}>{t(key)}</StatusBadge>); }, [setTopbarRight, tone, key, t]);
    useEffect(() => () => setTopbarRight(null), [setTopbarRight]);
    return mode;
}
