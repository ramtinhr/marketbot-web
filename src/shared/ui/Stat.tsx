import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { cx } from '../lib/cx';

const MIN_FONT_PX = 12;

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

// A figure can be as long as "+0.0000003951 BTC" in a card sized for "7/7":
// the value shrinks until it fits on its line rather than spilling out of the card.
function useFitToWidth(value: ReactNode, unit: ReactNode) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const fit = () => {
            el.style.fontSize = '';
            if (el.scrollWidth <= el.clientWidth) return;
            const full = parseFloat(getComputedStyle(el).fontSize);
            let size = Math.max(MIN_FONT_PX, Math.floor(full * (el.clientWidth / el.scrollWidth)));
            el.style.fontSize = `${size}px`;
            // The unit keeps its own size, so the proportional guess can land a pixel or two wide.
            while (el.scrollWidth > el.clientWidth && size > MIN_FONT_PX) el.style.fontSize = `${--size}px`;
        };
        fit();
        let width = el.clientWidth;
        const observer = new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            fit();
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [value, unit]);
    return ref;
}

export function Stat({ label, value, unit, tone, sub, head }: StatProps) {
    const ref = useFitToWidth(value, unit);
    return (
        <div className="stat">
            {head ?? <div className="stat-label">{label}</div>}
            <div ref={ref} className={cx('stat-value', tone)}>{value}{unit ? <span className="stat-unit">{unit}</span> : null}</div>
            {sub !== undefined && <div className="stat-sub">{sub}</div>}
        </div>
    );
}
