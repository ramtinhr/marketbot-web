import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { msg } from '../../i18n';
import { apiUrl, queryString, request, type QueryParams } from '../../shared/api';
import { useLiveQuery, type ListView } from '../../shared/hooks';
import type { PageInfo } from '../../shared/ui';

export type Placeable = 'yes' | 'no' | 'unknown';

/** The top-of-book pair, computed server-side so table, detail, CSV and summary agree. */
export interface BestPriceFigures {
    known: boolean;
    placeable: Placeable;
    amount?: number;
    matched_qty?: number;
    gross?: number;
    buy_fee?: number;
    sell_fee?: number;
    net?: number;
    net_pct?: number;
    deployed?: number;
}

export type BookLevel = [price: number, size: number];

export interface Projection {
    id: string;
    detected_at: string;
    symbol: string;
    buy_provider: string;
    sell_provider: string;
    outcome: string;
    outcome_detail?: string | null;
    limited_by: string;
    simulated: boolean;
    placeable: boolean;
    execution_id?: string | null;
    notes?: string | null;
    best_price?: BestPriceFigures | null;
    book?: { asks?: BookLevel[]; bids?: BookLevel[] } | null;

    max_amount: number;
    projected_amount: number;
    projected_sell_amount: number;
    projected_fraction?: number;
    retained_usdt: number;
    traded_amount: number;
    depth_known: boolean;
    depth_max_amount: number;
    buy_balance_max_amount: number;
    sell_balance_max_amount: number;
    config_max_amount: number;

    top_ask: number;
    top_bid: number;
    top_ask_size: number;
    top_bid_size: number;
    scored_buy_price: number;
    scored_sell_price: number;
    scored_profit_pct: number;
    projected_buy_price: number;
    projected_sell_price: number;
    raw_spread: number;
    raw_spread_pct: number;
    buy_fee_pct: number;
    sell_fee_pct: number;
    total_fee_pct: number;

    gross_profit: number;
    buy_fee: number;
    sell_fee: number;
    net_profit: number;
    net_profit_pct: number;
    deployed: number;
    slippage_cost: number;
}

export interface ProjectionSummary {
    count?: number;
    first_detected_at?: string | null;
    last_detected_at?: string | null;
    best_price_rows?: number;
    best_price_qty?: number;
    best_price_matched_qty?: number;
    best_price_placeable_count?: number;
    best_price_net?: number;
    best_price_avg_net?: number;
    best_price_max_net?: number;
    best_price_avg_net_pct?: number;
    best_price_max_net_pct?: number;
    best_price_avg_qty?: number;
    best_price_avg_matched_qty?: number;
    best_price_fees?: number;
    best_price_deployed?: number;
    total_net_profit?: number;
    avg_projected_qty?: number;
    avg_max_amount?: number;
    total_fees?: number;
    total_slippage?: number;
    placeable_count?: number;
    total_traded_qty?: number;
    executed_count?: number;
    total_projected_qty?: number;
}

export interface ProjectionPage extends PageInfo {
    projections: Projection[];
    summary?: ProjectionSummary;
}

export interface Execution {
    id: string;
    amount: number;
    sell_amount: number;
    buy_price: number;
    sell_price: number;
    expected_profit: number;
    expected_profit_pct: number;
    status: string;
    buy_status: string;
    sell_status: string;
}

export interface ProjectionFilters {
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

export const defaultFilters = (): ProjectionFilters => ({
    from: '', to: '', buy: '', sell: '', outcome: '', limitedBy: '',
    minProfit: '', maxProfit: '', minPct: '', placeable: '', simulated: '', pageSize: '25',
});

export const DEFAULT_VIEW: ListView = { page: 1, sort: 'detected_at', dir: 'desc' };

const API = '/opportunity-projections';

/** The filters and ordering as the API names them, without paging. */
function filterParams(f: ProjectionFilters, view: ListView): QueryParams {
    return {
        from: f.from,
        to: f.to,
        buy_provider: f.buy,
        sell_provider: f.sell,
        outcome: f.outcome,
        limited_by: f.limitedBy,
        min_net_profit: f.minProfit,
        max_net_profit: f.maxProfit,
        min_net_profit_pct: f.minPct,
        placeable: f.placeable,
        simulated: f.simulated,
        sort: view.sort,
        dir: view.dir,
    };
}

export const opportunitiesApi = {
    list: (f: ProjectionFilters, view: ListView, signal?: AbortSignal) => request<ProjectionPage>(API, {
        params: { ...filterParams(f, view), page_size: f.pageSize, page: view.page },
        signal,
    }),
    detail: (id: string, signal?: AbortSignal) => request<{ execution?: Execution | null }>(`${API}/${encodeURIComponent(id)}`, { signal }),
    /** The same filters and ordering the table shows, so an export never disagrees with it. */
    exportUrl: (f: ProjectionFilters, view: ListView) => apiUrl(`${API}/export?${queryString(filterParams(f, view))}`),
};

// Slower than the trading pages: a projection is a historical record, and a
// 5s poll would reset an open detail row while it is being read.
export function useProjections(filters: ProjectionFilters, view: ListView) {
    return useLiveQuery({
        queryKey: ['opportunities', filters, view],
        queryFn: ({ signal }) => opportunitiesApi.list(filters, view, signal),
        refetchInterval: 30000,
        placeholderData: keepPreviousData,
        errorBanner: (error) => msg('opps.loadError', { error: error.message }),
    });
}

/** The execution a projection led to, fetched only when its row is opened. */
export function useExecution(id: string, enabled: boolean) {
    return useQuery({
        queryKey: ['opportunities', 'execution', id],
        queryFn: ({ signal }) => opportunitiesApi.detail(id, signal),
        enabled,
        staleTime: Infinity,
        select: (data) => data.execution ?? null,
    });
}
