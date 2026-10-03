import { format, msg, t, type Message } from '../../i18n';
import { ApiError, wsUrl } from '../../shared/api';
import { providerLabel, readStore, writeStore } from '../../shared/lib';
import type { usePageStatus } from '../../shared/stores/pageStatus';
import {
    errorText, marketApi, refusalText, rejectionText, type Balance, type Depth, type ExchangeOrder, type ExchangeTrade, type ExchangeUser, type Hedging,
} from './api';
import { groupLevels, isOpen, rowCovers, walkBook, type BookLevel, type BookRow, type BookSide, type Side } from './book';
import { baseOf, blank, fixed, fmtAsset, fmtToman, num, pairLabel, parseAmount, sideWord, toAmount } from './format';

export const BOOK_ROWS = 16;
const TRADES_KEPT = 60;
const SYMBOL_KEY = 'marketbot-market-symbol';
const USER_KEY = 'marketbot-market-user';
const INTERVAL_KEY = 'marketbot-market-interval';

// The API's candle widths (GET /exchange/candles), in seconds.
export const CANDLE_INTERVALS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 } as const;
export type CandleInterval = keyof typeof CANDLE_INTERVALS;
const isInterval = (v: unknown): v is CandleInterval => typeof v === 'string' && v in CANDLE_INTERVALS;

export type BookView = 'both' | 'bids' | 'asks';
export type OrdersTab = 'open' | 'history' | 'trades';
export type FormRole = 'price' | 'amount' | 'total';
export type ModeState = 'demo' | 'liveNoBot' | 'liveOff' | 'liveSimulated' | 'liveReal';
export type ChartTab = 'price' | 'depth';

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface DaySummary { open: number; high: number; low: number; close: number; volume: number; quoteVolume: number }
export interface FormValues { price: string; amount: string; total: string }
export interface Toast { id: number; kind: string; title: string; body: string; leaving: boolean }

/** The best prices and what follows from them, as the headline and the book show them. */
export interface Quote {
    last: number | null;
    bid: number | null;
    ask: number | null;
    market: number | null;
    spread: number | null;
    mid: number | null;
}

interface State {
    inited: boolean;
    symbols: string[];
    symbol: string | null;
    users: ExchangeUser[];
    usersLoaded: boolean;
    userId: string | null;
    depth: Depth;
    trades: ExchangeTrade[];
    tradeIds: Set<string>;
    flashIds: Set<string> | null;
    lastDirection: number;
    // The market price as last computed, and which way it last moved - so
    // the headline ticks up or down with the books, not only on a trade.
    marketPrev: number | null;
    marketDirection: number;
    open: Map<string, ExchangeOrder>;
    history: ExchangeOrder[];
    myTrades: ExchangeTrade[];
    balances: Balance[];
    real: { balances: Balance[]; unavailable: string[] } | null;
    group: number;
    groupFor: string | null;
    groupSteps: number[] | null;
    view: BookView;
    tab: OrdersTab;
    wsOpen: boolean;
    wsDelay: number;
    kafka: { connected: boolean; error?: string } | null;
    subscribedAt: number;
    statusAt: number;
    notice: { message: Message; red: boolean } | null;
    busy: Record<Side, boolean>;
    forms: Record<Side, FormValues>;
    faucetBusy: boolean;
    cancelAllBusy: boolean;
    cancelling: Set<string>;
    toasts: Toast[];
    // "demo" or "live" from the engine's books; whether the bot would place
    // venue orders from /exchange/status.
    mode: string | null;
    hedging: Hedging;
    // The chart. `candleSeq` changes when the series is replaced (a new pair
    // or interval); between those, only the last candle moves.
    chartTab: ChartTab;
    interval: CandleInterval;
    candles: Candle[];
    candleSeq: number;
    candlesLoading: boolean;
    candlesLoaded: boolean;
    summary: DaySummary | null;
}

export interface MarketDeps {
    status: ReturnType<typeof usePageStatus>;
    setSymbolParam: (symbol: string) => void;
}

/** Newer state wins; an answer that arrives after a later event must not roll it back. */
function newer(a: ExchangeOrder, b: ExchangeOrder | undefined): boolean {
    if (!b) return true;
    const ta = Date.parse(a.updated_at);
    const tb = Date.parse(b.updated_at);
    if (ta !== tb) return ta > tb;
    return num(a.filled_quantity) >= num(b.filled_quantity) && !(isOpen(a) && !isOpen(b));
}

const emptyForm = (): FormValues => ({ price: '', amount: '', total: '' });

/** Settles a request into ok-or-error, for loads where one failing must not stop the others. */
const settle = <T>(p: Promise<T>) => p.then(
    (data) => ({ ok: true as const, data }),
    (error: unknown) => ({ ok: false as const, error }),
);

