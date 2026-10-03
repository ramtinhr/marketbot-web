import type { ReactNode } from 'react';

import { cx } from '../lib/cx';

/** An inline result line under a form or at the top of a page; untoned is neutral. */
export function Notice({ tone, children }: { tone?: 'green' | 'red'; children: ReactNode }) {
    return <div className={cx('mt-notice', tone)} role={tone === 'red' ? 'alert' : 'status'}>{children}</div>;
}

export function PageFooter({ children }: { children: ReactNode }) {
    return <footer className="page-footer">{children}</footer>;
}
