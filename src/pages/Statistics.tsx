// Statistics page: three views of the same slice of collected data.
//
// The slice is chosen once, in the toolbar, and every chart re-renders against
// it, so no two panels can be describing different windows.
import { useEffect, useMemo, useRef, useState } from 'react';

import { usePageStatus } from '../components/Layout';
import Html from '../components/Html';
import { useI18n } from '../i18n';
import { fetchJSON } from '../lib/api';
import {
    DataTable, EChart, Swatch, fmtClock, fmtDateTime, fmtInt, fmtPct, fmtPrice, fmtQty, fmtToman,
    useChartTokens, type ChartEmpty, type Column,
} from '../lib/charts';
import { providerColor, providerLabel, registerProviders } from '../lib/ui';
import {
    deltaMeasure, makeModel, rangeBounds,
    type DeltaMetric, type OppMetric, type OppShape, type PriceMode, type Range, type StatsData, type SweepPoint,
} from './Statistics/model';

// Projection rows are fetched a page at a time (the API caps a page at 200).
// This bounds how many the threshold sweep reads: enough for a smooth curve,
// and the exact shortfall is reported on screen rather than hidden, because a
// curve drawn from a truncated sample must say so.
const PROJECTION_PAGE_SIZE = 200;
const PROJECTION_MAX_PAGES = 8;

const RANGES: Range[] = ['1h', '6h', '24h', '7d', 'all'];
const DELTA_METRICS: DeltaMetric[] = ['cumulative', 'average', 'volume', 'capital'];

type View = 'chart' | 'table';

const EMPTY_DATA: StatsData = {
    loaded: false,
    history: null,
    projections: [],
    projectionTotal: 0,
    projectionTruncated: false,
};

// Per pair, because the limits are: the same venue takes 8 decimals of BTC
// and 0 of SHIB, and a minimum read off the wrong pair would mark real
// opportunities unplaceable (or unplaceable ones real).
async function fetchLimits(symbol: string, t: (k: string) => string) {
    const params = new URLSearchParams({ symbol });
    const { ok, data: res } = await fetchJSON('/order-limits?' + params);
    if (!ok) throw new Error(res.error || t('stats.limitsUnavailable'));
    return res;
}

async function fetchHistory(range: Range, symbol: string, t: (k: string) => string) {
    // Every provider, always - the toggles filter what is drawn, not what is
    // fetched. Narrowing the request would mean a venue switched back on had
    // no data until the next range change, and the endpoint's `providers`
    // filter exists for callers that aren't a togglable chart.
    const params = new URLSearchParams({ range, symbol });
    const { ok, data: res } = await fetchJSON('/ticker-history?' + params);
    if (!ok) throw new Error(res.error || t('error.requestFailed'));
    return res;
}

