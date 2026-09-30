import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import Html from '../components/Html';
import { usePageStatus } from '../components/Layout';
import { format, t, useI18n } from '../i18n';
import { fetchJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import './MissedOpportunities.css';
import Pagination from '../components/Pagination';
import Template from '../components/Template';

const API = '/missed-opportunities';

const missing = (n: unknown) => n === null || n === undefined || Number.isNaN(Number(n));
const toman = (n: any) => missing(n) ? '—' : format.number(n, { maximumFractionDigits: 0 });
const qty = (n: any, d = 4) => missing(n) ? '—' : format.number(n, { maximumFractionDigits: d });
const pct = (n: any, d = 3) => missing(n) ? '—' : (n >= 0 ? '+' : '') + format.percent(n, d);
const signClass = (n: any) => (n || 0) >= 0 ? 'profit-positive' : 'profit-negative';

// A buy leg is held in Toman and a sell leg in the pair's base coin; one
// formatter for both would print Toman to eight decimals or BTC to none.
const TOMAN_ASSETS = new Set(['IRT', 'TMN', 'IRR']);
function amountOf(n: any, asset: any): ReactNode {
    if (missing(n)) return '—';
    return <>{TOMAN_ASSETS.has(String(asset).toUpperCase()) ? toman(n) : qty(n, 6)} <span className="fee-text">{asset}</span></>;
}

const shortTime = (iso: string) => format.dateTime(iso, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

// What stopped the trade, for a badge. Refusal outcomes reuse the
// projections page's short labels so the two pages name them the same.
const ERROR_KINDS: Record<string, string> = {
    execution_failed: 'missed.error.executionFailed',
    skipped_below_min_trade: 'opps.outcomeShort.belowMinTrade',
    skipped_order_circuit: 'opps.outcomeShort.orderCircuit',
    skipped_quantity_too_small: 'opps.outcomeShort.quantityTooSmall',
    refused_implausible: 'opps.outcomeShort.implausible',
};
const errorLabel = (kind: string) => ERROR_KINDS[kind] ? t(ERROR_KINDS[kind]) : kind;

// From defaults to a week back: the page judges every matching row in
// memory, and all of history is rarely the question.
const weekAgo = () => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const COLUMNS: { key: string | null; label: string; hint?: string }[] = [
    { key: 'detected_at', label: 'opps.col.detected' },
    { key: null, label: 'missed.list.col.pair' },
    { key: null, label: 'common.route' },
    { key: 'target_qty', label: 'missed.list.col.target', hint: 'missed.list.col.targetHint' },
    { key: 'gross', label: 'missed.list.col.gross', hint: 'missed.list.col.grossHint' },
    { key: 'net', label: 'missed.list.col.net' },
    { key: null, label: 'missed.list.col.buyWallet', hint: 'missed.list.col.buyWalletHint' },
    { key: null, label: 'missed.list.col.sellWallet', hint: 'missed.list.col.sellWalletHint' },
    { key: null, label: 'missed.list.col.reason' },
];

interface Filters {
    from: string;
    to: string;
    symbol: string;
    buy: string;
    sell: string;
    reason: string;
    simulated: string;
    fraction: string;
    profitable: string;
    coverage: string;
    pageSize: string;
}

const defaultFilters = (): Filters => ({
    from: weekAgo(), to: '', symbol: '', buy: '', sell: '', reason: '', simulated: '',
    fraction: '70', profitable: '', coverage: '90', pageSize: '25',
});

interface View { page: number; sort: string; dir: 'asc' | 'desc' }
const DEFAULT_VIEW: View = { page: 1, sort: 'detected_at', dir: 'desc' };

/** Appends the values not yet listed, keeping the existing order. */
const appendNew = (prev: string[], values: string[]) => {
    const have = new Set(prev);
    const add = values.filter(v => v && !have.has(v));
    return add.length ? [...prev, ...add] : prev;
};

export default function MissedOpportunities() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();

    const [filters, setFiltersState] = useState<Filters>(defaultFilters);
    const filtersRef = useRef(filters);
    const [view, setViewState] = useState<View>(DEFAULT_VIEW);
    const viewRef = useRef(view);
    const [data, setData] = useState<any>(null);
    const [symbols, setSymbols] = useState<string[]>([]);
    const [providers, setProviders] = useState<string[]>([]);
    const knownProviders = useRef(new Set<string>());

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
        put('symbol', f.symbol);
        put('buy_provider', f.buy);
        put('sell_provider', f.sell);
        put('reason', f.reason);
        put('fraction', f.fraction);
        put('profitable', f.profitable);
        put('simulated', f.simulated);
        put('coverage', f.coverage);
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
            setSymbols(prev => appendNew(prev, data.symbols || []));
            (data.rows || []).forEach((r: any) => { knownProviders.current.add(r.buy_provider); knownProviders.current.add(r.sell_provider); });
            (data.topups || []).forEach((g: any) => knownProviders.current.add(g.venue));
            const known = Array.from(knownProviders.current).sort();
            setProviders(prev => appendNew(prev, known));
            setData(data);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (err) {
            console.error('missed:', err);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('missed.loadError', { error: err instanceof Error ? err.message : String(err) }));
        }
    }

    const refresh = usePolling(load, 60000, [locale]);

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
        setFilters(defaultFilters());
        viewRef.current = DEFAULT_VIEW;
        setViewState(DEFAULT_VIEW);
        refresh();
    };

    // Selects apply on change: the page is mostly read by flipping pair and reason.
    const onSelect = (key: keyof Filters, value: string) => {
        setFilter(key, value);
        go({ page: 1 });
    };
    const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') go({ page: 1 }); };

    // Clicking a pair filters the whole page to it; clicking it again clears.
    const onPair = (symbol: string) => onSelect('symbol', filtersRef.current.symbol === symbol ? '' : symbol);

    const selectField = (id: string, key: keyof Filters, label: string, options: ReactNode, title?: string) => (
        <div className="filter-field">
            <label htmlFor={id} title={title}>{t(label)}</label>
            <select id={id} value={filters[key]} onChange={e => onSelect(key, e.target.value)}>{options}</select>
        </div>
    );

    const allOption = <option value="">{t('common.all')}</option>;

    return (
        <>
            <section className="panel">
                <div className="panel-header">
                    <h2>{t('missed.filters.title')}</h2>
                    <span className="panel-hint">{t('missed.filters.hint')}</span>
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
                    {selectField('fSymbol', 'symbol', 'missed.filter.pair', <>
                        {allOption}
                        {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                    </>)}
                    {selectField('fBuy', 'buy', 'opps.filter.buyVenue', <>
                        {allOption}
                        {providers.map(p => <option key={p} value={p}>{p}</option>)}
                    </>)}
                    {selectField('fSell', 'sell', 'opps.filter.sellVenue', <>
                        {allOption}
                        {providers.map(p => <option key={p} value={p}>{p}</option>)}
                    </>)}
                    {selectField('fReason', 'reason', 'missed.filter.reason', <>
                        {allOption}
                        <option value="balance">{t('missed.reason.balance')}</option>
                        <option value="buy_balance">{t('missed.reason.buyBalance')}</option>
                        <option value="sell_balance">{t('missed.reason.sellBalance')}</option>
                        <option value="error">{t('missed.reason.error')}</option>
                    </>)}
                    {selectField('fSimulated', 'simulated', 'opps.filter.mode', <>
                        {allOption}
                        <option value="false">{t('opps.filter.realTrading')}</option>
                        <option value="true">{t('opps.filter.simulation')}</option>
                    </>)}
                    {selectField('fFraction', 'fraction', 'missed.filter.fraction', <>
                        {['10', '25', '50', '70', '90', '100'].map(v => <option key={v} value={v}>{v}%</option>)}
                    </>, t('missed.filter.fractionHint'))}
                    {selectField('fProfitable', 'profitable', 'missed.filter.profit', <>
                        {allOption}
                        <option value="true">{t('missed.filter.profitableOnly')}</option>
                    </>)}
                    {selectField('fCoverage', 'coverage', 'missed.filter.coverage', <>
                        {['50', '75', '90', '100'].map(v => <option key={v} value={v}>{v}%</option>)}
                    </>, t('missed.filter.coverageHint'))}
                    {selectField('fPageSize', 'pageSize', 'common.pageSize', <>
                        {['25', '50', '100'].map(v => <option key={v} value={v}>{v}</option>)}
                    </>)}
                    <button className="btn primary" onClick={() => go({ page: 1 })}>{t('common.apply')}</button>
                    <button className="btn" onClick={reset}>{t('common.reset')}</button>
                    <button className="btn" onClick={refresh} title={t('common.refreshNow')}>{t('common.refresh')}</button>
                </div>
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2>{t('missed.summary.title')}</h2>
                    <span className="panel-hint">{t('missed.summary.hint')}</span>
                </div>
                <div>
                    {data ? <Summary data={data} /> : <div className="skeleton">{t('missed.loading')}</div>}
                </div>
                <Html as="div" className="summary-caption" k="missed.summary.caption" />
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2>{t('missed.topup.title')}</h2>
                    <span className="panel-hint">{t('missed.topup.hint')}</span>
                </div>
                <div>
                    {data ? <Topups data={data} /> : <div className="skeleton">{t('missed.loading')}</div>}
                </div>
                <div className="summary-caption">
                    {data ? t('missed.topup.caption', { coverage: format.number(data.coverage || 90) })
                        + (data.live_balances ? '' : ' ' + t('missed.topup.noLive'))
                        + (data.live_credit ? '' : ' ' + t('missed.topup.noCredit')) : ''}
                </div>
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2>{t('missed.pairs.title')}</h2>
                    <span className="panel-hint">{t('missed.pairs.hint')}</span>
                </div>
                <div>
                    {data ? <Pairs pairs={data.pairs || []} selected={filters.symbol} onPair={onPair} /> : <div className="skeleton">{t('missed.loading')}</div>}
                </div>
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('missed.list.title')}</span> <span className="count">{data ? format.number(data.total || 0) : 0}</span></h2>
                    <span className="panel-hint">{t('missed.list.hint')}</span>
                </div>
                <div>
                    {data ? <Rows rows={data.rows || []} view={view} onSort={onSort} /> : <div className="skeleton">{t('missed.loading')}</div>}
                </div>
                {data && <Pagination data={data} onPage={page => go({ page })} />}
            </section>

            <footer className="page-footer">{t('missed.footer')}</footer>
        </>
    );
}

