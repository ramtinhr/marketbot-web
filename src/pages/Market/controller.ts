import type { usePageStatus } from '../../components/Layout';
import { format, t } from '../../i18n';
import { fetchJSON, sendJSON, wsUrl, type JsonResult } from '../../lib/api';
import { providerLabel, readStore, writeStore } from '../../lib/ui';

const INTENT = { 'x-marketbot-intent': 'market-order' };

export const BOOK_ROWS = 16;
const TRADES_KEPT = 60;
const SYMBOL_KEY = 'marketbot-market-symbol';
const USER_KEY = 'marketbot-market-user';

// The engine's refusal codes; the text is the page's to say.
const REJECT_KEYS: Record<string, string> = {
    invalid_order: 'market.reject.invalidOrder',
    unknown_user: 'market.reject.unknownUser',
    insufficient_balance: 'market.reject.insufficientBalance',
    order_not_found: 'market.reject.orderNotFound',
    order_closed: 'market.reject.orderClosed',
    internal_error: 'market.reject.internalError',
};

export type Side = 'buy' | 'sell';
export type BookSide = 'bid' | 'ask';
export type BookView = 'both' | 'bids' | 'asks';
export type OrdersTab = 'open' | 'history' | 'trades';
export type FormRole = 'price' | 'amount' | 'total';
export type ModeState = 'demo' | 'liveNoBot' | 'liveOff' | 'liveSimulated' | 'liveReal';

export interface BookRow { price: number; quantity: number; user: number; venues: string[] }
export interface FormValues { price: string; amount: string; total: string }
export interface Toast { id: number; kind: string; title: string; body: string; leaving: boolean }

interface State {
    inited: boolean;
    symbols: string[];
    symbol: string | null;
    users: any[];
    usersLoaded: boolean;
    userId: string | null;
    depth: any;
    trades: any[];
    tradeIds: Set<string>;
    flashIds: Set<string> | null;
    lastDirection: number;
    // The market price as last computed, and which way it last moved - so
    // the headline ticks up or down with the books, not only on a trade.
    marketPrev: number | null;
    marketDirection: number;
    open: Map<string, any>;
    history: any[];
    myTrades: any[];
    balances: any[];
    real: { balances: any[]; unavailable: string[] } | null;
    group: number;
    groupFor: string | null;
    groupSteps: number[] | null;
    view: BookView;
    tab: OrdersTab;
    wsOpen: boolean;
    wsDelay: number;
    kafka: any;
    subscribedAt: number;
    statusAt: number;
    notice: { text: string; red: boolean } | null;
    busy: Record<Side, boolean>;
    forms: Record<Side, FormValues>;
    faucetBusy: boolean;
    cancelAllBusy: boolean;
    cancelling: Set<string>;
    toasts: Toast[];
    // "demo" or "live" from the engine's books; whether the bot would place
    // venue orders from /exchange/status.
    mode: string | null;
    hedging: any;
}

export interface MarketDeps {
    rerender: () => void;
    status: ReturnType<typeof usePageStatus>;
    setSymbolParam: (symbol: string) => void;
}

// ---- Small helpers ----

export const baseOf = (symbol: unknown) => String(symbol || '').split('_')[0] || '';
export const quoteLabel = () => t('common.toman');
export const pairLabel = (symbol: unknown) => `${baseOf(symbol)} / ${quoteLabel()}`;
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Persian and Arabic-Indic digits, grouping commas and the Persian decimal
// mark all mean the same number; the engine wants plain ASCII decimals.
function normalizeDigits(raw: unknown): string {
    return String(raw || '')
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[٫]/g, '.')
        .replace(/[,٬\s]/g, '');
}
export function parseAmount(raw: unknown): string | null {
    const s = normalizeDigits(raw);
    return /^\d+(\.\d{1,8})?$/.test(s) && Number(s) > 0 ? s : null;
}
// Rounded down to 8 places, written without an exponent or trailing zeros.
export function toAmount(n: number): string {
    if (!(n > 0) || !Number.isFinite(n)) return '';
    const floored = Math.floor(n * 1e8 + 1e-6) / 1e8;
    return floored > 0 ? floored.toFixed(8).replace(/\.?0+$/, '') : '';
}

