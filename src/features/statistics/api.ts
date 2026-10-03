import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { msg, rawMsg } from '../../i18n';
import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import { registerProviders } from '../../shared/lib';
import { rangeBounds, type Range } from './model';

// Projection rows are fetched a page at a time (the API caps a page at 200).
// This bounds how many the threshold sweep reads: enough for a smooth curve,
// and the exact shortfall is reported on screen rather than hidden, because a
// curve drawn from a truncated sample must say so.
const PROJECTION_PAGE_SIZE = 200;
const PROJECTION_MAX_PAGES = 8;

/** Fees and minimums per venue for one pair, plus the pairs the bot trades. */
export interface OrderLimits {
    symbols?: string[];
    [key: string]: unknown;
}

export interface TickerHistory {
    providers?: string[];
    empty?: boolean;
    bucket_seconds: number;
    total_samples: number;
    [key: string]: unknown;
}

export interface StatsProjection {
    detected_at: string;
    buy_provider: string;
    sell_provider: string;
    scored_profit_pct: number;
    net_profit: number;
    projected_amount: number;
    placeable: boolean;
    outcome: string;
    [key: string]: unknown;
}

export interface StatsSlice {
    history: TickerHistory;
    projections: StatsProjection[];
    projectionTotal: number;
    projectionTruncated: boolean;
}

export const statsApi = {
    limits: (symbol: string, signal?: AbortSignal) => request<OrderLimits>('/order-limits', { params: { symbol }, signal }),

    // Every provider, always - the toggles filter what is drawn, not what is
    // fetched. Narrowing the request would mean a venue switched back on had
    // no data until the next range change, and the endpoint's `providers`
    // filter exists for callers that aren't a togglable chart.
    history: (range: Range, symbol: string, signal?: AbortSignal) =>
        request<TickerHistory>('/ticker-history', { params: { range, symbol }, signal }),

    async projections(range: Range, symbol: string, signal?: AbortSignal) {
        const { from, to } = rangeBounds(range);
        const rows: StatsProjection[] = [];
        let total = 0;
        let truncated = false;

        for (let page = 1; page <= PROJECTION_MAX_PAGES; page++) {
            const res = await request<{ total?: number; projections?: StatsProjection[] }>('/opportunity-projections', {
                params: {
                    symbol, page, page_size: PROJECTION_PAGE_SIZE, sort: 'detected_at', dir: 'desc',
                    from: from?.toISOString(), to: to?.toISOString(),
                },
                signal,
            });
            total = res.total || 0;
            const batch = res.projections || [];
            rows.push(...batch);

            if (batch.length < PROJECTION_PAGE_SIZE) break;
            if (page === PROJECTION_MAX_PAGES && rows.length < total) truncated = true;
        }

        // Oldest first, so a route's points read left to right.
        rows.sort((a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime());
        return { projections: rows, projectionTotal: total, projectionTruncated: truncated };
    },
};

/**
 * Providers are discovered from the data, not hardcoded: a venue added to the
 * registry appears on the page without touching it.
 */
export function providerCodes(history: TickerHistory, projections: StatsProjection[]): string[] {
    const codes = new Set<string>(history.providers || []);
    projections.forEach((p) => { codes.add(p.buy_provider); codes.add(p.sell_provider); });
    return [...codes].filter(Boolean).map((c) => String(c).toLowerCase());
}

// Per pair, because the limits are: the same venue takes 8 decimals of BTC
// and 0 of SHIB, and a minimum read off the wrong pair would mark real
// opportunities unplaceable (or unplaceable ones real). They are
// configuration, not market data, so they are fetched once per pair.
export function useOrderLimits(symbol: string) {
    return useQuery({
        queryKey: ['stats', 'limits', symbol],
        queryFn: ({ signal }) => statsApi.limits(symbol, signal),
        staleTime: Infinity,
    });
}

/**
 * The slice every chart is drawn from. Not polled: it changes with the
 * toolbar or the refresh button. `ready` holds it back until the pair's limits
 * have settled, since the fee-inclusive view cannot be drawn without them.
 */
export function useStatsSlice(range: Range, symbol: string, ready: boolean) {
    return useLiveQuery<StatsSlice>({
        queryKey: ['stats', 'slice', range, symbol],
        queryFn: async ({ signal }) => {
            const [history, proj] = await Promise.all([
                statsApi.history(range, symbol, signal),
                statsApi.projections(range, symbol, signal),
            ]);
            // Colour slots are claimed for the whole set at once so the
            // assignment never depends on arrival order.
            registerProviders(providerCodes(history, proj.projections));
            return { history, ...proj };
        },
        enabled: ready,
        placeholderData: keepPreviousData,
        errorBanner: (error) => (error.message ? rawMsg(error.message) : msg('stats.loadFailed')),
    });
}
