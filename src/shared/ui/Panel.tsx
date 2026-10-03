import type { ReactNode } from 'react';

import { cx } from '../lib/cx';

interface PanelProps {
    title: ReactNode;
    /** Shown as a pill after the title. */
    count?: ReactNode;
    hint?: ReactNode;
    /** Extra header content after the hint (filters, buttons). */
    actions?: ReactNode;
    className?: string;
    id?: string;
    hidden?: boolean;
    children?: ReactNode;
}

/** The titled card every page section sits in. */
export function Panel({ title, count, hint, actions, className, id, hidden, children }: PanelProps) {
    return (
        <section className={cx('panel', className)} id={id} hidden={hidden}>
            <div className="panel-header">
                <h2>{count === undefined ? title : <><span>{title}</span> <span className="count">{count}</span></>}</h2>
                {hint && <span className="panel-hint">{hint}</span>}
                {actions}
            </div>
            {children}
        </section>
    );
}
