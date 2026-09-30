import { Fragment } from 'react';

import { useI18n } from '../i18n';

/** Pager for the API's `{page, page_size, total, total_pages}` envelope. */
export default function Pagination({ data, onPage }: { data: any; onPage: (page: number) => void }) {
    const { t, format } = useI18n();
    const total: number = data.total_pages || 0;
    const cur: number = data.page || 1;
    if (total <= 1) return null;

    const num = (n: number) => format.number(n);
    const first = (cur - 1) * data.page_size + 1;
    const last = Math.min(cur * data.page_size, data.total);

    const pages: number[] = [];
    for (let p = 1; p <= total; p++) {
        if (p <= 2 || p > total - 2 || Math.abs(p - cur) <= 1) pages.push(p);
    }

    return (
        <div className="pagination" style={{ display: 'flex' }}>
            <div className="pagination-info">{t('common.shortRange', { start: num(first), end: num(last), total: num(data.total) })}</div>
            <div className="pagination-controls">
                <button className="page-btn" disabled={cur <= 1} onClick={() => onPage(cur - 1)}>‹</button>
                {pages.map((p, i) => (
                    <Fragment key={p}>
                        {i > 0 && p - pages[i - 1] > 1 && <span className="page-btn" style={{ border: 'none', cursor: 'default' }}>…</span>}
                        <button className={`page-btn ${p === cur ? 'active' : ''}`} onClick={() => onPage(p)}>{num(p)}</button>
                    </Fragment>
                ))}
                <button className="page-btn" disabled={cur >= total} onClick={() => onPage(cur + 1)}>›</button>
            </div>
        </div>
    );
}
