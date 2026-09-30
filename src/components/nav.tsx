import type { ReactNode } from 'react';

// The menu and the per-page title strip, keyed by URL path the same way the
// router is (App.tsx). A new page needs a route there and an entry here.

const icon = (paths: ReactNode) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);

export interface NavItem { href: string; label: string; icon: ReactNode }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
    {
        label: 'nav.group.monitor',
        items: [
            { href: '/dashboard', label: 'nav.overview', icon: icon(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>) },
            { href: '/statistics', label: 'nav.statistics', icon: icon(<><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M7 15l3.5-4.5 3 2.5L18 7" /></>) },
        ],
    },
    {
        label: 'nav.group.trading',
        items: [
            { href: '/market', label: 'nav.market', icon: icon(<><path d="M4 20V10M9.5 20V4M15 20v-8M20.5 20V7" /><path d="M2.5 10h3M8 4h3M13.5 12h3M19 7h3" /></>) },
            { href: '/manual-trade', label: 'nav.manualTrade', icon: icon(<><path d="M7 4v16M3 16l4 4 4-4" /><path d="M17 20V4M13 8l4-4 4 4" /></>) },
        ],
    },
    {
        label: 'nav.group.reports',
        items: [
            { href: '/incidents', label: 'nav.incidents', icon: icon(<><path d="M12 2 1 21h22L12 2z" /><path d="M12 9v5" /><circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" /></>) },
            { href: '/balances', label: 'nav.balances', icon: icon(<><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19" /><circle cx="17" cy="14.5" r="1" fill="currentColor" stroke="none" /></>) },
            { href: '/reconciliation', label: 'nav.reconciliation', icon: icon(<><path d="M7 3v14M4 6l3-3 3 3" /><path d="M17 21V7M14 18l3 3 3-3" /></>) },
            { href: '/profit', label: 'nav.profit', icon: icon(<><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>) },
            { href: '/orders', label: 'nav.orders', icon: icon(<><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h6M9 7h3" /></>) },
            { href: '/opportunities', label: 'nav.opportunities', icon: icon(<><path d="M3 20h18" /><rect x="5" y="12" width="3.5" height="6" rx="1" /><rect x="10.25" y="8" width="3.5" height="10" rx="1" /><rect x="15.5" y="4" width="3.5" height="14" rx="1" /></>) },
            { href: '/missed-opportunities', label: 'nav.missed', icon: icon(<><rect x="2.5" y="6" width="19" height="13" rx="2" /><path d="M2.5 10h19" /><path d="M12 13v4M10 15h4" /></>) },
        ],
    },
    {
        label: 'nav.group.diagnostics',
        items: [
            { href: '/order-audit', label: 'nav.orderAudit', icon: icon(<><path d="M4 6h7M4 12h7M4 18h7" /><path d="M15 8l2.5 2.5L22 6" /><path d="M15 18l2.5 2.5L22 16" /></>) },
            { href: '/request-logs', label: 'nav.requestLogs', icon: icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>) },
        ],
    },
    {
        label: 'nav.group.configuration',
        items: [
            { href: '/providers', label: 'nav.providers', icon: icon(<><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" /><circle cx="7.5" cy="16.5" r="1" fill="currentColor" stroke="none" /></>) },
        ],
    },
];

export interface PageMeta {
    title: string;
    subtitle: string;
    docTitle: string;
    /** The one shortcut link the page offers in its topbar. */
    link?: { href: string; label: string; to?: 'forward' | 'back' };
    /** Initial status-pill text key, until the page reports its own. */
    status?: string;
    /** The menu entry to highlight when the page is not itself in the menu. */
    nav?: string;
}

export const PAGES: Record<string, PageMeta> = {
    '/dashboard': { title: 'page.dashboard.title', subtitle: 'page.dashboard.sub', docTitle: 'dashboard.docTitle', link: { href: '/request-logs', label: 'nav.requestLogs', to: 'forward' } },
    '/statistics': { title: 'page.statistics.title', subtitle: 'page.statistics.sub', docTitle: 'stats.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/market': { title: 'page.market.title', subtitle: 'page.market.sub', docTitle: 'market.docTitle', status: 'status.connecting' },
    '/manual-trade': { title: 'page.manualTrade.title', subtitle: 'page.manualTrade.sub', docTitle: 'manual.docTitle', status: 'status.loading' },
    '/incidents': { title: 'page.incidents.title', subtitle: 'page.incidents.sub', docTitle: 'incidents.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/balances': { title: 'page.balances.title', subtitle: 'page.balances.sub', docTitle: 'balances.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/reconciliation': { title: 'page.reconciliation.title', subtitle: 'page.reconciliation.sub', docTitle: 'recon.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/profit': { title: 'page.profit.title', subtitle: 'page.profit.sub', docTitle: 'profit.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/orders': { title: 'page.orders.title', subtitle: 'page.orders.sub', docTitle: 'orders.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/opportunities': { title: 'page.opportunities.title', subtitle: 'page.opportunities.sub', docTitle: 'opps.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/missed-opportunities': { title: 'page.missed.title', subtitle: 'page.missed.sub', docTitle: 'missed.docTitle', link: { href: '/opportunities', label: 'nav.opportunities' } },
    '/order-audit': { title: 'page.orderAudit.title', subtitle: 'page.orderAudit.sub', docTitle: 'audit.docTitle', link: { href: '/orders', label: 'nav.orders' }, status: 'status.idle' },
    '/request-logs': { title: 'page.requestLogs.title', subtitle: 'page.requestLogs.sub', docTitle: 'logs.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/providers': { title: 'page.providers.title', subtitle: 'page.providers.sub', docTitle: 'providers.docTitle', link: { href: '/dashboard', label: 'nav.overview' } },
    '/provider-edit': { title: 'page.providerEdit.title', subtitle: 'page.providerEdit.sub', docTitle: 'providerEdit.docTitle', link: { href: '/providers', label: 'nav.providers' }, nav: '/providers' },
};
