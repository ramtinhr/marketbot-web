import { Fragment } from 'react';

import { useI18n } from '../../i18n';
import { cx } from '../lib/cx';

/** The API's paging envelope. */
export interface PageInfo {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
}

/** Page numbers to show: the first two, the last two, and the current one with its neighbours. */
function visiblePages(current: number, total: number): number[] {
    const pages: number[] = [];
    for (let p = 1; p <= total; p++) {
        if (p <= 2 || p > total - 2 || Math.abs(p - current) <= 1) pages.push(p);
    }
    return pages;
}

export function Pagination({ data, onPage, rangeKey = 'common.shortRange' }: {
    data: PageInfo;
    onPage: (page: number) => void;
    /** The catalogue key for the "x–y of z" line. */
    rangeKey?: string;
}) {
    const { t, format } = useI18n();
    const total = data.total_pages || 0;
    const cur = data.page || 1;
    if (total <= 1) return null;

    const num = (n: number) => format.number(n);
    const first = (cur - 1) * data.page_size + 1;
    const last = Math.min(cur * data.page_size, data.total);
    const pages = visiblePages(cur, total);

    // The chevrons are bidi-mirrored characters, so they point the right way
    // round in an RTL layout without a second pair of glyphs.
    return (
        <div className="pagination" style={{ display: 'flex' }}>
            <div className="pagination-info">{t(rangeKey, { start: num(first), end: num(last), total: num(data.total) })}</div>
            <div className="pagination-controls">
                <button className="page-btn" disabled={cur <= 1} onClick={() => onPage(cur - 1)}>‹</button>
                {pages.map((p, i) => (
                    <Fragment key={p}>
                        {i > 0 && p - pages[i - 1] > 1 && <span className="page-btn" style={{ border: 'none', cursor: 'default' }}>…</span>}
                        <button className={cx('page-btn', p === cur && 'active')} onClick={() => onPage(p)}>{num(p)}</button>
                    </Fragment>
                ))}
                <button className="page-btn" disabled={cur >= total} onClick={() => onPage(cur + 1)}>›</button>
            </div>
        </div>
    );
}
