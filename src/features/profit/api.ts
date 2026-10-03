import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';

export interface VerifiedDay {
    date: string;
    usdt: number;
    irt: number;
    valued: boolean;
    net_irt: number;
    valuation_price: number;
    trades: number;
    excluded_trades: number;
}

export interface VerifiedTrade {
    at: string;
    buy_provider: string;
    sell_provider: string;
    usdt: number;
    irt: number;
    net_irt: number;
    reliable: boolean;
    unmatched: boolean;
    status?: string;
}

export interface VerifiedTotals {
    round_trip_net_irt?: number;
    round_trip_trades?: number;
    unmatched_trades?: number;
    unmatched_net_irt?: number;
    net_usdt?: number;
    net_irt?: number;
    days_unvalued?: number;
    usdt?: number;
    irt?: number;
    trades?: number;
    excluded_trades?: number;
    unmeasured_trades?: number;
    placed_trades?: number;
}

export interface VerifiedProfit {
    daily: VerifiedDay[];
    trades: VerifiedTrade[];
    totals: VerifiedTotals;
}

export interface PredictedDay {
    date: string;
    profit_irt: number;
    trades: number;
}

export interface PredictedProfit {
    real_daily: PredictedDay[];
    simulated_daily: PredictedDay[];
    today_profit_irt?: number;
    today_trades?: number;
}

export interface ProfitSnapshot {
    predicted: PredictedProfit;
    verified: VerifiedProfit;
}

const DAYS = 30;

export const profitApi = {
    predicted: (days: number, signal?: AbortSignal) => request<PredictedProfit>('/profit/daily', { params: { days }, signal }),
    verified: (days: number, signal?: AbortSignal) => request<VerifiedProfit>('/profit/daily-verified', { params: { days }, signal }),
};

/** Both halves together, so the page never shows a prediction beside a stale measurement. */
export function useProfit() {
    return useLiveQuery<ProfitSnapshot>({
        queryKey: ['profit', DAYS],
        queryFn: async ({ signal }) => {
            const [predicted, verified] = await Promise.all([profitApi.predicted(DAYS, signal), profitApi.verified(DAYS, signal)]);
            return { predicted, verified };
        },
        refetchInterval: 15000,
    });
}
