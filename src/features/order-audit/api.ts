import { useMutation } from '@tanstack/react-query';

import { format, msg } from '../../i18n';
import { API_BASE, request } from '../../shared/api';
import { usePageStatus } from '../../shared/stores/pageStatus';

export interface AuditField {
    field: string;
    unit: string;
    recorded: number | null;
    exchange: number | null;
    diff: number | null;
    diff_pct: number | null;
    mismatch: boolean;
    note?: string;
}

export interface AuditLeg {
    side: 'buy' | 'sell';
    provider: string;
    order_id: string | null;
    verified: boolean;
    terminal: boolean;
    mismatch_count: number;
    recorded_status: string | null;
    exchange_status: string | null;
    exchange_raw_status?: string | null;
    status_mismatch?: boolean;
    status_stale?: boolean;
    fee_measured?: boolean;
    fee_quote?: number;
    fee_base?: number;
    error?: string | null;
    fields: AuditField[];
    raw?: unknown;
}

export interface AuditTrade {
    execution_id: string | number;
    created_at: string;
    symbol: string;
    status: string | null;
    simulated: boolean;
    mismatch_count: number;
    expected_profit: number | null;
    realized_net: number | null;
    quote_flow_net: number;
    retained_base: number;
    retained_base_value: number;
    modeled_fees: number;
    fees_measured: boolean;
    buy: AuditLeg;
    sell: AuditLeg;
}

export interface AuditReport {
    generated_at: string;
    price_tolerance_pct: number;
    qty_tolerance_pct: number;
    trades: AuditTrade[];
    trades_audited: number;
    trades_with_mismatch: number;
    total_mismatches: number;
    legs_unverified: number;
    trades_measured: number;
    realized_net: number;
    expected_total: number;
    net_quote_flow: number;
    retained_base: number;
}

export interface AuditScope {
    limit: string;
    priceTol: string;
    qtyTol: string;
    simulated: string;
    unplaced: string;
}

export const DEFAULT_SCOPE: AuditScope = { limit: '25', priceTol: '0.05', qtyTol: '0.5', simulated: 'false', unplaced: 'false' };

export const orderAuditApi = {
    run: (scope: AuditScope) => request<AuditReport>('/order-audit', {
        params: {
            limit: scope.limit || '25',
            include_simulated: scope.simulated,
            include_unplaced: scope.unplaced,
            price_tolerance_pct: scope.priceTol,
            qty_tolerance_pct: scope.qtyTol,
        },
    }),
};

/**
 * One audit run. Each run spends two live exchange lookups per trade, so it
 * is a mutation - it only ever runs on an explicit click, never on mount, a
 * poll, or a language change - and the last report is kept for repainting.
 */
export function useOrderAudit() {
    const status = usePageStatus();
    return useMutation({
        mutationFn: orderAuditApi.run,
        onMutate: () => status.setStatus(true, msg('audit.fetchingStatus')),
        onSuccess: () => status.setStatus(true, msg('audit.doneStatus', { time: format.time(new Date()) })),
        onError: (error) => {
            status.setStatus(false, msg('audit.failedStatus'));
            status.showError(error.message || msg('error.unreachable', { base: API_BASE }));
        },
    });
}