/**
 * One visit to the market page: the WebSocket feed, the books, the user's
 * orders and the order forms. A store React subscribes to: every change
 * bumps `version`, and the page re-renders from `s`.
 */
export class MarketSession {
    s: State = {
        inited: false,
        symbols: [],
        symbol: null,
        users: [],
        usersLoaded: false,
        userId: null,
        depth: null,
        trades: [],
        tradeIds: new Set(),
        flashIds: null,
        lastDirection: 0,
        marketPrev: null,
        marketDirection: 0,
        open: new Map(),
        history: [],
        myTrades: [],
        balances: [],
        real: null,
        group: 0,
        groupFor: null,
        groupSteps: null,
        view: 'both',
        tab: 'open',
        wsOpen: false,
        wsDelay: 1000,
        kafka: null,
        subscribedAt: 0,
        statusAt: 0,
        notice: null,
        busy: { buy: false, sell: false },
        forms: { buy: emptyForm(), sell: emptyForm() },
        faucetBusy: false,
        cancelAllBusy: false,
        cancelling: new Set(),
        toasts: [],
        mode: null,
        hedging: null,
        chartTab: 'price',
        interval: (() => { const v = readStore(INTERVAL_KEY); return isInterval(v) ? v : '15m'; })(),
        candles: [],
        candleSeq: 0,
        candlesLoading: false,
        candlesLoaded: false,
        summary: null,
    };

    deps: MarketDeps;
    private ws: WebSocket | null = null;
    private disposed = false;
    private timers = new Set<number>();
    private toastSeq = 0;
    private generation = 0;
    private version = 0;
    private listeners = new Set<() => void>();

    constructor(deps: MarketDeps) {
        this.deps = deps;
    }

    // ---- Store ----

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    getVersion = () => this.version;

    private render() {
        if (this.disposed) return;
        this.version++;
        this.listeners.forEach((l) => l());
    }

    private later(fn: () => void, ms: number) {
        const id = window.setTimeout(() => { this.timers.delete(id); fn(); }, ms);
        this.timers.add(id);
    }

    /** Idempotent under StrictMode's mount-unmount-mount: a superseded start never finishes loading. */
    start(urlSymbol: string | null) {
        this.disposed = false;
        void this.init(urlSymbol, ++this.generation);
    }

    dispose() {
        this.disposed = true;
        this.generation++;
        this.timers.forEach((id) => window.clearTimeout(id));
        this.timers.clear();
        if (this.ws) this.ws.close();
        this.ws = null;
    }

    // ---- Formats that depend on the pair ----

    /**
     * Decimals for a Toman price on the current pair: whole Toman where a unit
     * is worth that much (USDT, BTC), more only for coins priced near one Toman
     * (SHIB), where whole Toman would put every level at the same price. Taken
     * from the pair's price level, not each number, so the book is one format.
     */
    priceDigits(): number {
        const s = this.s;
        if (s.group >= 1) return 0;
        if (s.group > 0) return Math.min(8, Math.round(-Math.log10(s.group)));
        return this.pairDigits();
    }
    /** The pair's own price decimals, whatever the book is grouped to - for the chart. */
    pairDigits(): number {
        const { bid, ask } = this.bestPrices();
        const ref = Math.abs(ask || bid || this.lastPrice() || 0);
        if (!ref || ref >= 1000) return 0;
        if (ref >= 100) return 1;
        if (ref >= 10) return 2;
        if (ref >= 1) return 4;
        return 6;
    }
    fmtPrice(v: unknown, digits?: number): string {
        if (blank(v)) return '—';
        return fixed(num(v), digits === undefined ? this.priceDigits() : digits);
    }
    /** A quantity of the pair's base asset - or of `asset`, for an order on another pair. */
    fmtQty(v: unknown, asset?: string): string {
        return fmtAsset(v, asset || baseOf(this.s.symbol));
    }

    userName(id: string): string {
        const u = this.s.users.find((x) => x.id === id);
        return u ? u.display_name : t('market.counterparty.user');
    }

    // ---- Toasts ----

    toast(kind: string, title: string, body: string, ttl = 6000) {
        const id = ++this.toastSeq;
        this.s.toasts = [{ id, kind, title, body, leaving: false }, ...this.s.toasts].slice(0, 5);
        this.later(() => this.dismissToast(id), ttl);
        this.render();
    }