function StatCard({ label, value, unit = '', tone = '', sub = '' }: { label: string; value: string; unit?: string; tone?: string; sub?: string }) {
    return (
        <div className="stat">
            <div className="stat-label">{label}</div>
            <div className={`stat-value ${tone}`}>{value}{unit ? <span className="stat-unit">{unit}</span> : null}</div>
            <div className="stat-sub">{sub}</div>
        </div>
    );
}

// One side's wallets: how many opportunities they were short on, and what
// to add - from the top-up plan, so each wallet is counted once rather than
// once per opportunity.
function WalletCard({ side, shortCount, n = {} }: { side: 'buy' | 'sell'; shortCount: any; n?: any }) {
    const { t } = useI18n();
    const usdt = (v: any) => missing(v) ? '' : `≈ ${qty(v, 2)} USDT`;
    const needed = n.topup_all_toman > 0;
    const row = (label: string, value: ReactNode) => (
        <div className="wallet-row"><span>{label}</span><span className="wallet-row-value">{value}</span></div>
    );
    // A sell wallet holds the pair's coin, so the Toman total hides which coins.
    const coinList: any[] = side === 'sell' ? (n.assets || []).filter((a: any) => a.topup > 0) : [];
    const unpriced: string[] = n.unpriced || [];
    return (
        <div className="wallet-card">
            <div className="wallet-head">
                <div>
                    <div className="wallet-title">{t(`missed.wallet.${side}.title`)}</div>
                    <div className="wallet-hint">{t(`missed.wallet.${side}.hint`)}</div>
                </div>
                <span className={`status-badge ${shortCount > 0 ? 'failed' : 'completed'}`}>{t('missed.wallet.shortCount', { count: qty(shortCount, 0) })}</span>
            </div>
            <div className="wallet-label">{t('missed.wallet.topup')}</div>
            <div className={`wallet-amount ${n.topup_toman > 0 ? 'red' : ''}`}>{toman(n.topup_toman)}<span className="stat-unit">IRT</span></div>
            <div className={`wallet-usdt${needed ? '' : ' none'}`}>{needed ? usdt(n.topup_usdt) : t('missed.wallet.none')}</div>
            <div className="wallet-rows">
                {row(t('missed.wallet.wallets'), qty(n.short_wallets, 0))}
                {row(t('missed.wallet.all'), <>{toman(n.topup_all_toman)} IRT{n.topup_all_usdt ? <> <span className="fee-text">· {usdt(n.topup_all_usdt)}</span></> : null}</>)}
                {coinList.length > 0 && row(t('missed.wallet.coins'), (
                    <span className="wallet-coins">
                        {coinList.map((a, i) => <span key={i} className="chip">{a.asset} +{qty(a.topup, 6)}</span>)}
                    </span>
                ))}
            </div>
            {unpriced.length > 0 && <div className="wallet-note">{t('missed.wallet.unpriced', { assets: unpriced.join(', ') })}</div>}
        </div>
    );
}

