import { useEffect, useRef, useState } from 'react';

import { usePageStatus } from '../components/Layout';
import { format, t, useI18n } from '../i18n';
import { fetchJSON, sendJSON } from '../lib/api';
import { usePolling, useInterval } from '../lib/hooks';
import { useTheme } from '../lib/theme';
import { providerColor, providerLabel, registerProviders } from '../lib/ui';

const INTENT = { 'x-marketbot-intent': 'manual-order' };

// A preview is consent to a price the books showed at that moment. Past this
// age the page asks for a fresh one rather than confirming a stale route.
const PREVIEW_MAX_AGE_MS = 30_000;
const CONFIRM_WINDOW_MS = 10_000;

type Side = 'buy' | 'sell';
type Mode = 'price_and_volume' | 'volume_only' | 'price_only';

interface OrderRequest {
    symbol: string;
    side: Side;
    price: number;
    quantity: number;
    providers: string[];
    rest_remainder: boolean;
    cancel_after_seconds: number;
}

interface Preview {
    plan: any;
    request: OrderRequest;
    at: number;
    requestId: string;
}

/** What the preview panel shows when there is no live plan in it. */
type PreviewNote =
    | { kind: 'prompt' }
    | { kind: 'error'; message: string }
    | { kind: 'placed'; text: string };

class HttpError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

function baseAsset(symbol: unknown): string { return String(symbol || '').split('_')[0] || ''; }
function fmtPrice(v: any): string {
    if (v === null || v === undefined || !isFinite(v) || v === 0) return '—';
    return format.number(v, { maximumFractionDigits: v < 100 ? 6 : 2 });
}
function fmtQty(v: any): string {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return format.number(v, { maximumFractionDigits: 8 });
}
function fmtToman(v: any): string {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return format.number(Math.round(v));
}
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

function modeOf(req: OrderRequest): Mode | null {
    if (req.price > 0 && req.quantity > 0) return 'price_and_volume';
    if (req.quantity > 0) return 'volume_only';
    if (req.price > 0) return 'price_only';
    return null;
}

// Buy and sell get separate sentences rather than one with the verb
// substituted in: a language that inflects around the object cannot be
// translated a word at a time.
const MODE_KEYS: Record<Mode, string> = {
    price_and_volume: 'manual.mode.priceAndVolume',
    volume_only: 'manual.mode.volumeOnly',
    price_only: 'manual.mode.priceOnly',
};
const modeTitle = (mode: Mode) => t(`${MODE_KEYS[mode]}.title`);
const modeText = (mode: Mode, side: Side) => t(`${MODE_KEYS[mode]}.${side}`);

const STATUS_CLASS: Record<string, string> = {
    filled: 'completed', partial: 'stale', open: 'pending', placing: 'pending', cancel_requested: 'pending',
    cancelled: 'offline', failed: 'failed', simulated: 'simulated', refused: 'failed',
};
const LIVE = new Set(['open', 'cancel_requested', 'placing']);

const ORDER_FILTERS: Array<[string, string]> = [
    ['', 'manual.orders.filter.all'],
    ['open', 'manual.orders.filter.open'],
    ['filled', 'manual.orders.filter.filled'],
    ['refused', 'manual.orders.filter.refused'],
];

