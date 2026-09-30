import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';

import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { API_BASE, fetchJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { renderJSON } from './RequestLogs/renderJSON';

interface Filters {
    provider: string;
    operation: string;
    success: string;
    symbol: string;
    orderId: string;
    pageSize: string;
}

const EMPTY_FILTERS: Filters = { provider: '', operation: '', success: '', symbol: '', orderId: '', pageSize: '25' };

interface Query extends Filters {
    page: number;
    // Bumped by Apply/Refresh/page clicks so an unchanged query still refetches.
    nonce: number;
}

function buildQuery(q: Query): string {
    const params = new URLSearchParams();
    params.set('page', String(q.page));
    params.set('page_size', q.pageSize);
    if (q.provider) params.set('provider', q.provider);
    if (q.operation) params.set('operation', q.operation);
    if (q.success) params.set('success', q.success);
    if (q.symbol) params.set('symbol', q.symbol);
    if (q.orderId) params.set('order_id', q.orderId);
    return params.toString();
}

export default function RequestLogs() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();
    const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
    const [query, setQuery] = useState<Query>({ ...EMPTY_FILTERS, page: 1, nonce: 0 });
    const [data, setData] = useState<any>(null);
    const [providers, setProviders] = useState<any[]>([]);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const seq = useRef(0);
    useEffect(() => () => { seq.current++; }, []);

    async function fetchLogs() {
        const mine = ++seq.current;
        try {
            const { ok, data } = await fetchJSON(`/request-logs?${buildQuery(query)}`);
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            if (mine !== seq.current) return;
            setData(data);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            if (mine !== seq.current) return;
            console.error('Error fetching request logs:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('error.unreachable', { base: API_BASE }));
        }
    }

    const refresh = usePolling(fetchLogs, 10000, [query, locale]);

    // Active venues plus any with logs. A failure leaves only "All", which
    // still works - the filter is a convenience, not the page.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { ok, data } = await fetchJSON('/request-logs/providers');
                if (!ok || cancelled) return;
                setProviders(data.providers || []);
            } catch (err) {
                console.error('request logs: providers:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [locale]);

    const apply = () => {
        setQuery(q => ({
            ...draft,
            symbol: draft.symbol.trim(),
            orderId: draft.orderId.trim(),
            page: 1,
            nonce: q.nonce + 1,
        }));
    };
    const reset = () => {
        setDraft(EMPTY_FILTERS);
        setQuery(q => ({ ...EMPTY_FILTERS, page: 1, nonce: q.nonce + 1 }));
    };
    const goTo = (page: number) => setQuery(q => ({ ...q, page, nonce: q.nonce + 1 }));
    const onEnter = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') apply(); };
    const setField = (key: keyof Filters) => (e: { target: { value: string } }) =>
        setDraft(d => ({ ...d, [key]: e.target.value }));
    const toggle = (id: string) => setExpanded(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const num = (n: unknown) => format.number(n as number);
    const logs: any[] = data?.logs || [];
    const totalPages = Math.max(1, data?.total_pages || 1);
    const succeeded = logs.filter(l => l.success).length;
    const avgMs = logs.length ? Math.round(logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / logs.length) : 0;

    return (
        <>
            <div className="stats" id="statsRow">
                <div className="stat">
                    <div className="stat-label">{t('logs.stat.total')}</div>
                    <div className="stat-value accent">{data ? num(data.total || 0) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('logs.stat.page')}</div>
                    <div className="stat-value">{data ? num(logs.length) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('logs.stat.success')}</div>
                    <div className="stat-value green">{data ? num(succeeded) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('logs.stat.failed')}</div>
                    <div className="stat-value red">{data ? num(logs.length - succeeded) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('logs.stat.avgDuration')}</div>
                    <div className="stat-value amber">
                        {data && logs.length ? t('common.milliseconds', { value: num(avgMs) }) : '—'}
                    </div>
                </div>
            </div>

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('logs.panel.title')}</span> <span className="count">{data?.total || 0}</span></h2>
                    <span className="panel-hint">{t('logs.panel.hint')}</span>
                </div>

                <div className="filters">
                    <div className="filter-field">
                        <label htmlFor="fProvider">{t('common.provider')}</label>
                        {/* Venue codes and API operation names are the bot's own
                            identifiers and appear verbatim in its logs, so only
                            the "All" option is a word. */}
                        <select id="fProvider" value={draft.provider} onChange={setField('provider')}>
                            <option value="">{t('common.all')}</option>
                            {providers.map(p => (
                                <option key={p.code} value={p.code}>
                                    {p.active ? p.code : t('logs.filter.inactiveProvider', { code: p.code })}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fOperation">{t('logs.filter.operation')}</label>
                        <select id="fOperation" value={draft.operation} onChange={setField('operation')}>
                            <option value="">{t('common.all')}</option>
                            <option value="place_order">place_order</option>
                            <option value="get_status">get_status</option>
                            <option value="cancel_order">cancel_order</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fSuccess">{t('logs.filter.result')}</label>
                        <select id="fSuccess" value={draft.success} onChange={setField('success')}>
                            <option value="">{t('common.all')}</option>
                            <option value="true">{t('logs.filter.success')}</option>
                            <option value="false">{t('logs.filter.failed')}</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fSymbol">{t('common.symbol')}</label>
                        <input type="text" id="fSymbol" placeholder={t('logs.filter.symbolPlaceholder')}
                               value={draft.symbol} onChange={setField('symbol')} onKeyDown={onEnter} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fOrderId">{t('logs.filter.orderId')}</label>
                        <input type="text" id="fOrderId" placeholder={t('logs.filter.orderIdPlaceholder')}
                               value={draft.orderId} onChange={setField('orderId')} onKeyDown={onEnter} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fPageSize">{t('common.pageSize')}</label>
                        <select id="fPageSize" value={draft.pageSize} onChange={setField('pageSize')}>
                            <option value="10">10</option>
                            <option value="25">25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                    </div>
                    <button className="btn primary" onClick={apply}>{t('common.apply')}</button>
                    <button className="btn" onClick={reset}>{t('common.reset')}</button>
                    <button className="btn" title={t('common.refreshNow')} onClick={refresh}>{t('common.refresh')}</button>
                </div>

                <div>
                    {!data ? (
                        <div className="skeleton">{t('logs.loading')}</div>
                    ) : logs.length === 0 ? (
                        <div className="empty-state"><span className="big">🧾</span>{t('logs.empty')}</div>
                    ) : (
                        <div className="table-scroll">
                            <table className="data-table log-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>{t('common.time')}</th>
                                        <th>{t('common.provider')}</th>
                                        <th>{t('logs.filter.operation')}</th>
                                        <th>{t('common.symbol')}</th>
                                        <th>{t('logs.col.side')}</th>
                                        <th>{t('logs.filter.orderId')}</th>
                                        <th>{t('logs.col.duration')}</th>
                                        <th>{t('logs.filter.result')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map(l => (
                                        <LogRow key={l.id} l={l} open={expanded.has(String(l.id))} onToggle={() => toggle(String(l.id))} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {data && logs.length > 0 && (
                    <Pagination data={data} totalPages={totalPages} page={query.page} goTo={goTo} />
                )}
            </section>

            <footer className="page-footer">{t('logs.footer')}</footer>
        </>
    );
}

function LogRow({ l, open, onToggle }: { l: any; open: boolean; onToggle: () => void }) {
    const { t, format } = useI18n();
    const sideClass = l.side === 'buy' ? 'side-buy' : (l.side === 'sell' ? 'side-sell' : '');
    return (
        <Fragment>
            <tr className={`log-row ${l.success ? '' : 'failed'}${open ? ' expanded' : ''}`} onClick={onToggle}>
                <td><span className="expand-arrow">▶</span></td>
                <td>{format.dateTime(l.created_at)}</td>
                <td className="provider-tag">{l.provider}</td>
                <td><span className="op-tag">{l.operation}</span></td>
                <td>{l.symbol ? l.symbol : <span className="json-null">—</span>}</td>
                <td className={sideClass}>{l.side ? l.side : '—'}</td>
                <td>{l.order_id ? l.order_id : '—'}</td>
                <td>{t('common.milliseconds', { value: format.number(l.duration_ms) })}</td>
                <td>
                    <span className={`status-badge ${l.success ? 'ok' : 'fail'}`}>
                        {t(l.success ? 'logs.result.ok' : 'logs.result.failed')}
                    </span>
                </td>
            </tr>
            <tr className={`detail-row${open ? '' : ' hidden'}`}>
                <td colSpan={9}>
                    <div className="detail-wrap">
                        <div className="detail-grid">
                            <div>
                                <div className="detail-col-label">{t('logs.detail.request')}</div>
                                <div className="json-view" dangerouslySetInnerHTML={{ __html: renderJSON(l.request) }} />
                            </div>
                            <div>
                                <div className="detail-col-label">{t('logs.detail.response')}</div>
                                <div className="json-view" dangerouslySetInnerHTML={{ __html: renderJSON(l.response) }} />
                            </div>
                            <div className="detail-meta">
                                <span className="meta-chip">{t('logs.meta.provider', { value: l.provider })}</span>
                                <span className="meta-chip">{t('logs.meta.operation', { value: l.operation })}</span>
                                {l.symbol && <span className="meta-chip">{t('logs.meta.symbol', { value: l.symbol })}</span>}
                                {l.side && <span className="meta-chip">{t('logs.meta.side', { value: l.side })}</span>}
                                {l.order_id && <span className="meta-chip">{t('logs.meta.orderId', { value: l.order_id })}</span>}
                                <span className="meta-chip">{t('logs.meta.duration', { value: format.number(l.duration_ms) })}</span>
                                <span className="meta-chip">{t('logs.meta.id', { value: l.id })}</span>
                            </div>
                            {l.error_message && <div className="error-line">{l.error_message}</div>}
                        </div>
                    </div>
                </td>
            </tr>
        </Fragment>
    );
}

function Pagination({ data, totalPages, page, goTo }: {
    data: any;
    totalPages: number;
    page: number;
    goTo: (page: number) => void;
}) {
    const { t, format } = useI18n();
    const num = (n: number) => format.number(n);
    const start = data.total === 0 ? 0 : (data.page - 1) * data.page_size + 1;
    const end = Math.min(data.page * data.page_size, data.total);

    const pages: number[] = [];
    const cur: number = data.page;
    const add = (p: number) => { if (!pages.includes(p) && p >= 1 && p <= totalPages) pages.push(p); };
    add(1); add(totalPages);
    for (let p = cur - 1; p <= cur + 1; p++) add(p);
    pages.sort((a, b) => a - b);

    const items: ReactElement[] = [];
    let last = 0;
    for (const p of pages) {
        if (last && p - last > 1) {
            items.push(<span key={`gap-${p}`} className="page-btn" style={{ border: 'none', cursor: 'default' }}>…</span>);
        }
        items.push(
            <button key={p} className={`page-btn ${p === cur ? 'active' : ''}`} onClick={() => goTo(p)}>{num(p)}</button>,
        );
        last = p;
    }

    // The chevrons are bidi-mirrored characters, so they point the right way
    // round in an RTL layout without a second pair of glyphs.
    return (
        <div className="pagination" style={{ display: 'flex' }}>
            <div className="pagination-info">
                {t('common.showingRange', { start: num(start), end: num(end), total: num(data.total) })}
            </div>
            <div className="pagination-controls">
                <button className="page-btn" disabled={cur <= 1} onClick={() => { if (page > 1) goTo(page - 1); }}>‹</button>
                {items}
                <button className="page-btn" disabled={cur >= totalPages} onClick={() => { if (page < totalPages) goTo(page + 1); }}>›</button>
            </div>
        </div>
    );
}