async function fetchProjections(range: Range, symbol: string, t: (k: string) => string) {
    const { from, to } = rangeBounds(range);
    const rows: any[] = [];
    let total = 0;
    let truncated = false;

    for (let page = 1; page <= PROJECTION_MAX_PAGES; page++) {
        const params = new URLSearchParams({
            symbol,
            page: String(page),
            page_size: String(PROJECTION_PAGE_SIZE),
            sort: 'detected_at',
            dir: 'desc',
        });
        if (from) params.set('from', from.toISOString());
        if (to) params.set('to', to.toISOString());

        const { ok, data: res } = await fetchJSON('/opportunity-projections?' + params);
        if (!ok) throw new Error(res.error || t('error.requestFailed'));

        total = res.total || 0;
        const batch = res.projections || [];
        rows.push(...batch);

        if (batch.length < PROJECTION_PAGE_SIZE) break;
        if (page === PROJECTION_MAX_PAGES && rows.length < total) truncated = true;
    }

    // Oldest first, so a route's points read left to right.
    rows.sort((a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime());
    return { projections: rows, projectionTotal: total, projectionTruncated: truncated };
}

function Segmented<V extends string>({ value, options, onPick, role, id }: {
    value: V;
    options: Array<{ value: V; label: string }>;
    onPick: (v: V) => void;
    role?: string;
    id?: string;
}) {
    return (
        <div className="segmented" role={role} id={id}>
            {options.map(o => (
                <button key={o.value} className={o.value === value ? 'active' : undefined}
                        role={role === 'tablist' ? 'tab' : undefined} onClick={() => onPick(o.value)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function ViewToggle({ value, onPick }: { value: View; onPick: (v: View) => void }) {
    const { t } = useI18n();
    return (
        <div className="view-toggle">
            <button className={value === 'chart' ? 'active' : undefined} onClick={() => onPick('chart')}>{t('stats.view.chart')}</button>
            <button className={value === 'table' ? 'active' : undefined} onClick={() => onPick('table')}>{t('stats.view.table')}</button>
        </div>
    );
}

export default function Statistics() {
    const { t, plural, format, locale } = useI18n();
    const status = usePageStatus();
    const tokens = useChartTokens();

    const [range, setRange] = useState<Range>('6h');
    const [symbol, setSymbol] = useState('USDT_IRT');
    // The pair list comes from the server rather than the markup, so a pair
    // added to the bot appears here without a second edit.
    const [symbols, setSymbols] = useState<string[]>(['USDT_IRT']);
    const [enabled, setEnabled] = useState<Set<string> | null>(null);
    const [knownProviders, setKnownProviders] = useState<string[] | null>(null);
    const [showBid, setShowBid] = useState(true);
    const [showAsk, setShowAsk] = useState(true);
    // Prices are shown fee-inclusive by default: a raw bid/ask crossing
    // between two venues is not an opportunity, and the whole question this
    // page exists to answer is which crossings were real.
    const [priceMode, setPriceMode] = useState<PriceMode>('effective');
    const [oppMetric, setOppMetric] = useState<OppMetric>('pct');
    const [oppShape, setOppShape] = useState<OppShape>('points');
    // Only opportunities that could actually have been traded: the projected
    // order cleared both venues' minimums and the net was positive.
    const [realOnly, setRealOnly] = useState(true);
    const [deltaMetric, setDeltaMetric] = useState<DeltaMetric>('cumulative');
    const [views, setViews] = useState<{ price: View; opp: View; delta: View }>({ price: 'chart', opp: 'chart', delta: 'chart' });

    const [data, setData] = useState<StatsData>(EMPTY_DATA);
    const [limits, setLimits] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);

    // Fees and minimums are configuration, not market data: cached here and
    // only refetched when the pair changes.
    const limitsRef = useRef<any | null>(null);
    const knownRef = useRef<string[]>([]);
    const seqRef = useRef(0);

    async function reload(seq: number) {
        setLoading(true);
        try {
            // The fee-inclusive price view cannot be drawn without the limits,
            // so the first load waits rather than rendering a chart that
            // silently means something else. A failure falls back to raw
            // quotes and says so, instead of showing fee-free prices under a
            // "fees included" label.
            if (!limitsRef.current) {
                try {
                    const res = await fetchLimits(symbol, t);
                    if (seq !== seqRef.current) return;
                    limitsRef.current = res;
                    setLimits(res);
                    if (Array.isArray(res.symbols) && res.symbols.length) {
                        const next = res.symbols as string[];
                        setSymbols(prev => (prev.join(',') === next.join(',') ? prev : next));
                    }
                } catch (err) {
                    if (seq !== seqRef.current) return;
                    console.warn('[marketbot] order limits unavailable:', err);
                    setLimits(null);
                    setPriceMode('raw');
                    status.showError(t('stats.limitsUnavailable'));
                }
            }

            const [history, proj] = await Promise.all([
                fetchHistory(range, symbol, t),
                fetchProjections(range, symbol, t),
            ]);
            if (seq !== seqRef.current) return;

            // Providers are discovered from the data, not hardcoded: a venue
            // added to the registry appears here without touching this page.
            // Colour slots are claimed for the whole set at once so the
            // assignment never depends on arrival order.
            const codes = new Set<string>(history.providers || []);
            proj.projections.forEach(p => { codes.add(p.buy_provider); codes.add(p.sell_provider); });
            const merged = new Set(knownRef.current);
            codes.forEach(c => { if (c) merged.add(String(c).toLowerCase()); });
            const known = Array.from(merged).sort();
            knownRef.current = known;
            registerProviders(known);
            setKnownProviders(known);
            setEnabled(new Set(known));

            status.setStatus(true, t('status.updated', { time: fmtClock(new Date()) }));
            if (!proj.projectionTruncated) status.hideError();
            setData({ loaded: true, history, ...proj });
        } catch (err) {
            if (seq !== seqRef.current) return;
            status.setStatus(false, t('status.failed'));
            status.showError(err instanceof Error && err.message ? err.message : t('stats.loadFailed'));
        } finally {
            if (seq === seqRef.current) setLoading(false);
        }
    }

    useEffect(() => {
        const seq = ++seqRef.current;
        void reload(seq);
        return () => { seqRef.current++; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range, symbol, reloadTick]);

    const model = useMemo(() => makeModel({
        data, limits, enabled, showBid, showAsk, priceMode, oppMetric, oppShape, realOnly, deltaMetric,
    }), [data, limits, enabled, showBid, showAsk, priceMode, oppMetric, oppShape, realOnly, deltaMetric]);

    const sweep = useMemo(() => model.computeSweep(), [model]);
    const priceOption = useMemo(() => model.buildPriceOption(tokens), [model, tokens]);
    const oppOption = useMemo(() => model.buildOppOption(tokens), [model, tokens]);
    const deltaOption = useMemo(() => model.buildDeltaOption(tokens, sweep), [model, tokens, sweep]);
    const sizeOption = useMemo(() => model.buildSizeOption(tokens, sweep), [model, tokens, sweep]);

    // A truncated sample has to say so on the chart it shaped.
    useEffect(() => {
        if (!data.loaded || !data.projectionTruncated) return;
        status.showError(t('stats.threshold.truncated', {
            shown: fmtInt.format(data.projections.length),
            total: fmtInt.format(data.projectionTotal),
        }));
    }, [data, locale, enabled, deltaMetric, status, t]);

    const isEnabled = (code: string) => !enabled || enabled.has(String(code || '').toLowerCase());
    const toggleProvider = (code: string, on: boolean) => {
        // Toggling a venue re-renders from data already in hand; only a range
        // change refetches.
        setEnabled(prev => {
            const next = new Set(prev ?? knownRef.current);
            if (on) next.add(code); else next.delete(code);
            return next;
        });
    };

    // Before the first render the markup's fee-inclusive wording stands.
    const effective = data.loaded ? model.effective : priceMode === 'effective';
    // The switch labels name what the two lines currently are, so a reader
    // toggling "Buy cost" off is never left wondering which line went. They
    // are taken as the catalogue wrote them (capitalising the first letter is
    // a Latin-script habit).
    const labels = effective
        ? { strong: t('stats.side.sellNet'), soft: t('stats.side.buyCost') }
        : { strong: t('stats.side.bid'), soft: t('stats.side.ask') };

    // ---- 1. prices ----
    const history = data.history;
    const visible = model.visibleSeries;
    let priceMeta = '—';
    let priceEmpty: ChartEmpty | null = null;
    let priceShown: any | null = null;
    if (data.loaded) {
        if (!history || history.empty) {
            priceMeta = t('stats.price.meta.noData');
            priceEmpty = { message: t('stats.price.empty'), hint: t('stats.price.emptyHint') };
        } else if (!visible.length) {
            priceMeta = t('stats.price.meta.noProviders');
            priceEmpty = { message: t('stats.price.allHidden'), hint: t('stats.price.allHiddenHint') };
        } else {
            priceMeta = plural('stats.price.meta', visible.length, {
                count: format.number(visible.length),
                bucket: format.number(history.bucket_seconds),
            });
            priceShown = priceOption;
        }
    }
    const priceCaption = data.loaded && history && !history.empty
        ? t('stats.price.captionFull', {
            bucket: format.number(history.bucket_seconds),
            samples: fmtInt.format(history.total_samples),
        })
        : t('stats.price.caption');

    const priceColumns: Column<{ t: string; byProvider: Record<string, any> }>[] = [
        { label: t('common.time'), render: r => fmtDateTime(r.t) },
    ];
    visible.forEach(x => {
        const cell = (half: 'strong' | 'soft') => (r: { byProvider: Record<string, any> }) => {
            const p = r.byProvider[x.provider];
            if (!p) return '—';
            const v = model.quoteOf(p, x.provider)[half];
            return v === null ? '—' : fmtPrice(v);
        };
        priceColumns.push({ label: `${providerLabel(x.provider)} ${labels.strong}`, render: cell('strong') });
        priceColumns.push({ label: `${providerLabel(x.provider)} ${labels.soft}`, render: cell('soft') });
    });

    // ---- 2. opportunities ----
    const oppRows = model.visibleProjections();
    const excluded = model.excludedCount();
    let oppMeta = '—';
    let oppEmpty: ChartEmpty | null = null;
    let oppShown: any | null = null;
    if (data.loaded) {
        if (!data.projections.length) {
            oppMeta = t('stats.opp.meta.none');
            oppEmpty = { message: t('stats.opp.empty'), hint: t('stats.opp.emptyHint') };
        } else if (!oppRows.length && excluded > 0) {
            oppMeta = t('stats.opp.meta.zeroRealOf', { total: fmtInt.format(excluded + oppRows.length) });
            oppEmpty = {
                message: t('stats.opp.noneTradeable', { count: fmtInt.format(excluded) }),
                hint: t('stats.opp.noneTradeableHint'),
            };
        } else if (!oppRows.length) {
            oppMeta = t('stats.opp.meta.zeroOf', { total: fmtInt.format(data.projections.length) });
            oppEmpty = { message: t('stats.opp.noneEnabled'), hint: t('stats.price.allHiddenHint') };
        } else {
            oppMeta = realOnly
                ? t('stats.opp.meta.realOf', {
                    real: fmtInt.format(oppRows.length),
                    total: fmtInt.format(oppRows.length + excluded),
                })
                : plural('stats.opp.meta.detections', oppRows.length, { count: fmtInt.format(oppRows.length) });
            oppShown = oppOption;
        }
    }

    const oppColumns: Column<any>[] = [
        { label: t('opps.col.detected'), render: r => fmtDateTime(r.detected_at) },
        {
            label: t('common.route'),
            render: r => (
                <span>
                    <Swatch code={r.buy_provider} />
                    <span style={{ marginLeft: '7px' }}>{`${providerLabel(r.buy_provider)} → ${providerLabel(r.sell_provider)}`}</span>
                </span>
            ),
        },
        { label: t('stats.opp.col.edgePct'), render: r => fmtPct(r.scored_profit_pct, 3), className: r => (r.scored_profit_pct > 0 ? 'profit-positive' : 'profit-negative') },
        { label: t('stats.opp.col.netToman'), render: r => fmtToman(r.net_profit) },
        { label: t('stats.opp.col.sizeUsdt'), render: r => fmtQty(r.projected_amount) },
        { label: t('stats.opp.tip.placeable'), render: r => t(r.placeable ? 'common.yes' : 'common.no') },
        { label: t('common.outcome'), render: r => r.outcome },
    ];

    // ---- 3. threshold sweep ----
    let deltaMeta = '—';
    let deltaEmpty: ChartEmpty | null = null;
    let sizeEmpty: ChartEmpty | null = null;
    if (data.loaded) {
        if (!sweep) {
            deltaMeta = t('stats.threshold.meta.none');
            deltaEmpty = { message: t('stats.threshold.empty'), hint: t('stats.threshold.emptyHint') };
            sizeEmpty = { message: t('stats.threshold.noSizes') };
        } else {
            deltaMeta = data.projectionTruncated
                ? t('stats.threshold.meta.of', {
                    count: fmtInt.format(sweep.rowCount),
                    total: fmtInt.format(data.projectionTotal),
                })
                : t('stats.threshold.meta.detections', { count: fmtInt.format(sweep.rowCount) });
            // The builder returns null when no venue published a size.
            sizeEmpty = { message: t('stats.threshold.noPublishedSize') };
        }
    }

    const deltaColumns: Column<SweepPoint>[] = [
        { label: t('stats.threshold.col.threshold'), render: r => fmtPct(r.threshold, 3) },
        { label: t('stats.threshold.col.realTrades'), render: r => fmtInt.format(r.placeableCount) },
        { label: t('stats.threshold.col.detections'), render: r => fmtInt.format(r.count) },
        { label: t('stats.threshold.col.volume'), render: r => fmtQty(r.placeableVolume, 2) },
        { label: t('stats.threshold.col.capital'), render: r => fmtToman(r.placeableDeployed) },
        { label: t('stats.threshold.col.gross'), render: r => fmtToman(r.placeableGross) },
        { label: t('stats.threshold.col.net'), render: r => fmtToman(r.placeableTotal) },
        { label: t('stats.threshold.col.return'), render: r => fmtPct(r.placeableReturnPct, 3) },
        { label: t('stats.threshold.col.perTrade'), render: r => fmtToman(r.placeableAvg) },
        { label: t('stats.threshold.col.inclUntradeable'), render: r => fmtToman(r.total) },
        { label: t('stats.threshold.col.medianSize'), render: r => (r.medianSize === null ? '—' : fmtQty(r.medianSize)) },
    ];

    const setView = (key: 'price' | 'opp' | 'delta') => (v: View) => setViews(prev => ({ ...prev, [key]: v }));

    return (
        <>
            {/* One toolbar, above everything it scopes. Every chart below
                re-renders against the same slice, so the numbers agree. */}
            <div className="chart-toolbar" role="group" aria-label={t('stats.toolbar.filters')}>
                {/* The pair every panel on this page is about. Options come
                    from the bot's own traded list, so a pair it does not
                    poll can never be selected here and charted as empty. */}
                <div className="toolbar-group">
                    <span className="toolbar-label"><label htmlFor="symbolControl">{t('stats.toolbar.pair')}</label></span>
                    <select id="symbolControl" className="toolbar-select" aria-label={t('stats.toolbar.tradingPair')}
                            value={symbol}
                            onChange={e => {
                                // Limits are per pair, so the cached set is now the
                                // wrong pair's. Dropping it makes the reload fetch
                                // again rather than price this pair's charts against
                                // another pair's fees and minimums.
                                limitsRef.current = null;
                                setSymbol(e.target.value);
                            }}>
                        {(symbols.includes(symbol) ? symbols : [...symbols, symbol]).map(sym => (
                            <option key={sym} value={sym}>{sym}</option>
                        ))}
                    </select>
                </div>

                <div className="toolbar-divider" aria-hidden="true"></div>

                <div className="toolbar-group">
                    <span className="toolbar-label">{t('stats.toolbar.range')}</span>
                    <Segmented role="tablist" value={range} onPick={setRange}
                               options={RANGES.map(r => ({ value: r, label: t(`stats.range.${r}`) }))} />
                </div>

                <div className="toolbar-divider" aria-hidden="true"></div>

                <div className="toolbar-group">
                    <span className="toolbar-label">{t('stats.toolbar.providers')}</span>
                    <div className="series-toggles">
                        {knownProviders === null ? (
                            <span className="panel-hint">{t('status.loading')}</span>
                        ) : !knownProviders.length ? (
                            <span className="panel-hint">{t('stats.noProviders')}</span>
                        ) : knownProviders.map(code => (
                            <label key={code} className={'series-chip' + (isEnabled(code) ? '' : ' off')}>
                                <input type="checkbox" checked={isEnabled(code)}
                                       onChange={e => toggleProvider(code, e.target.checked)} />
                                <span className="series-swatch" style={{ background: providerColor(code) }}></span>
                                <span>{providerLabel(code)}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="toolbar-divider" aria-hidden="true"></div>

                <div className="toolbar-group">
                    <span className="toolbar-label">{t('stats.toolbar.prices')}</span>
                    <Segmented value={priceMode} onPick={setPriceMode} options={[
                        { value: 'effective', label: t('stats.toolbar.inclFees') },
                        { value: 'raw', label: t('stats.toolbar.rawQuote') },
                    ]} />
                </div>

                <div className="toolbar-divider" aria-hidden="true"></div>

                <div className="toolbar-group switch-row">
                    <label className="switch">
                        <input type="checkbox" checked={showBid} onChange={e => setShowBid(e.target.checked)} />
                        <span className="track"></span>
                        <span>{labels.strong}</span>
                    </label>
                    <label className="switch">
                        <input type="checkbox" checked={showAsk} onChange={e => setShowAsk(e.target.checked)} />
                        <span className="track"></span>
                        <span>{labels.soft}</span>
                    </label>
                </div>

                <div className="toolbar-spacer"></div>

                <button className="btn" onClick={() => setReloadTick(n => n + 1)}>{t('stats.toolbar.refresh')}</button>
            </div>

            {/* ================= 1. Bid & ask per provider ================= */}
            <section className="panel" id="prices">
                <div className="panel-header">
                    <h2>
                        <span>{t(effective ? 'stats.price.title.effective' : 'stats.price.title.raw')}</span>
                        {' '}<span className="count">{priceMeta}</span>
                    </h2>
                    <div className="toolbar-group">
                        <ViewToggle value={views.price} onPick={setView('price')} />
                    </div>
                </div>

                <div className="metric-note">
                    <span className="icon">⌁</span>
                    <Html k={effective ? 'stats.price.note.effective' : 'stats.price.note.raw'} />
                </div>

                {/* Keys the marks rather than repeating the y-axis unit: the axis
                    states what is measured, this states how to read the two
                    lines per venue. */}
                <div className="stack-label">{t(effective ? 'stats.price.unit.effective' : 'stats.price.unit.raw')}</div>
                <div hidden={views.price === 'table'}>
                    <EChart className="chart-box tall" option={priceShown} empty={priceEmpty} loading={loading} />
                </div>
                <div className="chart-table" hidden={views.price !== 'table'}>
                    {data.loaded && (
                        <DataTable columns={priceColumns} rows={model.priceTableRows()} limit={300}
                                   emptyText={t('stats.price.tableEmpty')} />
                    )}
                </div>

                <div className="chart-caption">{priceCaption}</div>
            </section>

            {/* ================= 2. Arbitrage opportunities ================= */}
            <section className="panel" id="opportunities">
                <div className="panel-header">
                    <h2>
                        <span>{t('stats.opp.title')}</span>
                        {' '}<span className="count">{oppMeta}</span>
                    </h2>
                    <div className="toolbar-group">
                        <span className="toolbar-label">{t('stats.toolbar.measure')}</span>
                        <Segmented value={oppMetric} onPick={setOppMetric} options={[
                            { value: 'pct', label: t('stats.opp.metric.pct') },
                            { value: 'net', label: t('stats.opp.metric.net') },
                        ]} />
                        <span className="toolbar-label">{t('stats.toolbar.shape')}</span>
                        <Segmented value={oppShape} onPick={setOppShape} options={[
                            { value: 'points', label: t('stats.opp.shape.points') },
                            { value: 'lines', label: t('stats.opp.shape.lines') },
                        ]} />
                        <span className="toolbar-label">{t('stats.toolbar.show')}</span>
                        {/* Scopes the opportunities chart. The threshold panel keeps
                            both lines regardless, since its whole subject is the
                            difference between them. */}
                        <Segmented value={realOnly ? 'real' : 'all'} onPick={v => setRealOnly(v === 'real')} options={[
                            { value: 'real', label: t('stats.opp.real.realOnly') },
                            { value: 'all', label: t('stats.opp.real.all') },
                        ]} />
                        <ViewToggle value={views.opp} onPick={setView('opp')} />
                    </div>
                </div>

                <div className="metric-note">
                    <span className="icon">⌁</span>
                    <Html k="stats.opp.note" />
                </div>

                <div className="stack-label">{t('stats.opp.unit')}</div>
                <div hidden={views.opp === 'table'}>
                    <EChart className="chart-box tall" option={oppShown} empty={oppEmpty} loading={loading} />
                </div>
                <div className="chart-table" hidden={views.opp !== 'table'}>
                    {data.loaded && (
                        <DataTable columns={oppColumns} rows={oppRows.slice().reverse()} limit={400}
                                   emptyText={t('stats.opp.tableEmpty')} />
                    )}
                </div>

                <div className="chart-caption">{t('stats.opp.caption')}</div>
            </section>

            {/* ================= 3. Threshold sweep ================= */}
            <section className="panel" id="threshold">
                <div className="panel-header">
                    <h2>
                        <span>{t('stats.threshold.title')}</span>
                        {' '}<span className="count">{deltaMeta}</span>
                    </h2>
                    <div className="toolbar-group">
                        <span className="toolbar-label">{t('stats.toolbar.measure')}</span>
                        <Segmented value={deltaMetric} onPick={setDeltaMetric}
                                   options={DELTA_METRICS.map(m => ({ value: m, label: t(`stats.threshold.metric.${m}`) }))} />
                        <ViewToggle value={views.delta} onPick={setView('delta')} />
                    </div>
                </div>

                <div className="metric-note">
                    <span className="icon">⌁</span>
                    <Html k="stats.threshold.note" />
                </div>

                {/* The threshold panel is two charts under one toggle. */}
                <div className="chart-stack">
                    <div className="stack-label" hidden={views.delta === 'table'}>{t(deltaMeasure(deltaMetric).caption)}</div>
                    <div hidden={views.delta === 'table'}>
                        <EChart className="chart-box" option={data.loaded ? deltaOption : null} empty={deltaEmpty} loading={loading} />
                    </div>
                    <div className="stack-label">{t('stats.threshold.sizeLabel')}</div>
                    <div hidden={views.delta === 'table'}>
                        <EChart className="chart-box short" option={data.loaded ? sizeOption : null} empty={sizeEmpty} loading={loading} />
                    </div>
                </div>
                <div className="chart-table" hidden={views.delta !== 'table'}>
                    {data.loaded && (
                        <DataTable columns={deltaColumns} rows={sweep ? sweep.points : []} limit={200}
                                   emptyText={t('stats.threshold.tableEmpty')} />
                    )}
                </div>

                <div className="chart-caption">{t('stats.threshold.caption')}</div>
            </section>

            <footer className="page-footer">{t('stats.footer')}</footer>
        </>
    );
}