// ---- Number formats: decided by the asset, never by the number's size ----
//
// Sizing decimals by magnitude put 3.0099, 92.56 and 663 in one column and
// Toman prices to two decimals. Each asset now has one precision, shown in
// full (trailing zeros kept) so a column lines up: Toman is whole - it has
// no sub-unit - and each coin gets the decimals it actually trades in.
const ASSET_DIGITS: Record<string, number> = {
    IRT: 0, USDT: 2, USDC: 2,
    BTC: 8, ETH: 6, BNB: 4, SOL: 4,
    XRP: 2, TRX: 2, DOGE: 2, ADA: 2, SHIB: 0,
};
const DEFAULT_ASSET_DIGITS = 4;
const assetDigits = (asset: unknown) => ASSET_DIGITS[String(asset || '').toUpperCase()] ?? DEFAULT_ASSET_DIGITS;
const blank = (v: unknown) => v === null || v === undefined || v === '' || !Number.isFinite(Number(v));

/**
 * An amount of `asset` at that asset's precision. `floor` rounds down rather
 * than to nearest - for balances, which must never read as more than is
 * there to spend.
 */
export function fmtAsset(v: unknown, asset: unknown, { floor = false } = {}): string {
    if (blank(v)) return '—';
    const digits = assetDigits(asset);
    let n = num(v);
    if (floor) {
        const f = 10 ** digits;
        n = Math.floor(n * f + 1e-9) / f;
    }
    return format.number(n, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export const fmtToman = (v: unknown) => fmtAsset(v, 'IRT');
export const fmtTime = (v: unknown) => format.time(v);
export const sideWord = (side: string) => t(side === 'buy' ? 'market.side.buy' : 'market.side.sell');
export const isOpen = (o: any) => o.status === 'open' || o.status === 'partial';

export function rejectionText(data: any): string {
    return data && REJECT_KEYS[data.reason] ? t(REJECT_KEYS[data.reason]) : (data && data.error) || t('error.requestFailed');
}

function send(method: string, path: string, body?: unknown): Promise<JsonResult> {
    return sendJSON(path, method, body, INTENT);
}

/** Newer state wins; an answer that arrives after a later event must not roll it back. */
function newer(a: any, b: any): boolean {
    if (!b) return true;
    const ta = Date.parse(a.updated_at);
    const tb = Date.parse(b.updated_at);
    if (ta !== tb) return ta > tb;
    return num(a.filled_quantity) >= num(b.filled_quantity) && !(isOpen(a) && !isOpen(b));
}

const emptyForm = (): FormValues => ({ price: '', amount: '', total: '' });

export class MarketController {
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
    };

    deps: MarketDeps;
    private ws: WebSocket | null = null;
    private disposed = false;
    private timers = new Set<number>();
    private toastSeq = 0;
    private generation = 0;

    constructor(deps: MarketDeps) {
        this.deps = deps;
    }

    private render() { if (!this.disposed) this.deps.rerender(); }

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
        const d = digits === undefined ? this.priceDigits() : digits;
        return format.number(num(v), { minimumFractionDigits: d, maximumFractionDigits: d });
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
    private toastPlaced(order: any) {
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
    private toastMakerFills(trades: any[]) {
        const userId = this.s.userId;
        for (const tr of trades) {
            const mine: Side[] = [];
            if (tr.buy_user_id === userId) mine.push('buy');
            if (tr.sell_user_id === userId) mine.push('sell');
            for (const side of mine) {
                if (side === tr.taker_side) continue;
                const other = side === 'buy' ? tr.sell_user_id : tr.buy_user_id;
                const counterparty = tr.venue
                    ? providerLabel(tr.venue)
                    : other === userId ? t('market.counterparty.self') : this.userName(other);
                this.toast(side, t('market.toast.makerFill.title'), t('market.toast.makerFill', {
                    side: sideWord(side), qty: this.fmtQty(tr.quantity, baseOf(tr.symbol)), base: baseOf(tr.symbol),
                    price: this.fmtPrice(tr.price), counterparty,
                }), 9000);
            }
        }
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

    /** Levels aggregated to the grouping step: bids down, asks up, so a row never promises a better price. */
    groupLevels(levels: any[], side: BookSide): BookRow[] {
        const step = this.s.group;
        if (!step) return levels.map((l) => ({ price: num(l.price), quantity: num(l.quantity), user: num(l.user_quantity), venues: l.venues || [] }));
        const out = new Map<string, BookRow>();
        for (const l of levels) {
            const p = num(l.price);
            const k = side === 'bid' ? Math.floor(p / step + 1e-9) * step : Math.ceil(p / step - 1e-9) * step;
            const key = k.toFixed(8);
            const agg = out.get(key) || { price: Number(key), quantity: 0, user: 0, venues: [] };
            agg.quantity += num(l.quantity);
            agg.user += num(l.user_quantity);
            for (const v of l.venues || []) if (!agg.venues.includes(v)) agg.venues.push(v);
            out.set(key, agg);
        }
        return [...out.values()];
    }

    /** Whether this user has an open order that the row covers. */
    hasMine(side: BookSide, row: BookRow): boolean {
        const group = this.s.group;
        const orderSide = side === 'bid' ? 'buy' : 'sell';
        for (const o of this.s.open.values()) {
            if (o.side !== orderSide) continue;
            const p = num(o.price);
            if (!group) { if (p === row.price) return true; continue; }
            if (side === 'bid' ? (p >= row.price && p < row.price + group) : (p <= row.price && p > row.price - group)) return true;
        }
        return false;
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

    private trackMarket() {
        const s = this.s;
        const market = this.marketPrice();
        if (market !== null && s.marketPrev !== null && market !== s.marketPrev) {
            s.marketDirection = market > s.marketPrev ? 1 : -1;
        }
        s.marketPrev = market;
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
            const { ok, data } = await fetchJSON('/exchange/status');
            if (!ok) return;
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
    shownBalances(): any[] {
        return this.isLive() ? (this.s.real ? this.s.real.balances : []) : this.s.balances;
    }

    balanceOf(asset: string): { available: number; locked: number } {
        const b = this.shownBalances().find((x) => x.asset === asset);
        return { available: b ? num(b.available) : 0, locked: b ? num(b.locked) : 0 };
    }

    loadRealBalances = async () => {
        if (!this.isLive()) return;
        try {
            const { ok, data } = await fetchJSON('/exchange/real-balances');
            if (!ok) throw new Error(data.error || t('error.requestFailed'));
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

    /** How much of an order the book on screen says would be taken from venues. */
    private venueShare(side: Side, limit: number, qty: number): number {
        const d = this.s.depth;
        const levels: any[] = (d && (side === 'buy' ? d.asks : d.bids)) || [];
        let left = qty;
        let fromVenues = 0;
        for (const l of levels) {
            const p = num(l.price);
            if (left <= 0 || (side === 'buy' ? p > limit : p < limit)) break;
            const take = Math.min(left, num(l.quantity));
            fromVenues += take * Math.max(0, num(l.quantity) - num(l.user_quantity)) / Math.max(num(l.quantity), 1e-12);
            left -= take;
        }
        return fromVenues;
    }

    private setPrice(price: number, side?: Side) {
        const value = toAmount(price) || String(price);
        for (const s of side ? [side] : (['buy', 'sell'] as Side[])) {
            this.s.forms[s].price = value;
            this.recalc(s, 'price');
        }
    }

    bestClick(side: Side) {
        const { bid, ask } = this.bestPrices();
        const best = side === 'buy' ? ask : bid;
        if (best) this.setPrice(best, side);
        this.render();
    }

    fillPercent(side: Side, pct: number) {
        const f = this.s.forms[side];
        const price = num(parseAmount(f.price)) || (side === 'buy' ? this.bestPrices().ask : this.bestPrices().bid) || 0;
        if (!f.price && price) f.price = toAmount(price);
        const base = baseOf(this.s.symbol);
        const avail = this.balanceOf(side === 'buy' ? 'IRT' : base).available * (pct / 100);
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
        if (this.modeState() === 'liveReal' && this.venueShare(side, num(price), num(quantity)) > 0 &&
            !window.confirm(t('market.confirmLive', { cap: fmtToman(s.hedging.max_notional_toman) }))) return;

        s.busy[side] = true;
        this.render();
        try {
            const { ok, data } = await send('POST', '/exchange/orders', {
                user_id: s.userId, symbol: s.symbol, side, price, quantity,
            });
            if (!ok) {
                this.toast('error', t('market.toast.rejected.title'), rejectionText(data), 9000);
                return;
            }
            for (const o of data.orders || []) this.upsertOrder(o);
            this.addMyTrades(data.trades || []);
            this.toastPlaced(data.order);
            this.toastHedges(data.event && data.event.hedges, baseOf(s.symbol));
            f.amount = '';
            f.total = '';
        } catch (err) {
            this.toast('error', t('market.toast.error.title'), (err as Error).message);
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
            const { ok, data } = await send('POST', `/exchange/users/${s.userId}/faucet`, { symbol: s.symbol });
            if (!ok) throw new Error(data.error || t('market.faucet.failed'));
            s.balances = data.balances || s.balances;
            const base = baseOf(s.symbol);
            this.toast('info', t('market.faucet.title'), t('market.faucet.done', {
                toman: fmtToman(data.credited.IRT), base: this.fmtQty(data.credited[base]), asset: base,
            }));
        } catch (err) {
            this.toast('error', t('market.faucet.failed'), (err as Error).message);
        } finally {
            s.faucetBusy = false;
            this.render();
        }
    }

    // ---- Market trades ----

    private addMarketTrades(trades: any[], flash: boolean) {
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
        this.render();
    }

    // ---- The user's orders and trades ----

    private upsertOrder(o: any) {
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

    private addMyTrades(trades: any[]) {
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
            const { ok, data } = await send('POST', `/exchange/orders/${id}/cancel`, { user_id: s.userId });
            if (!ok) throw new Error(rejectionText(data));
            const o = data.order;
            if (o) {
                this.upsertOrder(o);
                this.toast('info', t('market.toast.cancelled.title'), t('market.toast.cancelled', {
                    side: sideWord(o.side), qty: this.fmtQty(num(o.quantity) - num(o.filled_quantity), baseOf(o.symbol)), base: baseOf(o.symbol), price: this.fmtPrice(o.price),
                }));
            }
        } catch (err) {
            this.toast('error', t('market.toast.rejected.title'), (err as Error).message);
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
            const { ok, data } = await send('POST', '/exchange/orders/cancel-all', { user_id: s.userId, symbol: s.symbol });
            if (!ok) throw new Error(rejectionText(data));
            if (data.cancelled > 0) {
                this.toast('info', t('market.toast.cancelled.title'), t('market.orders.cancelledCount', { count: format.number(data.cancelled) }));
            }
            if (data.failed > 0) {
                const reasons = [...new Set((data.failures || []).map((f: any) => rejectionText(f)))].join(' · ');
                this.toast('error', t('market.orders.cancelFailed.title'), t('market.orders.cancelFailed', {
                    count: format.number(data.failed), reasons,
                }), 12000);
            }
            await this.loadUserData();
        } catch (err) {
            this.toast('error', t('market.toast.error.title'), (err as Error).message);
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
        const user = encodeURIComponent(s.userId);
        const sym = encodeURIComponent(s.symbol);
        try {
            const [open, history, trades, balances] = await Promise.all([
                fetchJSON(`/exchange/orders?user_id=${user}&symbol=${sym}&scope=open&limit=200`),
                fetchJSON(`/exchange/orders?user_id=${user}&symbol=${sym}&scope=history&limit=100`),
                fetchJSON(`/exchange/trades?user_id=${user}&symbol=${sym}&limit=200`),
                fetchJSON(`/exchange/users/${user}/balances`),
            ]);
            for (const r of [open, history, trades, balances]) if (!r.ok) throw new Error(r.data.error || t('error.requestFailed'));
            for (const o of [...history.data.orders].reverse()) this.upsertOrder(o);
            for (const o of open.data.orders) this.upsertOrder(o);
            this.addMyTrades(trades.data.trades);
            s.balances = balances.data.balances;
            this.deps.status.hideError();
        } catch (err) {
            this.deps.status.showError((err as Error).message);
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
            const { ok, data } = await fetchJSON(`/exchange/trades?symbol=${encodeURIComponent(s.symbol || '')}&limit=${TRADES_KEPT}`);
            if (!ok) throw new Error(data.error || t('error.requestFailed'));
            this.addMarketTrades(data.trades, false);
        } catch (err) {
            this.deps.status.showError((err as Error).message);
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
            this.subscribe();
            this.renderStatus();
        });
        ws.addEventListener('message', (e) => {
            if (this.ws !== ws) return;
            let msg: any;
            try { msg = JSON.parse(e.data); } catch { return; }
            this.onMessage(msg);
        });
        ws.addEventListener('close', () => {
            if (this.ws !== ws || this.disposed) return;
            s.wsOpen = false;
            this.renderStatus();
            this.later(() => this.connect(), s.wsDelay);
            s.wsDelay = Math.min(s.wsDelay * 2, 10_000);
        });
    }

    private subscribe() {
        const s = this.s;
        if (!s.wsOpen || !this.ws) return;
        s.subscribedAt = Date.now();
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol: s.symbol, user_id: s.userId }));
    }

    private onMessage(msg: any) {
        const s = this.s;
        if (msg.type === 'status') {
            s.kafka = msg.kafka;
            this.renderStatus();
        } else if (msg.type === 'depth') {
            if (!msg.depth || msg.depth.symbol !== s.symbol) return;
            s.depth = msg.depth;
            if (msg.depth.trading_mode && msg.depth.trading_mode !== s.mode) {
                s.mode = msg.depth.trading_mode;
                void this.loadRealBalances();
            }
            this.updateGroupOptions();
            this.trackMarket();
            this.render();
            this.renderStatus();
        } else if (msg.type === 'trades') {
            if (msg.symbol === s.symbol) this.addMarketTrades(msg.trades, true);
        } else if (msg.type === 'user') {
            if (msg.symbol !== s.symbol) return;
            for (const o of msg.orders) this.upsertOrder(o);
            this.addMyTrades(msg.trades);
            this.toastMakerFills(msg.trades);
            if (!msg.command_id) this.toastHedges((msg.hedges || []).filter((h: any) => num(h.executed_quantity) > 0 && num(h.executed_quantity) < num(h.requested_quantity)), baseOf(msg.symbol));
            this.render();
        } else if (msg.type === 'balances') {
            if (msg.user_id !== s.userId) return;
            // Kept even in live mode - it is what the engine checks - but not
            // what the page shows or sizes orders from there.
            s.balances = msg.balances;
            this.render();
        }
    }

    renderStatus = () => {
        if (this.disposed) return;
        const s = this.s;
        const kafka = s.kafka;
        let noticeText: string | null = null;
        let red = false;
        if (kafka && !kafka.connected) {
            noticeText = t('market.notice.kafka', { error: kafka.error || t('common.unknown') });
            red = true;
        } else if (!s.depth && s.wsOpen && Date.now() - s.subscribedAt > 3000) {
            noticeText = t('market.notice.noBook', { pair: pairLabel(s.symbol) });
        } else if (!s.users.length && s.usersLoaded) {
            noticeText = t('market.notice.noUsers');
        }
        const next = noticeText ? { text: noticeText, red } : null;
        if (s.notice?.text !== next?.text || s.notice?.red !== next?.red) {
            s.notice = next;
            this.render();
        }

        const { status } = this.deps;
        if (!s.wsOpen) status.setStatus(false, t('market.reconnecting'));
        else if (kafka && !kafka.connected) status.setStatus(false, t('market.kafkaDown'));
        else if (Date.now() - s.statusAt > 1000) {
            s.statusAt = Date.now();
            status.setStatus(true, t('market.live', { time: format.time(s.depth ? s.depth.built_at : new Date()) }));
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
        this.render();
        this.subscribe();
        void this.loadMarketTrades();
        void this.loadUserData();
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
        this.subscribe();
        void this.loadUserData();
    }

    private async init(urlSymbol: string | null, generation: number) {
        const failed = (): JsonResult => ({ ok: false, status: 0, data: {} });
        const [symbols, users] = await Promise.all([
            fetchJSON('/exchange/symbols').catch(failed),
            fetchJSON('/exchange/users').catch(failed),
        ]);
        if (this.disposed || generation !== this.generation) return;
        const s = this.s;
        s.symbols = symbols.ok && symbols.data?.symbols?.length ? [...symbols.data.symbols] : ['USDT_IRT'];
        if (users.ok) {
            s.users = users.data.users;
            s.usersLoaded = true;
        } else {
            this.deps.status.showError(users.data.error || t('error.requestFailed'));
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
    }
}
