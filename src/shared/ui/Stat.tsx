import type { ReactNode } from 'react';

import { cx } from '../lib/cx';

/** The row of headline figures above a page's panels. */
export function StatGrid({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={cx('stats', className)}>{children}</div>;
}

interface StatProps {
    label: ReactNode;
    value: ReactNode;
    /** Shown smaller after the value. */
    unit?: ReactNode;
    /** A class on the value: `accent`, `green`, `red`, or a sign class. */
    tone?: string;
    /** The explanatory line under the value; omitted entirely when undefined. */
    sub?: ReactNode;
    /** Replaces the label row (a label with a picker beside it). */
    head?: ReactNode;
}

export function Stat({ label, value, unit, tone, sub, head }: StatProps) {
    return (
        <div className="stat">
            {head ?? <div className="stat-label">{label}</div>}
            <div className={cx('stat-value', tone)}>{value}{unit ? <span className="stat-unit">{unit}</span> : null}</div>
            {sub !== undefined && <div className="stat-sub">{sub}</div>}
        </div>
    );
}
