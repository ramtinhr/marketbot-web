import { Fragment, useRef, useState, type KeyboardEvent } from 'react';

import Html from '../components/Html';
import { usePageStatus } from '../components/Layout';
import { format, t, useI18n } from '../i18n';
import { apiUrl, fetchJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import Pagination from '../components/Pagination';

const API = '/opportunity-projections';

const missing = (n: unknown) => n === null || n === undefined || Number.isNaN(Number(n));

// Toman figures run to millions, quantities to eight decimals - one
// formatter for both would make every column unreadable at one end or the
// other.
const toman = (n: any) => missing(n) ? '—' : format.number(n, { maximumFractionDigits: 0 });
const qty = (n: any, d = 4) => missing(n) ? '—' : format.number(n, { maximumFractionDigits: d });
const pct = (n: any, d = 4) => missing(n) ? '—' : (n >= 0 ? '+' : '') + format.percent(n, d);
const signClass = (n: any) => (n || 0) >= 0 ? 'profit-positive' : 'profit-negative';

// A cap of -1 is "not known" and must never render as a venue holding
// nothing - see OpportunityProjection.BuyBalanceMaxAmount.
const cap = (n: any) => n === -1 ? t('opps.notKnown') : qty(n, 4) + ' USDT';

// Every best-price figure is computed server-side (models.bestPrice) and
// arrives on the row, so the table, the detail panel, the CSV and the
// summary total cannot disagree. Nothing here recomputes it.
const bestPriceOf = (r: any) => (r && r.best_price) || { known: false, placeable: 'unknown' };

// Whether a best-price order clears both venues' minimum order quantities.
// Three-valued on purpose: the minimums are not on the row, so "unknown"
// is a real answer and must not be dressed up as a yes.
const PLACEABILITY: Record<string, [string, string, string]> = {
    yes: ['opps.placeable.yes', 'completed', 'opps.placeable.yesHint'],
    no: ['opps.placeable.no', 'failed', 'opps.placeable.noHint'],
    unknown: ['opps.placeable.unknown', 'pending', 'opps.placeable.unknownHint'],
};
const placeabilityOf = (state: string) => {
    const [label, badge, hint] = PLACEABILITY[state] || PLACEABILITY.unknown;
    return { label: t(label), badge, hint: t(hint) };
};

// The outcome codes are the bot's own enum; each maps to a short badge for
// the table and a full sentence for the detail view, where there is room
// for one and the abbreviation would be guesswork.
const OUTCOMES: Record<string, [string, string, string]> = {
    executed: ['opps.outcomeShort.executed', 'completed', 'opps.outcomeLong.executed'],
    skipped_below_min_trade: ['opps.outcomeShort.belowMinTrade', 'pending', 'opps.outcomeLong.belowMinTrade'],
    skipped_order_circuit: ['opps.outcomeShort.orderCircuit', 'failed', 'opps.outcomeLong.orderCircuit'],
    skipped_quantity_too_small: ['opps.outcomeShort.quantityTooSmall', 'pending', 'opps.outcomeLong.quantityTooSmall'],
    refused_implausible: ['opps.outcomeShort.implausible', 'failed', 'opps.outcomeLong.implausible'],
    skipped_not_best: ['opps.outcomeShort.notBest', 'pending', 'opps.outcomeLong.notBest'],
};
// An outcome the server grows and this page has not learned yet shows its
// raw code rather than nothing at all.
const outcomeOf = (code: string) => {
    const hit = OUTCOMES[code];
    return hit
        ? { label: t(hit[0]), badge: hit[1], long: t(hit[2]) }
        : { label: code, badge: 'pending', long: code };
};

const LIMIT_KEYS: Record<string, [string, string]> = {
    depth: ['opps.limit.depth', 'opps.limitShort.depth'],
    buy_balance: ['opps.limit.buyBalance', 'opps.limitShort.buyBalance'],
    sell_balance: ['opps.limit.sellBalance', 'opps.limitShort.sellBalance'],
    config: ['opps.limit.config', 'opps.limitShort.config'],
};
const limitLabel = (code: string) => (LIMIT_KEYS[code] ? t(LIMIT_KEYS[code][0]) : code);
const limitShort = (code: string) => (LIMIT_KEYS[code] ? t(LIMIT_KEYS[code][1]) : code);

// Short enough that ten columns fit the panel without a horizontal scroll:
// the expanded detail row shares the table's width, so a table that
// overflows takes half of every breakdown off-screen with it.
const shortTime = (iso: string) => format.dateTime(iso, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

// Two groups: the deep-book projection (Max size / Projected / Net), which
// walks down both books, and the best-price pair, which never leaves the
// top level. They answer different questions and are deliberately shown
// side by side rather than one standing in for the other.
//
// The best-price columns carry no sort key: they are derived on read, not
// stored, so there is no column for the API's ORDER BY whitelist to accept.
const COLUMNS: { key: string | null; label: string | null; hint?: string }[] = [
    { key: null, label: null },
    { key: 'detected_at', label: 'opps.col.detected' },
    { key: 'buy_provider', label: 'common.route' },
    { key: 'max_amount', label: 'opps.col.maxSize' },
    { key: 'projected_amount', label: 'opps.col.projected' },
    { key: 'net_profit', label: 'opps.col.net' },
    { key: 'net_profit_pct', label: 'opps.col.netPct' },
    { key: null, label: 'opps.col.bestPrice', hint: 'opps.col.bestPriceHint' },
    { key: null, label: 'opps.col.netAtBest', hint: 'opps.col.netAtBestHint' },
    { key: 'outcome', label: 'common.outcome' },
];

interface Filters {
    from: string;
    to: string;
    buy: string;
    sell: string;
    outcome: string;
    limitedBy: string;
    minProfit: string;
    maxProfit: string;
    minPct: string;
    placeable: string;
    simulated: string;
    pageSize: string;
}

const DEFAULT_FILTERS: Filters = {
    from: '', to: '', buy: '', sell: '', outcome: '', limitedBy: '',
    minProfit: '', maxProfit: '', minPct: '', placeable: '', simulated: '', pageSize: '25',
};

interface View { page: number; sort: string; dir: 'asc' | 'desc' }
const DEFAULT_VIEW: View = { page: 1, sort: 'detected_at', dir: 'desc' };

type Execution = { state: 'ok'; data: any } | { state: 'error'; error: string };

export default function Opportunities() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();

    const [filters, setFiltersState] = useState<Filters>(DEFAULT_FILTERS);
    const filtersRef = useRef(filters);
    const [view, setViewState] = useState<View>(DEFAULT_VIEW);
    const viewRef = useRef(view);
    const [data, setData] = useState<any>(null);
    const [providers, setProviders] = useState<string[]>([]);
    const knownProviders = useRef(new Set<string>());
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [executions, setExecutions] = useState<Record<string, Execution>>({});
    const executionsRequested = useRef(new Set<string>());

    const setFilters = (next: Filters) => {
        filtersRef.current = next;
        setFiltersState(next);
    };
    const setFilter = (key: keyof Filters, value: string) => setFilters({ ...filtersRef.current, [key]: value });

    function query(): URLSearchParams {
        const f = filtersRef.current;
        const v = viewRef.current;
        const p = new URLSearchParams();
        const put = (k: string, val: string | number) => { if (val !== '' && val !== null && val !== undefined) p.set(k, String(val)); };
        put('from', f.from);
        put('to', f.to);
        put('buy_provider', f.buy);
        put('sell_provider', f.sell);
        put('outcome', f.outcome);
        put('limited_by', f.limitedBy);
        put('min_net_profit', f.minProfit);
        put('max_net_profit', f.maxProfit);
        put('min_net_profit_pct', f.minPct);
        put('placeable', f.placeable);
        put('simulated', f.simulated);
        put('page_size', f.pageSize);
        put('page', v.page);
        put('sort', v.sort);
        put('dir', v.dir);
        return p;
    }

    async function load() {
        try {
            const { ok, data } = await fetchJSON(`${API}?${query()}`);
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            const rows: any[] = data.projections || [];
            rows.forEach(r => { knownProviders.current.add(r.buy_provider); knownProviders.current.add(r.sell_provider); });
            const known = Array.from(knownProviders.current).filter(Boolean).sort();
            setProviders(prev => {
                const have = new Set(prev);
                const add = known.filter(p => !have.has(p));
                return add.length ? [...prev, ...add] : prev;
            });
            setData(data);
            // A reload repaints the table, closing any open detail row.
            setExpanded(new Set());
            setExecutions({});
            executionsRequested.current.clear();
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (err) {
            console.error('projections:', err);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('opps.loadError', { error: err instanceof Error ? err.message : String(err) }));
        }
    }

    // Slower than the trading pages: a projection is a historical record, and a
    // 5s poll would reset an open detail row while it is being read.
    const refresh = usePolling(load, 30000, [locale]);

    const go = (patch: Partial<View>) => {
        viewRef.current = { ...viewRef.current, ...patch };
        setViewState(viewRef.current);
        refresh();
    };

    const onSort = (key: string) => {
        const v = viewRef.current;
        if (v.sort === key) go({ dir: v.dir === 'asc' ? 'desc' : 'asc', page: 1 });
        else go({ sort: key, dir: 'desc', page: 1 });
    };

    const reset = () => {
        setFilters(DEFAULT_FILTERS);
        viewRef.current = DEFAULT_VIEW;
        setViewState(DEFAULT_VIEW);
        refresh();
    };

    const exportCsv = () => {
        // The same filters and ordering the table is showing, so an export can
        // never disagree with what it was taken from.
        const p = query();
        p.delete('page');
        p.delete('page_size');
        window.location.href = apiUrl(`${API}/export?${p}`);
    };

    const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') go({ page: 1 }); };

    // The list response carries everything except the execution a projection
    // led to; that is fetched only when a row is opened, so the table costs one
    // query however many trades are on screen.
    async function loadExecution(row: any) {
        if (!row || !row.execution_id) return;
        const id: string = row.id;
        if (executionsRequested.current.has(id)) return;
        executionsRequested.current.add(id);
        try {
            const { ok, data } = await fetchJSON(`${API}/${id}`);
            if (!ok || !data.execution) return;
            setExecutions(prev => ({ ...prev, [id]: { state: 'ok', data: data.execution } }));
        } catch (err) {
            setExecutions(prev => ({ ...prev, [id]: { state: 'error', error: err instanceof Error ? err.message : String(err) } }));
        }
    }

    const toggle = (r: any) => {
        const opening = !expanded.has(r.id);
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(r.id)) next.delete(r.id);
            else next.add(r.id);
            return next;
        });
        if (opening) loadExecution(r);
    };

    const rows: any[] = data?.projections || [];

    return (
        <>
            <section className="panel">
                <div className="panel-header">
                    <h2>{t('opps.summary.title')}</h2>
                    <span className="panel-hint">{t('opps.summary.hint')}</span>
                </div>
                <div>
                    {data ? <Summary s={data.summary || {}} /> : <div className="skeleton">{t('opps.summary.loading')}</div>}
                </div>
                <Html as="div" className="summary-caption" k="opps.summary.caption" />
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('opps.panel.title')}</span> <span className="count">{data ? data.total || 0 : 0}</span></h2>
                    <span className="panel-hint">{t('opps.panel.hint')}</span>
                </div>

                <div className="filters">
                    <div className="filter-field">
                        <label htmlFor="fFrom">{t('opps.filter.from')}</label>
                        <input type="date" id="fFrom" value={filters.from} onChange={e => setFilter('from', e.target.value)} onKeyDown={onEnter} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fTo">{t('opps.filter.to')}</label>
                        <input type="date" id="fTo" value={filters.to} onChange={e => setFilter('to', e.target.value)} onKeyDown={onEnter} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fBuy">{t('opps.filter.buyVenue')}</label>
                        <select id="fBuy" value={filters.buy} onChange={e => setFilter('buy', e.target.value)} onKeyDown={onEnter}>
                            <option value="">{t('common.all')}</option>
                            {providers.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fSell">{t('opps.filter.sellVenue')}</label>
                        <select id="fSell" value={filters.sell} onChange={e => setFilter('sell', e.target.value)} onKeyDown={onEnter}>
                            <option value="">{t('common.all')}</option>
                            {providers.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fOutcome">{t('opps.filter.outcome')}</label>
                        <select id="fOutcome" value={filters.outcome} onChange={e => setFilter('outcome', e.target.value)} onKeyDown={onEnter}>
                            <option value="">{t('common.all')}</option>
                            <option value="executed">{t('opps.outcome.executed')}</option>
                            <option value="skipped_below_min_trade">{t('opps.outcome.belowMinTrade')}</option>
                            <option value="skipped_order_circuit">{t('opps.outcome.orderCircuit')}</option>
                            <option value="skipped_quantity_too_small">{t('opps.outcome.quantityTooSmall')}</option>
                            <option value="refused_implausible">{t('opps.outcome.implausible')}</option>
                            <option value="skipped_not_best">{t('opps.outcome.notBest')}</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fLimitedBy">{t('opps.filter.limitedBy')}</label>
                        <select id="fLimitedBy" value={filters.limitedBy} onChange={e => setFilter('limitedBy', e.target.value)} onKeyDown={onEnter}>
                            <option value="">{t('common.all')}</option>
                            <option value="depth">{t('opps.limitOption.depth')}</option>
                            <option value="buy_balance">{t('opps.limitOption.buyBalance')}</option>
                            <option value="sell_balance">{t('opps.limitOption.sellBalance')}</option>
                            <option value="config">{t('opps.limitOption.config')}</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fMinProfit">{t('opps.filter.minProfit')}</label>
                        <input type="number" id="fMinProfit" placeholder={t('opps.filter.minProfitPlaceholder')} step="any"
                               value={filters.minProfit} onChange={e => setFilter('minProfit', e.target.value)} onKeyDown={onEnter} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fMaxProfit">{t('opps.filter.maxProfit')}</label>
                        <input type="number" id="fMaxProfit" placeholder={t('opps.filter.maxProfitPlaceholder')} step="any"
                               value={filters.maxProfit} onChange={e => setFilter('maxProfit', e.target.value)} onKeyDown={onEnter} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fMinPct">{t('opps.filter.minPct')}</label>
                        <input type="number" id="fMinPct" placeholder={t('opps.filter.minPctPlaceholder')} step="any"
                               value={filters.minPct} onChange={e => setFilter('minPct', e.target.value)} onKeyDown={onEnter} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fPlaceable">{t('opps.filter.placeable')}</label>
                        <select id="fPlaceable" value={filters.placeable} onChange={e => setFilter('placeable', e.target.value)} onKeyDown={onEnter}>
                            <option value="">{t('common.all')}</option>
                            <option value="true">{t('opps.filter.placeableOnly')}</option>
                            <option value="false">{t('opps.filter.belowMinimum')}</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fSimulated">{t('opps.filter.mode')}</label>
                        <select id="fSimulated" value={filters.simulated} onChange={e => setFilter('simulated', e.target.value)} onKeyDown={onEnter}>
                            <option value="">{t('common.all')}</option>
                            <option value="false">{t('opps.filter.realTrading')}</option>
                            <option value="true">{t('opps.filter.simulation')}</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="fPageSize">{t('common.pageSize')}</label>
                        <select id="fPageSize" value={filters.pageSize} onChange={e => setFilter('pageSize', e.target.value)} onKeyDown={onEnter}>
                            <option value="10">10</option>
                            <option value="25">25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                    </div>
                    <button className="btn primary" onClick={() => go({ page: 1 })}>{t('common.apply')}</button>
                    <button className="btn" onClick={reset}>{t('common.reset')}</button>
                    <button className="btn" onClick={refresh} title={t('common.refreshNow')}>{t('common.refresh')}</button>
                    <button className="btn" onClick={exportCsv} title={t('opps.exportHint')}>{t('opps.export')}</button>
                </div>

                <div>
                    {!data ? (
                        <div className="skeleton">{t('opps.loading')}</div>
                    ) : rows.length === 0 ? (
                        <div className="empty-state"><span className="big">🧮</span>{t('opps.empty')}</div>
                    ) : (
                        <div className="table-scroll">
                            <table className="data-table log-table">
                                <thead>
                                    <tr>
                                        {COLUMNS.map((col, i) => {
                                            if (!col.key) {
                                                if (!col.label) return <th key={i} />;
                                                return <th key={i} title={col.hint ? t(col.hint) : undefined}>{t(col.label)}</th>;
                                            }
                                            const key = col.key;
                                            const active = view.sort === key;
                                            return (
                                                <th key={i} className="sortable" onClick={() => onSort(key)}>
                                                    {t(col.label || '')}
                                                    {active && <span className="sort-caret">{view.dir === 'asc' ? '▲' : '▼'}</span>}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => {
                                        const open = expanded.has(r.id);
                                        return (
                                            <Fragment key={r.id}>
                                                <ProjectionRow r={r} open={open} onToggle={() => toggle(r)} />
                                                <tr className={`detail-row${open ? '' : ' hidden'}`}>
                                                    <td colSpan={COLUMNS.length}>
                                                        <div className="detail-wrap"><Detail r={r} execution={executions[r.id]} /></div>
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {data && <Pagination data={data} onPage={page => go({ page })} />}
            </section>

            <footer className="page-footer">{t('opps.footer')}</footer>
        </>
    );
}

function Summary({ s }: { s: any }) {
    const { t, format } = useI18n();
    const span = (s.first_detected_at && s.last_detected_at)
        ? `${format.date(s.first_detected_at)} → ${format.date(s.last_detected_at)}`
        : t('opps.summary.noDetections');

    // Two strips, deliberately in this order. The first is sized from the
    // order book alone - 70% of min(top ask size, top bid size) - which is
    // what the venues were actually offering. The second is sized from what
    // this bot could have taken, which the 2 USDT TradeAmountUSDT cap and
    // the wallet balances hold far below that, so reading it as "the
    // opportunity" understates the book by whatever the caps removed.
    const rows = s.best_price_rows || 0;
    const unsized = (s.count || 0) - rows;
    // The fraction actually applied, recovered from the totals rather than
    // hardcoded, so it stays right if OPPORTUNITY_PROJECTION_FRACTION is
    // changed (it is stored per row, not on the summary).
    const fractionValue = (s.best_price_matched_qty > 0)
        ? Math.round(s.best_price_qty / s.best_price_matched_qty * 100)
        : 70;
    const fraction = format.number(fractionValue);
    const notVerifiable = rows > (s.best_price_placeable_count || 0)
        ? ' · ' + t('opps.summary.notVerifiable', { count: qty(rows - (s.best_price_placeable_count || 0), 0) })
        : '';
    const usdt = <span className="fee-text">USDT</span>;

    return (
        <>
            <div className="stat-group-label">{t('opps.summary.bookGroup', { fraction })}</div>
            <div className="stats">
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.opportunities')}</div>
                    <div className="stat-value">{qty(s.count, 0)}</div>
                    <div className="stat-sub">{span}{unsized > 0 ? ` · ${t('opps.summary.unsized', { count: qty(unsized, 0) })}` : ''}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.netAtBest')}</div>
                    <div className={`stat-value ${(s.best_price_net || 0) >= 0 ? 'green' : 'red'}`}>{toman(s.best_price_net)}</div>
                    <div className="stat-sub">{t('opps.summary.netAtBestSub')}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.avgPer')}</div>
                    <div className="stat-value">{toman(s.best_price_avg_net)}</div>
                    <div className="stat-sub">{t('opps.summary.avgPerSub', { value: toman(s.best_price_max_net) })}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.avgMargin')}</div>
                    <div className="stat-value accent">{pct(s.best_price_avg_net_pct, 4)}</div>
                    <div className="stat-sub">{t('opps.summary.avgMarginSub', { value: pct(s.best_price_max_net_pct, 4) })}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.avgSize')}</div>
                    <div className="stat-value">{qty(s.best_price_avg_qty)} {usdt}</div>
                    <div className="stat-sub">{t('opps.summary.avgSizeSub', { fraction, value: qty(s.best_price_avg_matched_qty) })}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.volume')}</div>
                    <div className="stat-value">{qty(s.best_price_qty)} {usdt}</div>
                    <div className="stat-sub">{t('opps.summary.volumeSub', { value: qty(s.best_price_matched_qty) })}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.fees')}</div>
                    <div className="stat-value amber">{toman(s.best_price_fees)}</div>
                    <div className="stat-sub">{t('opps.summary.feesSub')}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.capital')}</div>
                    <div className="stat-value">{toman(s.best_price_deployed)}</div>
                    <div className="stat-sub">{t('opps.summary.capitalSub')}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.placeable')}</div>
                    <div className="stat-value">{qty(s.best_price_placeable_count, 0)}</div>
                    <div className="stat-sub">{t('opps.summary.placeableSub')}{notVerifiable}</div>
                </div>
            </div>
            <div className="stat-group-label">{t('opps.summary.cappedGroup')}</div>
            <div className="stats">
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.totalNet')}</div>
                    <div className={`stat-value ${(s.total_net_profit || 0) >= 0 ? 'green' : 'red'}`}>{toman(s.total_net_profit)}</div>
                    <div className="stat-sub">{t('opps.summary.totalNetSub')}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.avgProjected')}</div>
                    <div className="stat-value">{qty(s.avg_projected_qty)} {usdt}</div>
                    <div className="stat-sub">{t('opps.summary.avgProjectedSub', { fraction, value: qty(s.avg_max_amount) })}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.costs')}</div>
                    <div className="stat-value amber">{toman((s.total_fees || 0) + (s.total_slippage || 0))}</div>
                    <div className="stat-sub">{t('opps.summary.costsSub', { fees: toman(s.total_fees), slippage: toman(s.total_slippage) })}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.placeable')}</div>
                    <div className="stat-value">{qty(s.placeable_count, 0)}</div>
                    <div className="stat-sub">{t('opps.summary.placeableProjectedSub')}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('opps.summary.traded')}</div>
                    <div className="stat-value">{qty(s.total_traded_qty)} {usdt}</div>
                    <div className="stat-sub">{t('opps.summary.tradedSub', { executed: qty(s.executed_count, 0), count: qty(s.count, 0), projected: qty(s.total_projected_qty) })}</div>
                </div>
            </div>
        </>
    );
}

function ProjectionRow({ r, open, onToggle }: { r: any; open: boolean; onToggle: () => void }) {
    const { t, format } = useI18n();
    const outcome = outcomeOf(r.outcome);
    const bp = bestPriceOf(r);
    const place = placeabilityOf(bp.placeable);
    return (
        <tr className={`log-row${open ? ' expanded' : ''}`} onClick={onToggle}>
            <td><span className="expand-arrow">▶</span></td>
            <td className="audit-time" title={format.dateTime(r.detected_at)}>{shortTime(r.detected_at)}</td>
            <td className="route-cell">
                <span className="provider-tag">{r.buy_provider}</span><span className="arrow">→</span><span className="provider-tag">{r.sell_provider}</span>
            </td>
            <td>{qty(r.max_amount)} <span className="fee-text" title={t('opps.row.limitedBy', { limit: limitLabel(r.limited_by) })}>{limitShort(r.limited_by)}</span></td>
            <td>{qty(r.projected_amount)}{!r.placeable && <> <span className="fee-text" title={t('opps.row.belowMinimum')}>⚠</span></>}</td>
            <td className={signClass(r.net_profit)}>{toman(r.net_profit)}</td>
            <td className={signClass(r.net_profit_pct)}>{pct(r.net_profit_pct)}</td>
            {bp.known ? (
                <>
                    <td>{qty(bp.amount)} <span className="fee-text" title={t('opps.row.matchedHint', { matched: qty(bp.matched_qty, 4), hint: place.hint })}>{t('opps.row.ofMatched', { matched: qty(bp.matched_qty), placeable: place.label })}</span></td>
                    <td className={signClass(bp.net)}>{toman(bp.net)} <span className="fee-text">{pct(bp.net_pct, 3)}</span></td>
                </>
            ) : (
                <td colSpan={2} className="audit-missing" title={t('opps.row.depthNotPublishedHint')}>{t('opps.row.depthNotPublished')}</td>
            )}
            <td><span className={`status-badge ${outcome.badge}`}>{outcome.label}</span>{r.simulated ? <> <span className="fee-text">{t('common.sim')}</span></> : null}</td>
        </tr>
    );
}

function BookTable({ levels, emptyKey }: { levels: any; emptyKey: string }) {
    const { t } = useI18n();
    if (!levels || !levels.length) return <div className="audit-missing">{t(emptyKey)}</div>;
    return (
        <div className="book-side">
            {(levels as [number, number][]).slice(0, 10).map(([price, size], i) => (
                <Fragment key={i}>
                    <div>{toman(price)}</div>
                    <div>{size > 0 ? qty(size, 4) : t('opps.detail.sizeNotPublished')}</div>
                </Fragment>
            ))}
        </div>
    );
}

function ExecutionSlot({ execution }: { execution: Execution | undefined }) {
    const { t } = useI18n();
    if (!execution) return <div className="skeleton">{t('opps.detail.loadingExecution')}</div>;
    if (execution.state === 'error') {
        return <div className="error-line">{t('opps.detail.executionFailed', { error: execution.error })}</div>;
    }
    const e = execution.data;
    return (
        <table className="breakdown">
            <tbody>
                <tr><td>{t('opps.detail.tradedSize')}</td><td>{t('opps.detail.tradedSizeValue', { bought: qty(e.amount, 8), sold: qty(e.sell_amount, 8) })}</td></tr>
                <tr><td>{t('opps.detail.prices')}</td><td>{toman(e.buy_price)} → {toman(e.sell_price)}</td></tr>
                <tr><td>{t('opps.detail.expectedProfit')}</td><td className={signClass(e.expected_profit)}>{t('opps.detail.netWithPct', { value: toman(e.expected_profit), pct: pct(e.expected_profit_pct, 3) })}</td></tr>
                <tr><td>{t('common.status')}</td><td>{t('opps.detail.statusValue', { status: e.status, buy: e.buy_status, sell: e.sell_status })}</td></tr>
                <tr><td>{t('opps.detail.execution')}</td><td>{e.id}</td></tr>
            </tbody>
        </table>
    );
}

function Detail({ r, execution }: { r: any; execution: Execution | undefined }) {
    const { t, format } = useI18n();
    const book = r.book || {};
    const fees = (r.buy_fee || 0) + (r.sell_fee || 0);
    const bp = bestPriceOf(r);
    const place = placeabilityOf(bp.placeable);
    const outcome = outcomeOf(r.outcome);
    const fractionPct = format.number(Math.round((r.projected_fraction || 0.70) * 100));
    const projectedPct = format.number(Math.round((r.projected_fraction || 0) * 100));

    // The best prices on their own: no depth walked, so no slippage. This
    // is the size that can be taken with neither leg leaving its best
    // price, which is a different - and smaller - order than the deep-book
    // projection beside it.
    const bestPrice = bp.known ? (
        <table className="breakdown">
            <tbody>
                <tr><td>{t('opps.detail.resting')}</td><td>{qty(r.top_ask_size, 4)} / {qty(r.top_bid_size, 4)} USDT</td></tr>
                <tr><td>{t('opps.detail.matched')}</td><td>{qty(bp.matched_qty, 6)} USDT</td></tr>
                <tr className="total"><td>{t('opps.detail.orderAt', { fraction: fractionPct })}</td><td>{qty(bp.amount, 8)} USDT</td></tr>
                <tr><td>{t('opps.detail.filledAt')}</td><td>{toman(r.top_ask)} → {toman(r.top_bid)} <span className="fee-text">{t('opps.detail.noSlippage')}</span></td></tr>
                <tr><td>{t('opps.detail.gross')}</td><td className={signClass(bp.gross)}>{toman(bp.gross)}</td></tr>
                <tr><td>{t('opps.detail.buyFee', { provider: r.buy_provider })}</td><td className="neg">−{toman(bp.buy_fee)}</td></tr>
                <tr><td>{t('opps.detail.sellFee', { provider: r.sell_provider })}</td><td className="neg">−{toman(bp.sell_fee)}</td></tr>
                <tr className="total"><td>{t('opps.detail.netAtBest')}</td><td className={signClass(bp.net)}>{t('opps.detail.netWithPct', { value: toman(bp.net), pct: pct(bp.net_pct, 4) })}</td></tr>
                <tr><td>{t('opps.detail.capital')}</td><td>{t('opps.detail.tomanValue', { value: toman(bp.deployed) })}</td></tr>
                <tr><td>{t('opps.detail.clearsMinimums')}</td><td><span className={`status-badge ${place.badge}`} title={place.hint}>{place.label}</span></td></tr>
                <tr><td>{t('opps.detail.vsDeepBook')}</td><td>{t('opps.detail.vsDeepBookValue', { qty: qty(r.projected_amount, 4), net: toman(r.net_profit) })}</td></tr>
            </tbody>
        </table>
    ) : (
        <div className="audit-missing">{t('opps.detail.bestPriceUnknown', { buy: r.buy_provider, sell: r.sell_provider })}</div>
    );

    return (
        <div className="detail-grid">
            <div>
                <div className="detail-col-label">{t('opps.detail.bestPriceLabel', { fraction: fractionPct })}</div>
                {bestPrice}
            </div>
            <div>
                <div className="detail-col-label">{t('opps.detail.sizingLabel')}</div>
                <table className="breakdown">
                    <tbody>
                        <tr><td>{t('opps.detail.depthClearing')}</td><td className={r.depth_known ? '' : 'muted'}>{qty(r.depth_max_amount, 4)} USDT{r.depth_known ? '' : t('opps.detail.depthUnknown')}</td></tr>
                        <tr><td>{t('opps.detail.buyAffords')}</td><td>{cap(r.buy_balance_max_amount)}</td></tr>
                        <tr><td>{t('opps.detail.sellAffords')}</td><td>{cap(r.sell_balance_max_amount)}</td></tr>
                        <tr><td>{t('opps.detail.configuredSize')}</td><td>{qty(r.config_max_amount, 4)} USDT</td></tr>
                        <tr className="total"><td>{t('opps.detail.maximum', { limit: limitLabel(r.limited_by) })}</td><td>{qty(r.max_amount, 6)} USDT</td></tr>
                        <tr><td>{t('opps.detail.projectedOrder', { fraction: projectedPct })}</td><td>{qty(r.projected_amount, 8)} USDT</td></tr>
                        <tr><td>{t('opps.detail.sellLeg')}</td><td>{qty(r.projected_sell_amount, 8)} USDT</td></tr>
                        <tr><td>{t('opps.detail.retained')}</td><td className="pos">{qty(r.retained_usdt, 8)} USDT</td></tr>
                    </tbody>
                </table>
            </div>
            <div>
                <div className="detail-col-label">{t('opps.detail.pricingLabel')}</div>
                <table className="breakdown">
                    <tbody>
                        <tr><td>{t('opps.detail.topOfBook')}</td><td>{toman(r.top_ask)} / {toman(r.top_bid)}</td></tr>
                        <tr><td>{t('opps.detail.restingThere')}</td><td>{r.top_ask_size > 0 ? qty(r.top_ask_size, 4) : t('opps.detail.notPublished')} / {r.top_bid_size > 0 ? qty(r.top_bid_size, 4) : t('opps.detail.notPublished')} USDT</td></tr>
                        <tr><td>{t('opps.detail.scoredAt')}</td><td>{toman(r.scored_buy_price)} → {toman(r.scored_sell_price)} ({pct(r.scored_profit_pct)})</td></tr>
                        <tr className="total"><td>{t('opps.detail.fillingCosts')}</td><td>{toman(r.projected_buy_price)} → {toman(r.projected_sell_price)}</td></tr>
                        <tr><td>{t('opps.detail.rawSpread')}</td><td>{t('opps.detail.rawSpreadValue', { value: toman(r.raw_spread), pct: pct(r.raw_spread_pct) })}</td></tr>
                        <tr><td>{t('common.fees')}</td><td>{t('opps.detail.feesValue', {
                            buy: format.decimal(r.buy_fee_pct || 0, 2),
                            sell: format.decimal(r.sell_fee_pct || 0, 2),
                            total: format.decimal(r.total_fee_pct || 0, 4),
                        })}</td></tr>
                    </tbody>
                </table>
            </div>
            <div>
                <div className="detail-col-label">{t('opps.detail.moneyLabel')}</div>
                <table className="breakdown">
                    <tbody>
                        <tr><td>{t('opps.detail.grossFormula', { qty: qty(r.projected_amount, 4), delta: toman((r.projected_sell_price || 0) - (r.projected_buy_price || 0)) })}</td><td className={signClass(r.gross_profit)}>{toman(r.gross_profit)}</td></tr>
                        <tr><td>{t('opps.detail.buyFee', { provider: r.buy_provider })}</td><td className="neg">−{toman(r.buy_fee)}</td></tr>
                        <tr><td>{t('opps.detail.sellFee', { provider: r.sell_provider })}</td><td className="neg">−{toman(r.sell_fee)}</td></tr>
                        <tr className="total"><td>{t('opps.detail.netProfit')}</td><td className={signClass(r.net_profit)}>{t('opps.detail.netWithPct', { value: toman(r.net_profit), pct: pct(r.net_profit_pct) })}</td></tr>
                        <tr><td>{t('opps.detail.capital')}</td><td>{t('opps.detail.tomanValue', { value: toman(r.deployed) })}</td></tr>
                        <tr><td>{t('opps.detail.slippage')}</td><td className={(r.slippage_cost || 0) > 0 ? 'neg' : 'muted'}>{t('opps.detail.tomanValue', { value: toman(r.slippage_cost) })}</td></tr>
                        <tr><td>{t('opps.detail.totalCost')}</td><td>{t('opps.detail.tomanValue', { value: toman(fees + (r.slippage_cost || 0)) })}</td></tr>
                    </tbody>
                </table>
            </div>
            <div>
                <div className="detail-col-label">{t('opps.detail.outcomeLabel')}</div>
                <table className="breakdown">
                    <tbody>
                        <tr><td>{t('common.outcome')}</td><td>{outcome.long}</td></tr>
                        {r.outcome_detail ? <tr><td>{t('opps.detail.reason')}</td><td>{r.outcome_detail}</td></tr> : null}
                        <tr><td>{t('opps.detail.actuallyTraded')}</td><td>{r.traded_amount > 0 ? qty(r.traded_amount, 8) + ' USDT' : t('opps.detail.nothing')}</td></tr>
                        <tr><td>{t('opps.detail.mode')}</td><td>{t(r.simulated ? 'opps.detail.simulation' : 'opps.detail.realTrading')}</td></tr>
                        <tr><td>{t('opps.detail.projectionId')}</td><td>{r.id}</td></tr>
                    </tbody>
                </table>
                {r.execution_id ? (
                    <>
                        <div className="detail-col-label" style={{ marginTop: 14 }}>{t('opps.detail.executionProduced')}</div>
                        <div><ExecutionSlot execution={execution} /></div>
                    </>
                ) : null}
            </div>
            <div>
                <div className="detail-col-label">{t('opps.detail.asksLabel', { provider: r.buy_provider })}</div>
                <BookTable levels={book.asks} emptyKey="opps.detail.noAsks" />
            </div>
            <div>
                <div className="detail-col-label">{t('opps.detail.bidsLabel', { provider: r.sell_provider })}</div>
                <BookTable levels={book.bids} emptyKey="opps.detail.noBids" />
            </div>
            {r.notes ? <div className="detail-meta"><div className="note-line">⚠️ {r.notes}</div></div> : null}
        </div>
    );
}