export default function ManualTrade() {
    const { t, plural, format, locale } = useI18n();
    useTheme();
    const status = usePageStatus();

    const [config, setConfig] = useState<any>(null);
    const [configTried, setConfigTried] = useState(false);
    const configRef = useRef<any>(null);
    const [symbols, setSymbols] = useState<string[]>([]);

    const [side, setSide] = useState<Side>('buy');
    const [symbol, setSymbol] = useState('');
    const [venues, setVenues] = useState<Set<string>>(() => new Set()); // empty = all
    const [priceRaw, setPriceRaw] = useState('');
    const [qtyRaw, setQtyRaw] = useState('');
    const [rest, setRest] = useState(false);
    const [cancelAfter, setCancelAfter] = useState('60');
    const [slippage, setSlippage] = useState('0.5');

    const [preview, setPreview] = useState<Preview | null>(null);
    const [note, setNote] = useState<PreviewNote>({ kind: 'prompt' });
    const [staleMark, setStaleMark] = useState(false);
    const [ageNote, setAgeNote] = useState('');
    const [now, setNow] = useState(() => Date.now());
    const [previewing, setPreviewing] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [placing, setPlacing] = useState(false);
    const confirmTimer = useRef<number | undefined>(undefined);

    const [orderFilter, setOrderFilter] = useState('');
    const [orders, setOrders] = useState<any[] | null>(null);
    const [ordersError, setOrdersError] = useState<string | null>(null);
    const [cancelling, setCancelling] = useState<Set<string>>(() => new Set());
    const pollTimer = useRef<number | undefined>(undefined);
    const ordersGen = useRef(0);
    const orderFilterRef = useRef(orderFilter);
    orderFilterRef.current = orderFilter;

    // ---- Form ----

    const num = (raw: string) => (raw.trim() === '' ? 0 : Number(raw.trim()));
    const baseRequest: OrderRequest = {
        symbol,
        side,
        price: num(priceRaw),
        quantity: num(qtyRaw),
        providers: [...venues].sort(),
        rest_remainder: rest,
        cancel_after_seconds: Number(cancelAfter),
    };
    const mode = modeOf(baseRequest);
    const restAllowed = mode === 'price_and_volume';
    if (!restAllowed && rest) setRest(false);
    const request: OrderRequest = { ...baseRequest, rest_remainder: rest && restAllowed };
    const requestRef = useRef(request);
    requestRef.current = request;

    function resetConfirm() {
        setConfirming(false);
        window.clearTimeout(confirmTimer.current);
    }

    function formChanged() {
        if (preview) {
            setPreview(null);
            resetConfirm();
            setAgeNote(t('manual.preview.changed'));
            setStaleMark(true);
        }
    }

    function toggleVenue(code: string) {
        const all = (config?.providers || []).map((p: any) => p.code);
        let next: Set<string>;
        if (venues.size === 0) {
            // From "all", a click means "only this one".
            next = new Set([code]);
        } else if (venues.has(code)) {
            next = new Set(venues);
            next.delete(code);
        } else {
            next = new Set(venues);
            next.add(code);
        }
        if (next.size === all.length) next = new Set();
        setVenues(next);
        formChanged();
    }

    const previewFresh = (p: Preview | null, at: number) => Boolean(p && at - p.at < PREVIEW_MAX_AGE_MS);

    // ---- Preview ----

    async function runPreview() {
        const req = requestRef.current;
        if (!modeOf(req)) {
            status.showError(t('manual.preview.needInput'));
            return;
        }
        setPreviewing(true);
        resetConfirm();
        try {
            const { ok, data } = await sendJSON('/manual-orders/quote', 'POST', req);
            if (!ok) throw new Error(data.error || t('manual.preview.failed'));
            const at = Date.now();
            setPreview({ plan: data, request: req, at, requestId: crypto.randomUUID() });
            setNow(at);
            setStaleMark(false);
            setAgeNote('');
            status.hideError();
        } catch (err) {
            setPreview(null);
            status.showError(errorMessage(err));
            setNote({ kind: 'error', message: errorMessage(err) });
        } finally {
            setPreviewing(false);
        }
    }

    useInterval(() => setNow(Date.now()), 1000);

    // ---- Place ----

    function startConfirm() {
        setConfirming(true);
        window.clearTimeout(confirmTimer.current);
        confirmTimer.current = window.setTimeout(resetConfirm, CONFIRM_WINDOW_MS);
    }

    async function placeOrder() {
        if (!confirming) {
            if (previewFresh(preview, Date.now()) && !preview!.plan.blockers?.length) startConfirm();
            return;
        }
        if (!preview) return;
        window.clearTimeout(confirmTimer.current);
        const { plan, request: previewed, requestId } = preview;
        setPlacing(true);

        const body = {
            ...previewed,
            client_request_id: requestId,
            expected_avg_price: plan.avg_price,
            expected_quantity: plan.total_qty,
            max_slippage_pct: Number(slippage) || 0.5,
        };
        try {
            const { ok, status: code, data } = await sendJSON('/manual-orders', 'POST', body, INTENT);
            if (!ok) throw new HttpError(data.error || t('manual.place.failed'), code);
            status.hideError();
            setPreview(null);
            setNote({
                kind: 'placed',
                text: plural('manual.placed', data.legs.length, {
                    id: data.order.id.slice(0, 8),
                    status: data.order.status,
                    count: format.number(data.legs.length),
                }),
            });
            setStaleMark(false);
            setAgeNote('');
        } catch (err) {
            const code = err instanceof HttpError ? err.status : 0;
            if (code === 504) {
                status.showError(t('manual.place.timeout'));
            } else {
                status.showError(errorMessage(err));
            }
            if (code === 409) {
                // The books moved: show the new route instead of the one
                // confirmed - and keep the refusal on screen, since a fresh
                // preview clears the banner and it used to vanish in a second.
                await runPreview();
                status.showError(errorMessage(err));
            }
        } finally {
            setPlacing(false);
            resetConfirm();
            void loadOrders();
        }
    }

    useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

    // ---- Orders ----

    async function loadOrders() {
        window.clearTimeout(pollTimer.current);
        const gen = ++ordersGen.current;
        let anyLive = false;
        try {
            const filter = orderFilterRef.current;
            const qs = filter ? `?status=${encodeURIComponent(filter)}` : '';
            const { ok, data } = await fetchJSON(`/manual-orders${qs}`);
            if (gen !== ordersGen.current) return;
            if (!ok) throw new Error(data.error || t('manual.orders.loadFailed'));
            const list: any[] = data.orders || [];
            registerProviders(list.flatMap(o => o.legs.map((l: any) => l.provider)));
            setOrders(list);
            setOrdersError(null);
            anyLive = list.some(o => o.legs.some((l: any) => LIVE.has(l.status)));
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (err) {
            if (gen !== ordersGen.current) return;
            status.setStatus(false, t('status.updateFailed'));
            setOrdersError(errorMessage(err));
        }
        window.clearTimeout(pollTimer.current);
        // Fast while something is working on a book, slow otherwise.
        pollTimer.current = window.setTimeout(() => void loadOrders(), anyLive ? 4000 : 15000);
    }

    useEffect(() => {
        void loadOrders();
        return () => {
            ordersGen.current++;
            window.clearTimeout(pollTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderFilter, locale]);

    async function cancelOrder(orderId: string, legId?: string) {
        if (!window.confirm(t(legId ? 'manual.orders.confirmCancelLeg' : 'manual.orders.confirmCancelAll'))) return;
        const key = `${orderId}:${legId || ''}`;
        setCancelling(prev => new Set(prev).add(key));
        try {
            const { ok, data } = await sendJSON(`/manual-orders/${orderId}/cancel`, 'POST', legId ? { leg_id: legId } : {}, INTENT);
            if (!ok) throw new Error(data.error || t('manual.orders.cancelFailed'));
            status.hideError();
        } catch (err) {
            status.showError(errorMessage(err));
        } finally {
            await loadOrders();
            setCancelling(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    }

    // ---- Config ----

    async function loadConfig() {
        try {
            const { ok, data } = await fetchJSON('/manual-orders/config');
            if (!ok) throw new Error(data.error || t('manual.configFailed'));
            const firstLoad = !configRef.current;
            configRef.current = data;
            setConfig(data);

            if (firstLoad) {
                const list: string[] = data.traded_symbols || [];
                setSymbols(list);
                setSymbol(prev => (prev && list.includes(prev)
                    ? prev
                    : list.includes('USDT_IRT') ? 'USDT_IRT' : list[0] || ''));
            }
        } catch (err) {
            status.showError(errorMessage(err));
            configRef.current = null;
            setConfig(null);
        } finally {
            setConfigTried(true);
        }
    }

    usePolling(loadConfig, 15000);

    // The badge and the notice are two views of one state, so they are decided
    // in one place.
    let badgeCls = 'pending';
    let badgeKey = 'manual.badge.loading';
    let noticeKey: string | null = null;
    let noticeCls = '';
    if (configTried) {
        if (!config) { badgeCls = 'failed'; badgeKey = 'manual.badge.offline'; }
        else if (!config.available) { badgeCls = 'failed'; badgeKey = 'manual.badge.unavailable'; noticeKey = 'manual.notice.unavailable'; noticeCls = 'red'; }
        else if (!config.enabled) { badgeCls = 'stale'; badgeKey = 'manual.badge.previewOnly'; noticeKey = 'manual.notice.disabled'; }
        else if (config.simulate_orders) { badgeCls = 'simulated'; badgeKey = 'manual.badge.simulation'; noticeKey = 'manual.notice.simulation'; }
        else { badgeCls = 'failed'; badgeKey = 'manual.badge.live'; }
    }

    const { setTopbarRight } = status;
    useEffect(() => {
        setTopbarRight(<span className={`status-badge ${badgeCls}`}>{t(badgeKey)}</span>);
    }, [setTopbarRight, badgeCls, badgeKey, t, locale]);
    useEffect(() => () => setTopbarRight(null), [setTopbarRight]);

    // ---- Buttons ----

    const plan = preview?.plan;
    const fresh = previewFresh(preview, now);
    let reason = '';
    if (!configTried) reason = t('manual.hint.default');
    else if (!config?.available) reason = t('manual.hint.noDesk');
    else if (!config.enabled) reason = t('manual.hint.disabled');
    else if (!plan) reason = t('manual.hint.default');
    else if (plan.blockers?.length) reason = t('manual.hint.blocked');
    else if (!fresh) reason = t('manual.hint.stale');

    let placeLabel = t('manual.place');
    if (placing) placeLabel = t('manual.placing');
    else if (confirming && plan) {
        const venuesLabel = plan.legs.length === 1
            ? providerLabel(plan.legs[0].provider)
            : t('manual.confirm.venues', { count: format.number(plan.legs.length) });
        placeLabel = t('manual.confirm.button', {
            side: plan.side.toUpperCase(),
            qty: fmtQty(plan.total_qty),
            asset: baseAsset(plan.symbol),
            venues: venuesLabel,
        });
    }
    const placeDisabled = placing ? true : confirming ? false : Boolean(reason);
    const hint = confirming
        ? t(config?.simulate_orders ? 'manual.confirm.simulation' : 'manual.confirm.live')
        : reason || plural('manual.hint.ready', plan.legs.length, {
            count: format.number(plan.legs.length),
            simulation: config.simulate_orders ? t('manual.hint.simulationSuffix') : '',
        });

    const providerCodes: string[] = (config?.providers || []).map((p: any) => p.code);
    registerProviders(providerCodes);

    const ageText = preview
        ? t(fresh ? 'manual.preview.age' : 'manual.preview.ageStale', {
            seconds: format.number(Math.floor((now - preview.at) / 1000)),
        })
        : ageNote;
    const previewStale = preview ? !fresh : staleMark;

    return (
        <>
            <div className={`mt-notice ${noticeCls}`.trim()} hidden={!noticeKey}>{noticeKey ? t(noticeKey) : ''}</div>

            <div className="mt-layout">
                <section className="panel">
                    <div className="panel-header">
                        <h2>{t('manual.order.title')}</h2>
                        <span className="panel-hint">{mode ? modeTitle(mode) : ''}</span>
                    </div>

                    <div className="mt-form">
                        <div className="mt-row">
                            <div className="filter-field">
                                <label>{t('manual.side')}</label>
                                <div className="segmented mt-side">
                                    {(['buy', 'sell'] as const).map(s => (
                                        <button key={s} type="button" data-side={s} className={side === s ? 'active' : ''}
                                                onClick={() => { setSide(s); formChanged(); }}>
                                            {t(`manual.side.${s}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="filter-field">
                                <label htmlFor="symbolSelect">{t('manual.pair')}</label>
                                <select id="symbolSelect" value={symbol}
                                        onChange={e => { setSymbol(e.target.value); formChanged(); }}>
                                    {symbols.map(s => <option key={s} value={s}>{s.replace('_', ' / ')}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="filter-field">
                            <label>
                                <span>{t('manual.venues')}</span>
                                {' '}<span className="mt-label-note">
                                    {venues.size === 0
                                        ? t('manual.venues.all')
                                        : t('manual.venues.selected', { count: format.number(venues.size) })}
                                </span>
                            </label>
                            <div className="series-toggles">
                                {providerCodes.map(code => {
                                    const p = config.providers.find((x: any) => x.code === code);
                                    const on = venues.size === 0 || venues.has(code);
                                    return (
                                        <label key={code} className={`series-chip ${on ? '' : 'off'}`} onClick={() => toggleVenue(code)}>
                                            <span className="series-swatch" style={{ background: providerColor(code) }} />
                                            {providerLabel(code)}
                                            {p.order_circuit_state === 'open' && (
                                                <> <span className="chip circuit-open">{t('manual.venues.ordersPaused')}</span></>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-row">
                            <div className="filter-field mt-grow">
                                <label htmlFor="priceInput">
                                    <span>{t('manual.price')}</span> <span className="mt-label-note">{t('manual.price.note')}</span>
                                </label>
                                <input type="number" id="priceInput" min="0" step="any" inputMode="decimal"
                                       placeholder={t('manual.price.placeholder')} value={priceRaw}
                                       onChange={e => { setPriceRaw(e.target.value); formChanged(); }} />
                            </div>
                            <div className="filter-field mt-grow">
                                <label htmlFor="qtyInput">
                                    <span>{t('manual.volume')}</span>
                                    {' '}<span className="mt-label-note">
                                        {t('manual.volume.unit', { asset: baseAsset(symbol) || t('manual.volume.baseAsset') })}
                                    </span>
                                </label>
                                <input type="number" id="qtyInput" min="0" step="any" inputMode="decimal"
                                       placeholder={t('manual.volume.placeholder')} value={qtyRaw}
                                       onChange={e => { setQtyRaw(e.target.value); formChanged(); }} />
                            </div>
                        </div>

                        <div className="mt-mode">
                            {mode ? (
                                <><strong>{modeTitle(mode)}</strong><span>{modeText(mode, side)}</span></>
                            ) : (
                                <><strong>{t('manual.mode.none.title')}</strong><span>{t('manual.mode.none.text')}</span></>
                            )}
                        </div>

                        <div className="mt-row mt-options">
                            <label className={`switch${restAllowed ? '' : ' mt-disabled'}`}>
                                <input type="checkbox" checked={rest && restAllowed} disabled={!restAllowed}
                                       onChange={e => { setRest(e.target.checked); formChanged(); }} />
                                <span className="track" />
                                <span>{t('manual.rest')}</span>
                            </label>
                            <div className="filter-field">
                                <label htmlFor="cancelAfterSelect">{t('manual.cancelAfter')}</label>
                                <select id="cancelAfterSelect" value={cancelAfter}
                                        onChange={e => { setCancelAfter(e.target.value); formChanged(); }}>
                                    <option value="0">{t('manual.cancelAfter.never')}</option>
                                    <option value="30">{t('manual.cancelAfter.30s')}</option>
                                    <option value="60">{t('manual.cancelAfter.1m')}</option>
                                    <option value="300">{t('manual.cancelAfter.5m')}</option>
                                    <option value="900">{t('manual.cancelAfter.15m')}</option>
                                </select>
                            </div>
                            <div className="filter-field">
                                <label htmlFor="slippageInput">{t('manual.slippage')}</label>
                                <input type="number" id="slippageInput" min="0.01" max="5" step="0.05"
                                       value={slippage} onChange={e => setSlippage(e.target.value)} />
                            </div>
                        </div>

                        <div className="mt-actions">
                            <button className="btn primary" type="button" hidden={confirming} disabled={previewing}
                                    onClick={() => void runPreview()}>
                                {t(previewing ? 'manual.previewing' : 'manual.preview')}
                            </button>
                            <button className={`btn mt-place${confirming && plan ? ` mt-confirm ${plan.side}` : ''}`} type="button"
                                    disabled={placeDisabled} onClick={() => void placeOrder()}>
                                {placeLabel}
                            </button>
                            <button className="btn" type="button" hidden={!confirming || placing} onClick={resetConfirm}>
                                {t('manual.back')}
                            </button>
                            <span className="panel-hint">{hint}</span>
                        </div>
                    </div>
                </section>

                <section className="panel">
                    <div className="panel-header">
                        <h2>{t('manual.preview.title')}</h2>
                        <span className="panel-hint">{ageText}</span>
                    </div>
                    <div className={previewStale ? 'mt-stale' : undefined}>
                        {preview ? (
                            <PreviewPlan plan={preview.plan} request={preview.request} />
                        ) : note.kind === 'error' ? (
                            <div className="empty-state"><span className="big">⚠️</span>{note.message}</div>
                        ) : note.kind === 'placed' ? (
                            <div className="empty-state"><span className="big">✅</span>{note.text}</div>
                        ) : (
                            <div className="empty-state"><span className="big">🧭</span><span>{t('manual.preview.prompt')}</span></div>
                        )}
                    </div>
                </section>
            </div>

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('manual.orders.title')}</span> <span className="count">{orders ? orders.length : 0}</span></h2>
                    <div className="toolbar-group">
                        <div className="segmented">
                            {ORDER_FILTERS.map(([value, key]) => (
                                <button key={value || 'all'} type="button" data-status={value}
                                        className={orderFilter === value ? 'active' : ''}
                                        onClick={() => { setOrderFilter(value); if (value === orderFilter) void loadOrders(); }}>
                                    {t(key)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div>
                    {ordersError !== null ? (
                        <div className="empty-state"><span className="big">⚠️</span>{ordersError}</div>
                    ) : orders === null ? (
                        <div className="skeleton">{t('manual.orders.loading')}</div>
                    ) : orders.length === 0 ? (
                        <div className="empty-state"><span className="big">🗒️</span>{t('manual.orders.empty')}</div>
                    ) : orders.map(o => (
                        <OrderCard key={o.id} o={o} cancelling={cancelling} onCancel={cancelOrder} />
                    ))}
                </div>
            </section>

            <footer className="page-footer">{t('manual.footer')}</footer>
        </>
    );
}

function PreviewPlan({ plan, request }: { plan: any; request: OrderRequest }) {
    const { t, format } = useI18n();
    const base = baseAsset(plan.symbol);
    const sideCls = plan.side === 'buy' ? 'side-buy' : 'side-sell';
    const quoteLabel = t(plan.side === 'buy' ? 'manual.preview.youPay' : 'manual.preview.youReceive');
    // What each unit actually costs (or yields) once fees are in: the
    // fee-inclusive total over the volume. plan.avg_price is the pre-fee
    // execution price, which stays the value sent back for the slippage check.
    const effectivePrice = plan.total_qty > 0 ? plan.net_quote / plan.total_qty : plan.avg_price;
    const blockers: string[] = plan.blockers || [];
    const warnings: string[] = plan.warnings || [];
    const venueDot = (code: string) => (
        <><span className="provider-dot" style={{ background: providerColor(code) }} /> <span className="provider-tag">{code}</span></>
    );

    return (
        <>
            <div className="mt-summary">
                <div>
                    <span className="stat-label">{t('manual.side')}</span>
                    <strong className={sideCls}>{plan.side.toUpperCase()} {plan.symbol}</strong>
                </div>
                <div>
                    <span className="stat-label">{t('manual.volume')}</span>
                    <strong>{fmtQty(plan.total_qty)} {base}</strong>
                    {plan.shortfall > 0 && (
                        <span className="mt-sub red">
                            {t('manual.preview.shortfall', { short: fmtQty(plan.shortfall), requested: fmtQty(plan.requested_qty) })}
                        </span>
                    )}
                </div>
                <div>
                    <span className="stat-label">{t('manual.preview.averagePrice')}</span>
                    <strong>{fmtPrice(effectivePrice)}</strong>
                    <span className="mt-sub">{t('manual.preview.beforeFees', { value: fmtPrice(plan.avg_price) })}</span>
                    {plan.reference_mid ? (
                        <span className="mt-sub">{t('manual.preview.marketMid', { value: fmtPrice(plan.reference_mid) })}</span>
                    ) : null}
                </div>
                <div>
                    <span className="stat-label">{quoteLabel}</span>
                    <strong>{fmtToman(plan.net_quote)}</strong>
                    <span className="mt-sub">{t('manual.preview.estFees', { value: fmtToman(plan.est_fees) })}</span>
                </div>
            </div>
            {blockers.length > 0 && <ul className="mt-list mt-blockers">{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
            {warnings.length > 0 && <ul className="mt-list mt-warnings">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            {plan.legs.length > 0 && (
                <>
                    <div className="stat-group-label">{t('manual.preview.ordersToSend')}</div>
                    <div className="table-scroll"><table className="data-table mt-table">
                        <thead><tr>
                            <th>{t('manual.preview.col.venue')}</th>
                            <th>{t('manual.preview.col.volume')}</th>
                            <th>{t('manual.preview.col.kind')}</th>
                            <th>{t('manual.preview.col.limit')}</th>
                            <th>{t('manual.preview.col.expectedAvg')}</th>
                            <th>{t('manual.preview.col.value')}</th>
                            <th>{t('manual.preview.col.fee')}</th>
                        </tr></thead>
                        <tbody>
                            {plan.legs.map((l: any, i: number) => (
                                <tr key={i}>
                                    <td>{venueDot(l.provider)}</td>
                                    <td>{fmtQty(l.qty)}</td>
                                    <td>{l.rest_qty > 0
                                        ? t('manual.preview.takeAndRest', { take: fmtQty(l.take_qty), rest: fmtQty(l.rest_qty) })
                                        : t('manual.preview.take')}</td>
                                    <td>{fmtPrice(l.limit_price)}</td>
                                    <td>{fmtPrice(l.expected_avg_price)}</td>
                                    <td>{fmtToman(l.notional)}</td>
                                    <td className="fee-text">{t('manual.preview.feeAndValue', { fee: format.number(l.fee_pct), value: fmtToman(l.est_fee) })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table></div>
                </>
            )}
            <div className="stat-group-label" style={{ marginTop: 16 }}>{t('manual.preview.venuesConsidered')}</div>
            <div className="table-scroll"><table className="data-table mt-table">
                <thead><tr>
                    <th>{t('manual.preview.col.venue')}</th>
                    <th>{t(plan.side === 'buy' ? 'manual.preview.col.bestAsk' : 'manual.preview.col.bestBid')}</th>
                    <th>{t(request.price > 0 ? 'manual.preview.col.depthAtPrice' : 'manual.preview.col.depth')}</th>
                    <th>{t('manual.preview.col.balance')}</th>
                    <th>{t('manual.preview.col.feeMin')}</th>
                    <th>{t('manual.preview.col.share')}</th>
                </tr></thead>
                <tbody>
                    {plan.venues.map((v: any, i: number) => {
                        // Credit the venue lends is spendable too, and the router sized
                        // against it - so it is shown, apart from the account's own funds.
                        const credit = v.credit_unlimited
                            ? <> <span className="fee-text">{t('manual.preview.creditUnlimited')}</span></>
                            : v.credit > 0
                                ? <> <span className="fee-text">{t('manual.preview.credit', { amount: fmtQty(v.credit) })}</span></>
                                : null;
                        return (
                            <tr key={i} className={v.excluded ? 'incomplete' : ''}>
                                <td>{venueDot(v.provider)}</td>
                                <td>{fmtPrice(v.best_price)}</td>
                                <td>{v.depth_known
                                    ? fmtQty(v.depth)
                                    : <>{fmtQty(v.depth)} <span className="fee-text">{t('manual.preview.unsizedBook')}</span></>}</td>
                                <td>{v.balance_known
                                    ? <>{fmtQty(v.free)} {v.balance_asset}{credit}</>
                                    : <span className="fee-text">{t('common.unknown')}</span>}</td>
                                <td className="fee-text">{t('manual.preview.feeAndMin', { fee: format.number(v.fee_pct), min: fmtQty(v.min_qty) })}</td>
                                <td style={{ whiteSpace: 'normal' }}>
                                    {v.excluded
                                        ? <span className="mt-excluded">{v.excluded}</span>
                                        : v.allocated > 0
                                            ? <span className="side-buy">{fmtQty(v.allocated)}</span>
                                            : <span className="fee-text">{t('manual.preview.nothingBetter')}</span>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table></div>
            <div className="summary-caption">{t('manual.preview.caption', { ceiling: fmtToman(plan.max_notional_toman) })}</div>
        </>
    );
}

// Leg statuses are the bot's own recorded values and double as the badge
// class, so they are shown as recorded rather than translated away from
// what its logs say.
function Badge({ status }: { status: string }) {
    return <span className={`status-badge ${STATUS_CLASS[status] || 'pending'}`}>{String(status).replace('_', ' ')}</span>;
}

function OrderCard({ o, cancelling, onCancel }: {
    o: any;
    cancelling: Set<string>;
    onCancel: (orderId: string, legId?: string) => void;
}) {
    const { t, format } = useI18n();
    const base = baseAsset(o.symbol);
    const planned = o.planned_qty || 0;
    const filledPct = planned > 0 ? Math.min(100, (o.filled_qty / planned) * 100) : 0;
    const sideCls = o.side === 'buy' ? 'side-buy' : 'side-sell';
    const live = o.legs.some((l: any) => LIVE.has(l.status));
    const asked = [
        o.limit_price > 0 ? t('manual.orders.atPrice', { price: fmtPrice(o.limit_price) }) : t('manual.orders.bestPrice'),
        o.requested_qty > 0 ? t('manual.orders.quantityAsset', { qty: fmtQty(o.requested_qty), asset: base }) : t('manual.orders.allAtPrice'),
    ].join(' · ');

    const cancelButton = (legId: string | undefined, className: string, label: string) => {
        const busy = cancelling.has(`${o.id}:${legId || ''}`);
        return (
            <button className={className} disabled={busy} onClick={() => onCancel(o.id, legId)}>
                {busy ? t('manual.orders.cancelling') : label}
            </button>
        );
    };

    return (
        <div className={`mt-order ${live ? 'live' : ''}`}>
            <div className="mt-order-head">
                <span className="audit-time">{format.dateTime(o.created_at)}</span>
                <span className={sideCls}>{o.side.toUpperCase()}</span>
                <strong>{o.symbol}</strong>
                <span className="fee-text">{asked}</span>
                <Badge status={o.status} />
                {o.simulated && <span className="status-badge simulated">{t('common.simulated')}</span>}
                <span className="spacer" />
                <span className="fee-text">{t('manual.orders.filled')}</span> <strong>{fmtQty(o.filled_qty)}</strong>
                <span className="fee-text">{t('manual.orders.of', { qty: fmtQty(planned), asset: base })}</span>
                {o.avg_fill_price > 0 && (
                    <><span className="fee-text">{t('manual.orders.avg')}</span> <strong>{fmtPrice(o.avg_fill_price)}</strong></>
                )}
                {live && !o.simulated && cancelButton(undefined, 'btn mt-small mt-danger', t('manual.orders.cancelAll'))}
            </div>
            <div className="mt-progress"><span style={{ width: `${filledPct.toFixed(1)}%` }} /></div>
            {o.error_message && <div className="audit-leg-error">{o.error_message}</div>}
            {o.legs.length ? (
                <div className="table-scroll"><table className="data-table mt-table">
                    <thead><tr>
                        <th>{t('manual.preview.col.venue')}</th>
                        <th>{t('manual.orders.col.status')}</th>
                        <th>{t('manual.orders.col.filledSent')}</th>
                        <th>{t('manual.preview.col.limit')}</th>
                        <th>{t('manual.orders.col.avgFill')}</th>
                        <th>{t('manual.orders.col.order')}</th>
                        <th></th>
                    </tr></thead>
                    <tbody>
                        {o.legs.map((l: any) => {
                            const legLive = LIVE.has(l.status);
                            return (
                                <tr key={l.id}>
                                    <td><span className="provider-dot" style={{ background: providerColor(l.provider) }} /> <span className="provider-tag">{l.provider}</span></td>
                                    <td><Badge status={l.status} /></td>
                                    <td>
                                        {fmtQty(l.executed_qty)} / {fmtQty(l.qty)}
                                        {l.rest_qty > 0 && <> <span className="fee-text">{t('manual.orders.rests')}</span></>}
                                    </td>
                                    <td>{fmtPrice(l.limit_price)}</td>
                                    <td>{l.executed_qty > 0 && l.executed_quote > 0 ? fmtPrice(l.executed_quote / l.executed_qty) : '—'}</td>
                                    <td className="fee-text" style={{ whiteSpace: 'normal' }}>
                                        {l.order_id || '—'}
                                        {l.cancel_at && legLive ? t('manual.orders.autoCancel', { time: format.dateTime(l.cancel_at) }) : ''}
                                        {l.last_error && <div className="mt-excluded">{l.last_error}</div>}
                                    </td>
                                    <td>{legLive && !o.simulated && cancelButton(l.id, 'btn mt-small', t('manual.orders.cancel'))}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table></div>
            ) : <RefusedDetail o={o} />}
        </div>
    );
}

/** Why a refused order sent nothing: each venue the live re-plan left out. */
function RefusedDetail({ o }: { o: any }) {
    const { t } = useI18n();
    const reasons: any[] = o.venue_reasons || [];
    return (
        <>
            <div className="mt-sub">{t('manual.orders.nothingSent')}</div>
            {reasons.length > 0 && (
                <ul className="mt-reasons">
                    {reasons.map((r, i) => (
                        <li key={i}>
                            <span className="provider-dot" style={{ background: providerColor(r.provider) }} />
                            {' '}<span className="provider-tag">{r.provider}</span> — {r.reason}
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