    dismissToast(id: number) {
        const toast = this.s.toasts.find((x) => x.id === id);
        if (!toast || toast.leaving) return;
        this.s.toasts = this.s.toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x));
        this.render();
        this.later(() => {
            this.s.toasts = this.s.toasts.filter((x) => x.id !== id);
            this.render();
        }, 180);
    }

    /** The toast for an order this page just placed, from the engine's answer. */
    private toastPlaced(order: ExchangeOrder) {
        if (!order) return;
        const base = baseOf(order.symbol);
        const qty = num(order.quantity);
        const filled = num(order.filled_quantity);
        const avg = filled > 0 ? num(order.filled_quote) / filled : 0;
        const vars = {
            side: sideWord(order.side), qty: this.fmtQty(qty), base, price: this.fmtPrice(order.price),
            filled: this.fmtQty(filled), avg: this.fmtPrice(avg), rest: this.fmtQty(qty - filled),
        };
        if (order.status === 'filled') this.toast(order.side, t('market.toast.filled.title'), t('market.toast.filled', vars));
        else if (order.status === 'partial') this.toast(order.side, t('market.toast.partial.title'), t('market.toast.partial', vars), 9000);
        else this.toast('info', t('market.toast.placed.title'), t('market.toast.placed', vars));
    }

    /**
     * Fills of this user's resting orders: the engine matched them because
     * someone else's order or a venue's book arrived. Fills the user took
     * with a new order were already announced by toastPlaced.
     */
    private toastMakerFills(trades: ExchangeTrade[]) {
        const userId = this.s.userId;
        for (const tr of trades) {
            const mine: Side[] = [];
            if (tr.buy_user_id === userId) mine.push('buy');
            if (tr.sell_user_id === userId) mine.push('sell');
            for (const side of mine) {
                if (side === tr.taker_side) continue;
                this.toast(side, t('market.toast.makerFill.title'), t('market.toast.makerFill', {
                    side: sideWord(side), qty: this.fmtQty(tr.quantity, baseOf(tr.symbol)), base: baseOf(tr.symbol),
                    price: this.fmtPrice(tr.price), counterparty: this.counterparty(tr, side),
                }), 9000);
            }
        }
    }

    /** Who was on the other side of `side` in a trade: a venue, the user themself, or another user. */
    counterparty(tr: ExchangeTrade, side: Side): string {
        if (tr.venue) return providerLabel(tr.venue);
        const other = side === 'buy' ? tr.sell_user_id : tr.buy_user_id;
        return other === this.s.userId ? t('market.counterparty.self') : this.userName(other);
    }

    /** A venue that filled less than it was asked for, in the bot's words. */
    private toastHedges(hedges: any[] | undefined, base: string) {
        for (const h of hedges || []) {
            if (num(h.executed_quantity) >= num(h.requested_quantity) && h.requested_quantity !== '0') continue;
            this.toast('error', t('market.toast.hedge.title', { venue: providerLabel(h.venue) }), t('market.toast.hedge', {
                executed: this.fmtQty(h.executed_quantity), requested: this.fmtQty(h.requested_quantity), base,
                reason: h.reason || t(`market.hedge.status.${['none', 'failed', 'refused', 'unconfirmed', 'timeout', 'partial'].includes(h.status) ? h.status : 'other'}`),
            }), 12000);
        }
    }

    // ---- Order book ----

    /** One side of the book at the current grouping. */
    bookRows(side: BookSide): BookRow[] {
        const d = this.s.depth;
        return groupLevels((d && (side === 'bid' ? d.bids : d.asks)) || [], side, this.s.group);
    }

    /** Whether this user has an open order that the row covers. */
    hasMine(side: BookSide, row: BookRow): boolean {
        const orderSide = side === 'bid' ? 'buy' : 'sell';
        for (const o of this.s.open.values()) {
            if (o.side === orderSide && rowCovers(side, row, num(o.price), this.s.group)) return true;
        }
        return false;
    }

    /** The levels an order on `side` would take from: asks for a buy, bids for a sell. */
    takerLevels(side: Side): BookLevel[] {
        const d = this.s.depth;
        return (d && (side === 'buy' ? d.asks : d.bids)) || [];
    }

    bestPrices(): { bid: number | null; ask: number | null } {
        const d = this.s.depth;
        return {
            bid: d && d.bids && d.bids[0] ? num(d.bids[0].price) : null,
            ask: d && d.asks && d.asks[0] ? num(d.asks[0].price) : null,
        };
    }

    lastPrice(): number | null {
        const s = this.s;
        if (s.trades[0]) return num(s.trades[0].price);
        return s.depth && s.depth.last_price ? num(s.depth.last_price) : null;
    }

    /**
     * The market price: the midpoint of the best bid and best ask in the
     * consolidated book - every provider's liquidity plus users' orders - so it
     * moves whenever any venue's book does. The last trade price is shown too,
     * but only as what it is: on a market where most liquidity is venues' and
     * trades are occasional, it sits frozen while the books move under it.
     * One-sided book: that side. Empty book: the last trade, if any.
     */
    marketPrice(): number | null {
        const { bid, ask } = this.bestPrices();
        if (bid !== null && ask !== null) return (bid + ask) / 2;
        return ask ?? bid ?? this.lastPrice();
    }

    quote(): Quote {
        const { bid, ask } = this.bestPrices();
        const spread = bid !== null && ask !== null ? ask - bid : null;
        const mid = bid !== null && ask !== null ? (ask + bid) / 2 : null;
        return { last: this.lastPrice(), bid, ask, market: this.marketPrice(), spread, mid };
    }

    private trackMarket() {
        const s = this.s;
        const market = this.marketPrice();
        if (market !== null && s.marketPrev !== null && market !== s.marketPrev) {
            s.marketDirection = market > s.marketPrev ? 1 : -1;
        }
        s.marketPrev = market;
        if (market !== null) this.tickCandle(market);
    }

    // ---- Chart ----

    setChartTab(tab: ChartTab) {
        this.s.chartTab = tab;
        this.render();
    }

    setCandleInterval(interval: CandleInterval) {
        if (interval === this.s.interval) return;
        this.s.interval = interval;
        writeStore(INTERVAL_KEY, interval);
        void this.loadCandles();
    }

    loadCandles = async () => {
        const s = this.s;
        const symbol = s.symbol;
        const interval = s.interval;
        if (!symbol) return;
        s.candles = [];
        s.candlesLoaded = false;
        s.candlesLoading = true;
        s.candleSeq++;
        this.render();
        try {
            const data = await marketApi.candles(symbol, interval);
            if (s.symbol !== symbol || s.interval !== interval) return;
            s.candles = (data.candles || []).map((c) => ({
                time: num(c.time), open: num(c.open), high: num(c.high), low: num(c.low), close: num(c.close), volume: num(c.volume),
            }));
            const d = data.summary;
            s.summary = d ? {
                open: num(d.open), high: num(d.high), low: num(d.low), close: num(d.close),
                volume: num(d.volume), quoteVolume: num(d.quote_volume),
            } : null;
        } catch { /* an API without candles still gets live ones from the book */ }
        if (s.symbol !== symbol || s.interval !== interval) return;
        s.candlesLoading = false;
        s.candlesLoaded = true;
        s.candleSeq++;
        const market = this.marketPrice();
        if (market !== null) this.tickCandle(market);
        this.render();
    };

    /** Moves the current candle, and the 24h figures, with the market price. */
    private tickCandle(price: number) {
        const s = this.s;
        if (!s.candlesLoaded) return;
        const width = CANDLE_INTERVALS[s.interval];
        const start = Math.floor(Date.now() / 1000 / width) * width;
        const last = s.candles.at(-1);
        if (last && last.time === start) {
            s.candles[s.candles.length - 1] = { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price };
        } else if (!last || start > last.time) {
            const open = last && last.time === start - width ? last.close : price;
            s.candles.push({ time: start, open, high: Math.max(open, price), low: Math.min(open, price), close: price, volume: 0 });
        }
        // Only ever moved, never started here: minutes of the book are not a day.
        const d = s.summary;
        if (d) s.summary = { ...d, high: Math.max(d.high, price), low: Math.min(d.low, price), close: price };
    }

    /** New trades' volume onto the candles they fall in, and onto the day. */
    private addCandleVolume(trades: ExchangeTrade[]) {
        const s = this.s;
        if (!s.candlesLoaded || !s.candles.length) return;
        const width = CANDLE_INTERVALS[s.interval];
        for (const tr of trades) {
            const at = Math.floor(Date.parse(tr.executed_at) / 1000 / width) * width;
            const i = s.candles.findIndex((c) => c.time === at);
            if (i >= 0) s.candles[i] = { ...s.candles[i], volume: s.candles[i].volume + num(tr.quantity) };
            if (s.summary) {
                s.summary = {
                    ...s.summary,
                    volume: s.summary.volume + num(tr.quantity),
                    quoteVolume: s.summary.quoteVolume + num(tr.quantity) * num(tr.price),
                };
            }
        }
    }

    /**
     * Which of the four live-mode states the exchange is in. Live needs the
     * engine and the bot both switched on; with the bot simulating, the whole
     * path runs and nothing reaches a venue.
     */
    modeState(): ModeState | null {
        const s = this.s;
        if (!s.mode) return null;
        if (s.mode !== 'live') return 'demo';
        const h = s.hedging;
        if (!h || !h.bot_running) return 'liveNoBot';
        if (!h.available || !h.enabled) return 'liveOff';
        return h.simulated ? 'liveSimulated' : 'liveReal';
    }

    loadStatus = async () => {
        try {
            const data = await marketApi.status();
            const s = this.s;
            s.hedging = data.hedging;
            const changed = data.trading_mode && data.trading_mode !== s.mode;
            if (data.trading_mode) s.mode = data.trading_mode;
            this.render();
            if (changed) await this.loadRealBalances();
        } catch { /* the WebSocket status says the same thing louder */ }
    };

    /** Grouping steps from 10^-5 to 10^-2 of the price: 1 to 1,000 for a 100,000 Toman pair. */
    private updateGroupOptions() {
        const s = this.s;
        const { bid, ask } = this.bestPrices();
        const ref = ask || bid || this.lastPrice();
        if (!ref) return;
        const exp = Math.floor(Math.log10(ref));
        const key = `${s.symbol}|${exp}`;
        if (s.groupFor === key) return;
        s.groupFor = key;
        const steps = [5, 4, 3, 2].map((k) => Math.pow(10, exp - k)).filter((step) => step >= 1e-8);
        if (s.group && !steps.some((step) => Math.abs(step - s.group) < 1e-12)) s.group = 0;
        s.groupSteps = steps;
    }

    setGroup(value: string) {
        this.s.group = Number(value) || 0;
        this.render();
    }

    setView(view: BookView) {
        this.s.view = view;
        this.render();
    }

    setTab(tab: OrdersTab) {
        this.s.tab = tab;
        this.render();
    }

    // A row sets the price for both sides, and the amount a taker would need
    // to clear the book down to it.
    rowClick(side: BookSide, price: number, cumulative: number) {
        this.setPrice(price);
        const taker: Side = side === 'ask' ? 'buy' : 'sell';
        this.s.forms[taker].amount = toAmount(cumulative);
        this.recalc(taker, 'amount');
        this.render();
    }

    // ---- Which balances this page trades against ----
    //
    // Demo: the selected user's balance inside the exchange engine - test funds.
    // Live: the bot's real balances on every exchange, summed. An order in live
    // mode is paid for with that real money (the engine places it on the venues
    // through the bot), so showing test funds there - and letting them size an
    // order - made fake money look spendable.
    isLive(): boolean { return this.s.mode === 'live'; }
    shownBalances(): Balance[] {
        return this.isLive() ? (this.s.real ? this.s.real.balances : []) : this.s.balances;
    }

    balanceOf(asset: string): { available: number; locked: number } {
        const b = this.shownBalances().find((x) => x.asset === asset);
        return { available: b ? num(b.available) : 0, locked: b ? num(b.locked) : 0 };
    }

    /** What an order on `side` pays with: Toman for a buy, the base asset for a sell. */
    fundingAsset(side: Side): string {
        return side === 'buy' ? 'IRT' : baseOf(this.s.symbol);
    }

    loadRealBalances = async () => {
        if (!this.isLive()) return;
        try {
            const data = await marketApi.realBalances();
            this.s.real = { balances: data.balances || [], unavailable: data.unavailable || [] };
        } catch {
            this.s.real = this.s.real || { balances: [], unavailable: [] };
        }
        this.render();
    };

    // ---- Order forms ----

    setField(side: Side, role: FormRole, value: string) {
        this.s.forms[side][role] = value;
        this.recalc(side, role);
        this.render();
    }

    // When one field changes, the other of amount and total follows it.
    private recalc(side: Side, changed: FormRole) {
        const f = this.s.forms[side];
        const price = num(parseAmount(f.price));
        if (changed === 'total') {
            const total = num(parseAmount(f.total));
            f.amount = price > 0 && total > 0 ? toAmount(total / price) : '';
        } else {
            const amount = num(parseAmount(f.amount));
            f.total = price > 0 && amount > 0 ? String(Math.round(price * amount * 100) / 100) : '';
        }
    }

    private setPrice(price: number, side?: Side) {
        const value = toAmount(price) || String(price);
        for (const s of side ? [side] : (['buy', 'sell'] as Side[])) {
            this.s.forms[s].price = value;
            this.recalc(s, 'price');
        }
    }

    /** The best price an order on `side` could take: the ask for a buy, the bid for a sell. */
    bestFor(side: Side): number | null {
        const { bid, ask } = this.bestPrices();
        return side === 'buy' ? ask : bid;
    }

    bestClick(side: Side) {
        const best = this.bestFor(side);
        if (best) this.setPrice(best, side);
        this.render();
    }

    fillPercent(side: Side, pct: number) {
        const f = this.s.forms[side];
        const price = num(parseAmount(f.price)) || this.bestFor(side) || 0;
        if (!f.price && price) f.price = toAmount(price);
        const avail = this.balanceOf(this.fundingAsset(side)).available * (pct / 100);
        f.amount = side === 'buy' ? (price > 0 ? toAmount(avail / price) : '') : toAmount(avail);
        this.recalc(side, 'amount');
        this.render();
    }

    async placeOrder(side: Side) {
        const s = this.s;
        const f = s.forms[side];
        const price = parseAmount(f.price);
        const quantity = parseAmount(f.amount);
        if (!s.userId) { this.toast('error', t('market.toast.rejected.title'), t('market.form.hint.selectUser')); return; }
        if (!price || !quantity) { this.toast('error', t('market.toast.rejected.title'), t('market.form.invalid')); return; }
        // Real money leaves the exchange's venue accounts for any part that
        // takes venue liquidity: said once more, in so many words.
        if (this.modeState() === 'liveReal' && walkBook(this.takerLevels(side), side, num(price), num(quantity)).fromVenues > 0 &&
            !window.confirm(t('market.confirmLive', { cap: fmtToman(s.hedging.max_notional_toman) }))) return;

        s.busy[side] = true;
        this.render();
        try {
            const data = await marketApi.place({ user_id: s.userId, symbol: s.symbol, side, price, quantity });
            for (const o of data.orders || []) this.upsertOrder(o);
            this.addMyTrades(data.trades || []);
            this.toastPlaced(data.order);
            this.toastHedges(data.event && data.event.hedges, baseOf(s.symbol));
            f.amount = '';
            f.total = '';
        } catch (err) {
            if (err instanceof ApiError) this.toast('error', t('market.toast.rejected.title'), refusalText(err), 9000);
            else this.toast('error', t('market.toast.error.title'), (err as Error).message);
        } finally {
            s.busy[side] = false;
            this.render();
        }
    }

    // ---- Balances ----

    async topUp() {
        const s = this.s;
        if (!s.userId) return;
        s.faucetBusy = true;
        this.render();
        try {
            const data = await marketApi.faucet(s.userId, s.symbol);
            s.balances = data.balances || s.balances;
            const base = baseOf(s.symbol);
            this.toast('info', t('market.faucet.title'), t('market.faucet.done', {
                toman: fmtToman(data.credited.IRT), base: this.fmtQty(data.credited[base]), asset: base,
            }));
        } catch (err) {
            this.toast('error', t('market.faucet.failed'), errorText(err, 'market.faucet.failed'));
        } finally {
            s.faucetBusy = false;
            this.render();
        }
    }

    // ---- Market trades ----

    private addMarketTrades(trades: ExchangeTrade[], flash: boolean) {
        const s = this.s;
        const fresh = trades.filter((tr) => !s.tradeIds.has(tr.id));
        if (!fresh.length) return;
        const before = this.lastPrice();
        fresh.forEach((tr) => s.tradeIds.add(tr.id));
        // Newest first; an event lists its fills in the order they happened.
        s.trades = [...fresh.reverse(), ...s.trades]
            .sort((a, b) => Date.parse(b.executed_at) - Date.parse(a.executed_at))
            .slice(0, TRADES_KEPT);
        s.tradeIds = new Set(s.trades.map((tr) => tr.id));
        const after = this.lastPrice();
        if (before !== null && after !== null && after !== before) s.lastDirection = after > before ? 1 : -1;
        s.flashIds = flash ? new Set(fresh.map((tr) => tr.id)) : null;
        this.trackMarket();
        if (flash) this.addCandleVolume(fresh);
        this.render();
    }

    // ---- The user's orders and trades ----

    private upsertOrder(o: ExchangeOrder) {
        const s = this.s;
        if (o.user_id !== s.userId || o.symbol !== s.symbol) return;
        const current = s.open.get(o.id) || s.history.find((h) => h.id === o.id);
        if (!newer(o, current)) return;
        if (isOpen(o)) {
            s.open.set(o.id, o);
        } else {
            s.open.delete(o.id);
            s.history = [o, ...s.history.filter((h) => h.id !== o.id)].slice(0, 100);
        }
    }

    private addMyTrades(trades: ExchangeTrade[]) {
        const s = this.s;
        const seen = new Set(s.myTrades.map((tr) => tr.id));
        const fresh = trades.filter((tr) => !seen.has(tr.id) && tr.symbol === s.symbol);
        s.myTrades = [...fresh, ...s.myTrades]
            .sort((a, b) => Date.parse(b.executed_at) - Date.parse(a.executed_at))
            .slice(0, 200);
    }

    async cancelOrder(id: string) {
        const s = this.s;
        s.cancelling.add(id);
        this.render();
        try {
            const { order: o } = await marketApi.cancel(id, s.userId);
            if (o) {
                this.upsertOrder(o);
                this.toast('info', t('market.toast.cancelled.title'), t('market.toast.cancelled', {
                    side: sideWord(o.side), qty: this.fmtQty(num(o.quantity) - num(o.filled_quantity), baseOf(o.symbol)), base: baseOf(o.symbol), price: this.fmtPrice(o.price),
                }));
            }
        } catch (err) {
            this.toast('error', t('market.toast.rejected.title'), refusalText(err));
        } finally {
            s.cancelling.delete(id);
            this.render();
        }
    }

    async cancelAll() {
        const s = this.s;
        const count = s.open.size;
        if (!count || !window.confirm(t('market.orders.confirmCancelAll', { count: format.number(count), pair: pairLabel(s.symbol) }))) return;
        s.cancelAllBusy = true;
        this.render();
        try {
            const data = await marketApi.cancelAll(s.userId, s.symbol);
            if ((data.cancelled || 0) > 0) {
                this.toast('info', t('market.toast.cancelled.title'), t('market.orders.cancelledCount', { count: format.number(data.cancelled || 0) }));
            }
            if ((data.failed || 0) > 0) {
                const reasons = [...new Set((data.failures || []).map(rejectionText))].join(' · ');
                this.toast('error', t('market.orders.cancelFailed.title'), t('market.orders.cancelFailed', {
                    count: format.number(data.failed || 0), reasons,
                }), 12000);
            }
            await this.loadUserData();
        } catch (err) {
            this.toast('error', t('market.toast.error.title'), refusalText(err));
        } finally {
            s.cancelAllBusy = false;
            this.render();
        }
    }

    private async loadUserData() {
        const s = this.s;
        s.open = new Map();
        s.history = [];
        s.myTrades = [];
        if (!s.userId || !s.symbol) { this.render(); return; }
        try {
            const [open, history, trades, balances] = await Promise.all([
                marketApi.orders(s.userId, s.symbol, 'open'),
                marketApi.orders(s.userId, s.symbol, 'history'),
                marketApi.userTrades(s.userId, s.symbol),
                marketApi.balances(s.userId),
            ]);
            for (const o of [...history.orders].reverse()) this.upsertOrder(o);
            for (const o of open.orders) this.upsertOrder(o);
            this.addMyTrades(trades.trades);
            s.balances = balances.balances;
            this.deps.status.hideError();
        } catch (err) {
            this.deps.status.showError(errorText(err, 'error.requestFailed'));
        }
        this.render();
    }

    private async loadMarketTrades() {
        const s = this.s;
        s.trades = [];
        s.tradeIds = new Set();
        s.flashIds = null;
        s.lastDirection = 0;
        // A new pair's price is not a move from the old pair's.
        s.marketPrev = null;
        s.marketDirection = 0;
        this.render();
        try {
            const data = await marketApi.marketTrades(s.symbol || '', TRADES_KEPT);
            this.addMarketTrades(data.trades, false);
        } catch (err) {
            this.deps.status.showError(errorText(err, 'error.requestFailed'));
        }
        this.trackMarket();
        this.render();
    }

    // ---- Live ----

    private connect() {
        if (this.disposed) return;
        const ws = new WebSocket(wsUrl('/exchange/ws'));
        this.ws = ws;
        const s = this.s;
        ws.addEventListener('open', () => {
            if (this.ws !== ws) return;
            s.wsOpen = true;
            s.wsDelay = 1000;
            this.subscribeFeed();
            this.renderStatus();
        });
        ws.addEventListener('message', (e) => {
            if (this.ws !== ws) return;
            let message: any;
            try { message = JSON.parse(e.data); } catch { return; }
            this.onMessage(message);
        });
        ws.addEventListener('close', () => {
            if (this.ws !== ws || this.disposed) return;
            s.wsOpen = false;
            this.renderStatus();
            this.later(() => this.connect(), s.wsDelay);
            s.wsDelay = Math.min(s.wsDelay * 2, 10_000);
        });
    }

    private subscribeFeed() {
        const s = this.s;
        if (!s.wsOpen || !this.ws) return;
        s.subscribedAt = Date.now();
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol: s.symbol, user_id: s.userId }));
    }

    private onMessage(message: any) {
        const s = this.s;
        if (message.type === 'status') {
            s.kafka = message.kafka;
            this.renderStatus();
        } else if (message.type === 'depth') {
            if (!message.depth || message.depth.symbol !== s.symbol) return;
            s.depth = message.depth;
            if (message.depth.trading_mode && message.depth.trading_mode !== s.mode) {
                s.mode = message.depth.trading_mode;
                void this.loadRealBalances();
            }
            this.updateGroupOptions();
            this.trackMarket();
            this.render();
            this.renderStatus();
        } else if (message.type === 'trades') {
            if (message.symbol === s.symbol) this.addMarketTrades(message.trades, true);
        } else if (message.type === 'user') {
            if (message.symbol !== s.symbol) return;
            for (const o of message.orders) this.upsertOrder(o);
            this.addMyTrades(message.trades);
            this.toastMakerFills(message.trades);
            if (!message.command_id) {
                this.toastHedges((message.hedges || []).filter((h: any) => num(h.executed_quantity) > 0 && num(h.executed_quantity) < num(h.requested_quantity)), baseOf(message.symbol));
            }
            this.render();
        } else if (message.type === 'balances') {
            if (message.user_id !== s.userId) return;
            // Kept even in live mode - it is what the engine checks - but not
            // what the page shows or sizes orders from there.
            s.balances = message.balances;
            this.render();
        }
    }

    renderStatus = () => {
        if (this.disposed) return;
        const s = this.s;
        const kafka = s.kafka;
        let notice: Message | null = null;
        let red = false;
        if (kafka && !kafka.connected) {
            notice = msg('market.notice.kafka', { error: kafka.error || t('common.unknown') });
            red = true;
        } else if (!s.depth && s.wsOpen && Date.now() - s.subscribedAt > 3000) {
            notice = msg('market.notice.noBook', { pair: pairLabel(s.symbol) });
        } else if (!s.users.length && s.usersLoaded) {
            notice = msg('market.notice.noUsers');
        }
        const next = notice ? { message: notice, red } : null;
        if (JSON.stringify(s.notice) !== JSON.stringify(next)) {
            s.notice = next;
            this.render();
        }

        const { status } = this.deps;
        if (!s.wsOpen) status.setStatus(false, msg('market.reconnecting'));
        else if (kafka && !kafka.connected) status.setStatus(false, msg('market.kafkaDown'));
        else if (Date.now() - s.statusAt > 1000) {
            s.statusAt = Date.now();
            status.setStatus(true, msg('market.live', { time: format.time(s.depth ? s.depth.built_at : new Date()) }));
        }
    };

    onLanguageChange() {
        this.s.statusAt = 0;
        this.renderStatus();
    }

    // ---- Selection ----

    selectSymbol(symbol: string) {
        const s = this.s;
        s.symbol = symbol;
        s.depth = null;
        s.groupFor = null;
        s.group = 0;
        writeStore(SYMBOL_KEY, symbol);
        this.deps.setSymbolParam(symbol);
        s.forms = { buy: emptyForm(), sell: emptyForm() };
        s.summary = null;
        this.render();
        this.subscribeFeed();
        void this.loadMarketTrades();
        void this.loadUserData();
        void this.loadCandles();
    }

    /** A ?symbol= arriving after load (a link to this page from this page) switches the pair. */
    followUrl(wanted: string | null) {
        const s = this.s;
        if (!s.inited || !wanted || wanted === s.symbol) return;
        if (!s.symbols.includes(wanted)) {
            if (!/^[A-Z0-9]{2,15}_IRT$/.test(wanted)) return;
            s.symbols = [...s.symbols, wanted];
        }
        this.selectSymbol(wanted);
    }

    selectUser(userId: string) {
        const s = this.s;
        s.userId = userId || null;
        if (userId) writeStore(USER_KEY, userId);
        this.render();
        this.subscribeFeed();
        void this.loadUserData();
    }

    private async init(urlSymbol: string | null, generation: number) {
        const [symbols, users] = await Promise.all([settle(marketApi.symbols()), settle(marketApi.users())]);
        if (this.disposed || generation !== this.generation) return;
        const s = this.s;
        s.symbols = symbols.ok && symbols.data.symbols?.length ? [...symbols.data.symbols] : ['USDT_IRT'];
        if (users.ok) {
            s.users = users.data.users;
            s.usersLoaded = true;
        } else {
            this.deps.status.showError(errorText(users.error, 'error.requestFailed'));
        }

        const wanted = urlSymbol || readStore(SYMBOL_KEY) || 'USDT_IRT';
        if (!s.symbols.includes(wanted) && /^[A-Z0-9]{2,15}_IRT$/.test(wanted)) s.symbols.push(wanted);
        s.symbol = s.symbols.includes(wanted) ? wanted : s.symbols[0];
        const storedUser = readStore(USER_KEY);
        s.userId = s.users.some((u) => u.id === storedUser) ? storedUser : (s.users[0] && s.users[0].id) || null;
        s.inited = true;

        this.render();
        this.connect();
        void this.loadMarketTrades();
        void this.loadUserData();
        void this.loadStatus();
        void this.loadCandles();
    }
}
