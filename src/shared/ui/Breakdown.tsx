import type { CSSProperties, ReactNode } from 'react';

import { cx } from '../lib/cx';

/** One line of a `.breakdown` table; `total` lines are ruled off. */
export interface BreakdownLine {
    label: ReactNode;
    value: ReactNode;
    className?: string;
    total?: boolean;
}

/** A label/value table, as used in the expanded rows of the history pages. */
export function Breakdown({ lines }: { lines: Array<BreakdownLine | false | null | undefined> }) {
    return (
        <table className="breakdown">
            <tbody>
                {lines.filter((l): l is BreakdownLine => Boolean(l)).map((l, i) => (
                    <tr key={i} className={cx(l.total && 'total')}>
                        <td>{l.label}</td>
                        <td className={l.className}>{l.value}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** A titled column of an expanded row's detail grid. */
export function DetailColumn({ label, children, style }: { label: ReactNode; children: ReactNode; style?: CSSProperties }) {
    return (
        <div>
            <div className="detail-col-label" style={style}>{label}</div>
            {children}
        </div>
    );
}