function Summary({ data }: { data: any }) {
    const { t, format } = useI18n();
    const s = data.summary || {};
    const needs = data.wallet_needs || {};
    const span = (s.first_detected_at && s.last_detected_at)
        ? `${format.date(s.first_detected_at)} → ${format.date(s.last_detected_at)}`
        : t('missed.summary.none');
    const kinds = (data.errors_by_kind || []).slice(0, 2)
        .map((k: any) => `${errorLabel(k.kind)} ${qty(k.count, 0)}`).join(' · ');

    return (
        <>
            {data.truncated ? <div className="note-line">⚠️ {t('missed.summary.truncated')}</div> : null}
            <div className="stat-group-label">{t('missed.summary.groupOpps', { fraction: format.number(data.fraction || 70) })}</div>
            <div className="stats kpis">
                <StatCard label={t('missed.summary.count')} value={qty(s.count, 0)} sub={span} />
                <StatCard label={t('missed.summary.gross')} value={toman(s.missed_gross)} unit="IRT"
                          sub={t('missed.summary.grossSub', { capital: toman(s.missed_deployed) })} />
                <StatCard label={t('missed.summary.net')} value={toman(s.missed_net)} unit="IRT" tone="green"
                          sub={t('missed.summary.netSub', { fees: toman(s.missed_fees) })} />
                <StatCard label={t('missed.summary.errors')} value={qty(s.errors, 0)} tone="amber"
                          sub={kinds || t('missed.summary.errorsSub')} />
            </div>
            <div className="stat-group-label">{t('missed.summary.groupWallets', { coverage: format.number(data.coverage || 90) })}</div>
            <div className="wallet-grid">
                <WalletCard side="buy" shortCount={s.buy_short} n={needs.buy} />
                <WalletCard side="sell" shortCount={s.sell_short} n={needs.sell} />
            </div>
        </>
    );
}

