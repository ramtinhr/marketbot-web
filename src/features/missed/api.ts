import { keepPreviousData } from '@tanstack/react-query';

import { msg } from '../../i18n';
import { request } from '../../shared/api';
import { useLiveQuery, type ListView } from '../../shared/hooks';
import type { PageInfo } from '../../shared/ui';

/** One side of a missed trade: what the wallet held against what it needed. */
export interface Leg {
    known: boolean;
    short: boolean;
    venue: string;
    asset: string;
    have: number;
    need: number;
    shortfall: number;
}

export interface MissedRow {
    id?: string | number;
    detected_at: string;
    symbol: string;
    buy_provider: string;
    sell_provider: string;
    known: boolean;
    target_qty: number;
    matched_qty: number;
    gross: number;
    net: number;
    net_pct: number;
    fees: number;
    buy: Leg;
    sell: Leg;
    reasons?: string[];
    error?: { kind: string; message: string } | null;
    wallet_refusal?: boolean;
    outcome_detail?: string | null;
    simulated: boolean;
}

export interface Topup {
    venue: string;
    asset: string;
    side: 'buy' | 'sell';
    count: number;
    missed_net: number;
    required: number;
    required_all: number;
    covered_count: number;
    covered_net: number;
    last_seen_at?: string | null;
    last_seen_have: number;
    live_free: number | null;
    live_credit?: number | 'unlimited' | null;
    topup: number;
    topup_all: number;
    topup_basis: 'live' | 'last_seen';
}

export interface PairSummary {
    symbol: string;
    count: number;
    balance_short: number;
    errors: number;
    missed_qty: number;
    missed_gross: number;
    missed_net: number;
}

export interface WalletNeeds {
    topup_toman?: number;
    topup_usdt?: number;
    topup_all_toman?: number;
    topup_all_usdt?: number;
    short_wallets?: number;
    assets?: Array<{ asset: string; topup: number }>;
    unpriced?: string[];
}

export interface MissedSummary {
    count?: number;
    first_detected_at?: string | null;
    last_detected_at?: string | null;
    missed_gross?: number;
    missed_deployed?: number;
    missed_net?: number;
    missed_fees?: number;
    errors?: number;
    buy_short?: number;
    sell_short?: number;
}

export interface MissedReport extends PageInfo {
    rows: MissedRow[];
    symbols?: string[];
    topups?: Topup[];
    pairs?: PairSummary[];
    summary?: MissedSummary;
    wallet_needs?: { buy?: WalletNeeds; sell?: WalletNeeds };
    errors_by_kind?: Array<{ kind: string; count: number }>;
    truncated?: boolean;
    fraction?: number;
    coverage?: number;
    live_balances?: boolean;
    live_credit?: boolean;
}

export interface MissedFilters {
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

// From defaults to a week back: the page judges every matching row in
// memory, and all of history is rarely the question.
function weekAgo(): string {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const defaultFilters = (): MissedFilters => ({
    from: weekAgo(), to: '', symbol: '', buy: '', sell: '', reason: '', simulated: '',
    fraction: '70', profitable: '', coverage: '90', pageSize: '25',
});

export const DEFAULT_VIEW: ListView = { page: 1, sort: 'detected_at', dir: 'desc' };

export const missedApi = {
    report: (f: MissedFilters, view: ListView, signal?: AbortSignal) => request<MissedReport>('/missed-opportunities', {
        params: {
            from: f.from,
            to: f.to,
            symbol: f.symbol,
            buy_provider: f.buy,
            sell_provider: f.sell,
            reason: f.reason,
            fraction: f.fraction,
            profitable: f.profitable,
            simulated: f.simulated,
            coverage: f.coverage,
            page_size: f.pageSize,
            page: view.page,
            sort: view.sort,
            dir: view.dir,
        },
        signal,
    }),
};

export function useMissedReport(filters: MissedFilters, view: ListView) {
    return useLiveQuery({
        queryKey: ['missed', filters, view],
        queryFn: ({ signal }) => missedApi.report(filters, view, signal),
        refetchInterval: 60000,
        placeholderData: keepPreviousData,
        errorBanner: (error) => msg('missed.loadError', { error: error.message }),
    });
}
