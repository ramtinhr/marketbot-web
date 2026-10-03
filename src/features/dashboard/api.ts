import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import { balancesApi } from '../balances/api';
import { profitApi, type PredictedProfit } from '../profit/api';

export const FALLBACK_SYMBOL = 'USDT_IRT';

export interface PriceSide {
    price: number;
    provider: string;
}

export interface BestPrice {
    best_bid: PriceSide | null;
    best_ask: PriceSide | null;
    spread: number;
    spread_pct: number;
}

export interface BestRoute {
    buy_provider: string;
    sell_provider: string;
    buy_price: number;
    buy_net: number;
    sell_net: number;
    net_per_unit: number;
    profit_pct: number;
    clears_min_profit?: boolean;
    trade_profit_toman?: number;
    trade_notional_toman: number;
    min_profit_toman?: number;
}

export type QuoteStatus = 'live' | 'stale' | 'no_quote' | 'circuit_open';

export interface ProviderQuote {
    code: string;
    status: QuoteStatus;
    fee_pct: number;
    has_quote: boolean;
    stale: boolean;
    age_s?: number;
    circuit_state?: string;
    order_circuit_state?: string;
    bid: number;
    ask: number;
    bid_net: number;
    ask_net: number;
    bid_size: number;
    ask_size: number;
    best_to_sell?: boolean;
    best_to_buy?: boolean;
    spread: number;
    spread_pct: number;
}

export interface ProviderQuotes {
    providers: ProviderQuote[];
    best_route: BestRoute | null;
}

export interface ArbOpportunity {
    buy_provider: string;
    sell_provider: string;
    symbol: string;
    buy_price: number;
    sell_price: number;
    raw_spread: number;
    raw_spread_pct: number;
    total_fee_pct: number;
    profit_after_fees: number;
    profit_pct: number;
    max_amount: number;
}

export interface Arbitrage {
    opportunities: ArbOpportunity[];
    active_symbols: string[];
    data_age?: number;
}

export interface DashboardSnapshot {
    symbols: string[];
    /** The pair the tiles were fetched for; the stored choice when it is still listed. */
    symbol: string;
    quotes: ProviderQuotes;
    arb: Arbitrage;
    totalBalance: number | null;
    /** Null when the profit report could not be read; the tile shows a dash. */
    profit: PredictedProfit | null;
    /** Per entry of `symbols`; null where that pair had no answer. */
    prices: Array<BestPrice | null>;
}

export const dashboardApi = {
    activeSymbols: (signal?: AbortSignal) => request<{ active_symbols?: string[] }>('/best-prices', { signal }),
    bestPrice: (symbol: string, signal?: AbortSignal) => request<BestPrice>('/best-prices', { params: { symbol }, signal }),
    quotes: (symbol: string, signal?: AbortSignal) => request<ProviderQuotes>('/provider-quotes', { params: { symbol }, signal }),
    arbitrage: (signal?: AbortSignal) => request<Arbitrage>('/arbitrage', { signal }),
};

/** The stored pair when it is listed, else USDT_IRT, else the first listed. */
export function pickSymbol(wanted: string, symbols: string[]): string {
    if (symbols.includes(wanted)) return wanted;
    return symbols.includes(FALLBACK_SYMBOL) ? FALLBACK_SYMBOL : symbols[0];
}

async function loadSnapshot(wantedSymbol: string, signal: AbortSignal): Promise<DashboardSnapshot> {
    // The pairs the bot actually polls, straight from the price cache, so a
    // pair added to the bot shows up without touching this page.
    const listing = await dashboardApi.activeSymbols(signal).catch(() => null);
    const listed = listing?.active_symbols;
    const symbols = listed?.length ? listed : [FALLBACK_SYMBOL];
    const symbol = pickSymbol(wantedSymbol, symbols);

    // Tiles read what the bot already published - never /providers, which
    // health-checks every exchange live and would spend trading's rate limit
    // on each 2s poll.
    const [quotes, arb, balances, profit, prices] = await Promise.all([
        dashboardApi.quotes(symbol, signal),
        dashboardApi.arbitrage(signal),
        // Side figures: a failure blanks their tile, not the page.
        balancesApi.all(signal).catch(() => null),
        profitApi.predicted(14, signal).catch(() => null),
        Promise.all(symbols.map((s) => dashboardApi.bestPrice(s, signal).catch(() => null))),
    ]);
    return {
        symbols,
        symbol,
        quotes,
        arb,
        totalBalance: typeof balances?.total_irt === 'number' ? balances.total_irt : null,
        profit,
        prices,
    };
}

export function useDashboard(quoteSymbol: string) {
    return useLiveQuery({
        queryKey: ['dashboard', quoteSymbol],
        queryFn: ({ signal }) => loadSnapshot(quoteSymbol, signal),
        refetchInterval: 2000,
        placeholderData: (previous) => previous,
    });
}

/** Toman per unit of each base asset, as the mid of the best bid and ask across venues. */
export function ratesFrom(symbols: string[], prices: Array<BestPrice | null>): Record<string, number> {
    const rates: Record<string, number> = {};
    symbols.forEach((symbol, i) => {
        const d = prices[i];
        const [base, quote] = symbol.split('_');
        if (quote !== 'IRT' || !d?.best_bid || !d.best_ask) return;
        const mid = (d.best_bid.price + d.best_ask.price) / 2;
        if (mid > 0) rates[base] = mid;
    });
    return rates;
}
