import type { ReactNode } from 'react';

import { cx } from '../lib/cx';
import { providerColor } from '../lib/providers';

/** A pill; `tone` is one of app.css's status-badge variants (online, offline, stale, …). */
export function StatusBadge({ tone, title, children }: { tone?: string; title?: string; children: ReactNode }) {
    return <span className={cx('status-badge', tone)} title={title}>{children}</span>;
}

/** A venue with its colour dot; shows `label` (its display name) when given. */
export function ProviderName({ code, label }: { code: string; label?: ReactNode }) {
    return (
        <span className="provider-name">
            <span className="provider-dot" style={{ background: providerColor(code) }} />{label ?? code}
        </span>
    );
}

/** buy venue → sell venue. */
export function ProviderRoute({ from, to }: { from: ReactNode; to: ReactNode }) {
    return <><span className="provider-tag">{from}</span><span className="arrow">→</span><span className="provider-tag">{to}</span></>;
}