// The answer to "how much should each wallet hold": per venue and asset,
// the balance that would have funded `coverage`% of the opportunities it
// was short on, and all of them, against what it holds now.
function Topups({ data }: { data: any }) {
    const { t, format } = useI18n();
    const cov = format.number(data.coverage || 90);
    const groups: any[] = data.topups || [];
    if (groups.length === 0) {
        return <div className="empty-state"><span className="big">✅</span>{t('missed.topup.empty')}</div>;
    }

    const creditNote = (g: any) => g.live_credit === 'unlimited'
        ? <div className="fee-text">{t('missed.topup.creditUnlimited')}</div>
        : g.live_credit > 0
            ? <div className="fee-text"><Template template={t('missed.topup.credit')} nodes={{ amount: amountOf(g.live_credit, g.asset) }} /></div>
            : null;

    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead><tr>
                    <th>{t('missed.topup.col.venue')}</th>
                    <th>{t('missed.topup.col.asset')}</th>
                    <th title={t('missed.topup.col.missedHint')}>{t('missed.topup.col.missed')}</th>
                    <th>{t('missed.topup.col.missedNet')}</th>
                    <th title={t('missed.topup.col.requiredHint', { coverage: cov })}>{t('missed.topup.col.required', { coverage: cov })}</th>
                    <th>{t('missed.topup.col.requiredAll')}</th>
                    <th title={t('missed.topup.col.lastSeenHint')}>{t('missed.topup.col.lastSeen')}</th>
                    <th title={t('missed.topup.col.liveHint')}>{t('missed.topup.col.live')}</th>
                    <th>{t('missed.topup.col.topup', { coverage: cov })}</th>
                    <th>{t('missed.topup.col.topupAll')}</th>
                </tr></thead>
                <tbody>
                    {groups.map((g, i) => {
                        const basisNote = g.topup_basis === 'live'
                            ? null
                            : <> <span className="fee-text" title={t('missed.topup.basisLastSeen')}>*</span></>;
                        return (
                            <tr key={i}>
                                <td><span className="provider-tag">{g.venue}</span></td>
                                <td>{g.asset} <span className="fee-text">{t(g.side === 'buy' ? 'missed.topup.buyLeg' : 'missed.topup.sellLeg')}</span></td>
                                <td>{qty(g.count, 0)}</td>
                                <td className="profit-positive">{toman(g.missed_net)}</td>
                                <td>{amountOf(g.required, g.asset)}<div className="fee-text">{t('missed.topup.covers', { covered: qty(g.covered_count, 0), count: qty(g.count, 0), net: toman(g.covered_net) })}</div></td>
                                <td>{amountOf(g.required_all, g.asset)}</td>
                                <td title={g.last_seen_at ? format.dateTime(g.last_seen_at) : ''}>{amountOf(g.last_seen_have, g.asset)}</td>
                                <td>{g.live_free === null || g.live_free === undefined ? <span className="fee-text">{t('common.unknown')}</span> : amountOf(g.live_free, g.asset)}{creditNote(g)}</td>
                                <td className={`topup-cell ${g.topup > 0 ? 'profit-negative' : 'profit-positive'}`}>{g.topup > 0 ? '+' : ''}{amountOf(g.topup, g.asset)}{basisNote}</td>
                                <td className={g.topup_all > 0 ? 'profit-negative' : 'profit-positive'}>{g.topup_all > 0 ? '+' : ''}{amountOf(g.topup_all, g.asset)}{basisNote}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function Pairs({ pairs, selected, onPair }: { pairs: any[]; selected: string; onPair: (symbol: string) => void }) {
    const { t } = useI18n();
    if (pairs.length === 0) return <div className="empty-state">{t('missed.empty')}</div>;
    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead><tr>
                    <th>{t('missed.pairs.col.pair')}</th>
                    <th>{t('missed.pairs.col.missed')}</th>
                    <th>{t('missed.pairs.col.balanceShort')}</th>
                    <th>{t('missed.pairs.col.errors')}</th>
                    <th>{t('missed.pairs.col.volume')}</th>
                    <th>{t('missed.pairs.col.gross')}</th>
                    <th>{t('missed.pairs.col.net')}</th>
                </tr></thead>
                <tbody>
                    {pairs.map(p => (
                        <tr key={p.symbol} className={`pair-row${p.symbol === selected ? ' active' : ''}`} onClick={() => onPair(p.symbol)}>
                            <td><strong>{p.symbol}</strong></td>
                            <td>{qty(p.count, 0)}</td>
                            <td>{qty(p.balance_short, 0)}</td>
                            <td>{qty(p.errors, 0)}</td>
                            <td>{qty(p.missed_qty, 4)} <span className="fee-text">{p.symbol.split('_')[0]}</span></td>
                            <td>{toman(p.missed_gross)}</td>
                            <td className="profit-positive">{toman(p.missed_net)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LegCell({ l }: { l: any }) {
    const { t } = useI18n();
    if (!l.known) return <span className="fee-text" title={t('missed.leg.unknownHint')}>{t('common.unknown')}</span>;
    if (!l.short) return <><span className="fee-text">{t('missed.leg.ok')}</span> {amountOf(l.have, l.asset)}</>;
    return (
        <>
            <div>{amountOf(l.have, l.asset)} / {amountOf(l.need, l.asset)}</div>
            <div className="profit-negative">{t('missed.leg.short', { venue: l.venue })} {amountOf(l.shortfall, l.asset)}</div>
        </>
    );
}

function ReasonCell({ r }: { r: any }) {
    const { t } = useI18n();
    const reasons: string[] = r.reasons || [];
    const badges: ReactNode[] = [];
    if (reasons.includes('buy_balance')) badges.push(<span key="buy" className="status-badge failed">{t('missed.reason.buyBalance')}</span>);
    if (reasons.includes('sell_balance')) badges.push(<span key="sell" className="status-badge failed">{t('missed.reason.sellBalance')}</span>);
    if (r.error) {
        badges.push(<span key="error" className={`status-badge ${r.error.kind === 'execution_failed' ? 'failed' : 'pending'}`}>{errorLabel(r.error.kind)}</span>);
    }
    // A wallet refusal carries the bot's own reason, like an error does.
    const text = r.error ? r.error.message : r.wallet_refusal ? r.outcome_detail : '';
    return (
        <>
            {badges.map((b, i) => <Fragment key={i}>{i > 0 && ' '}{b}</Fragment>)}
            {r.simulated ? <> <span className="fee-text">{t('common.sim')}</span></> : null}
            {text ? <div className="fee-text reason-line" title={text}>{text}</div> : null}
        </>
    );
}

function Rows({ rows, view, onSort }: { rows: any[]; view: View; onSort: (key: string) => void }) {
    const { t, format } = useI18n();
    if (rows.length === 0) {
        return <div className="empty-state"><span className="big">🎯</span>{t('missed.empty')}</div>;
    }
    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead><tr>
                    {COLUMNS.map((col, i) => {
                        const title = col.hint ? t(col.hint) : undefined;
                        if (!col.key) return <th key={i} title={title}>{t(col.label)}</th>;
                        const key = col.key;
                        const active = view.sort === key;
                        return (
                            <th key={i} className="sortable" title={title} onClick={() => onSort(key)}>
                                {t(col.label)}
                                {active && <span className="sort-caret">{view.dir === 'asc' ? '▲' : '▼'}</span>}
                            </th>
                        );
                    })}
                </tr></thead>
                <tbody>
                    {rows.map((r, i) => {
                        const base = r.symbol.split('_')[0];
                        return (
                            <tr key={r.id ?? i}>
                                <td className="audit-time" title={format.dateTime(r.detected_at)}>{shortTime(r.detected_at)}</td>
                                <td>{r.symbol}</td>
                                <td className="route-cell">
                                    <span className="provider-tag">{r.buy_provider}</span><span className="arrow">→</span><span className="provider-tag">{r.sell_provider}</span>
                                </td>
                                {r.known ? (
                                    <>
                                        <td title={t('missed.list.matchedHint', { matched: qty(r.matched_qty, 6) })}>{qty(r.target_qty, 6)} <span className="fee-text">{base}</span>
                                            <div className="fee-text">{t('missed.list.eachSide', { matched: qty(r.matched_qty, 6) })}</div></td>
                                        <td className={signClass(r.gross)}>{toman(r.gross)}</td>
                                        <td className={signClass(r.net)}>{toman(r.net)} <span className="fee-text">{pct(r.net_pct)}</span>
                                            <div className="fee-text">{t('missed.list.fees', { fees: toman(r.fees) })}</div></td>
                                    </>
                                ) : (
                                    <td colSpan={3} className="audit-missing" title={t('opps.row.depthNotPublishedHint')}>{t('opps.row.depthNotPublished')}</td>
                                )}
                                <td className="leg-cell"><LegCell l={r.buy} /></td>
                                <td className="leg-cell"><LegCell l={r.sell} /></td>
                                <td><ReasonCell r={r} /></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

