import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import { registerProviders } from '../../shared/lib';

export type Side = 'buy' | 'sell';

export interface DeskVenue {
    code: string;
    order_circuit_state?: string;
}

export interface DeskConfig {
    available: boolean;
    enabled: boolean;
    simulate_orders: boolean;
    traded_symbols?: string[];
    providers?: DeskVenue[];
}

export interface OrderRequest {
    symbol: string;
    side: Side;
    price: number;
    quantity: number;
    providers: string[];
    rest_remainder: boolean;
    cancel_after_seconds: number;
}

export interface PlanLeg {
    provider: string;
    qty: number;
    take_qty: number;
    rest_qty: number;
    limit_price: number;
    expected_avg_price: number;
    notional: number;
    fee_pct: number;
    est_fee: number;
}

export interface PlanVenue {
    provider: string;
    best_price: number;
    depth: number;
    depth_known: boolean;
    balance_known: boolean;
    free: number;
    balance_asset: string;
    credit?: number;
    credit_unlimited?: boolean;
    fee_pct: number;
    min_qty: number;
    excluded?: string | null;
    allocated: number;
}

/** The router's answer to a preview: how the order would be split, and why. */
export interface Plan {
    symbol: string;
    side: Side;
    total_qty: number;
    requested_qty: number;
    shortfall: number;
    avg_price: number;
    net_quote: number;
    est_fees: number;
    reference_mid?: number | null;
    max_notional_toman: number;
    blockers?: string[];
    warnings?: string[];
    legs: PlanLeg[];
    venues: PlanVenue[];
}

export interface PlaceBody extends OrderRequest {
    client_request_id: string;
    expected_avg_price: number;
    expected_quantity: number;
    max_slippage_pct: number;
}

export interface ManualLeg {
    id: string;
    provider: string;
    status: string;
    qty: number;
    executed_qty: number;
    executed_quote: number;
    rest_qty: number;
    limit_price: number;
    order_id?: string | null;
    cancel_at?: string | null;
    last_error?: string | null;
}

export interface ManualOrder {
    id: string;
    created_at: string;
    side: Side;
    symbol: string;
    status: string;
    simulated: boolean;
    limit_price: number;
    requested_qty: number;
    planned_qty: number;
    filled_qty: number;
    avg_fill_price: number;
    error_message?: string | null;
    legs: ManualLeg[];
    venue_reasons?: Array<{ provider: string; reason: string }>;
}

export interface PlaceResult {
    order: ManualOrder;
    legs: ManualLeg[];
}

// Placing and cancelling move money, so the API refuses them unless they say so.
const INTENT = { 'x-marketbot-intent': 'manual-order' };

export const manualApi = {
    config: (signal?: AbortSignal) => request<DeskConfig>('/manual-orders/config', { signal }),
    quote: (req: OrderRequest) => request<Plan>('/manual-orders/quote', { method: 'POST', body: req }),
    place: (body: PlaceBody) => request<PlaceResult>('/manual-orders', { method: 'POST', body, headers: INTENT }),
    orders: (status: string, signal?: AbortSignal) => request<{ orders: ManualOrder[] }>('/manual-orders', { params: { status }, signal }),
    cancel: (orderId: string, legId?: string) =>
        request<unknown>(`/manual-orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST', body: legId ? { leg_id: legId } : {}, headers: INTENT }),
};

/** Leg states in which something is still working on a book. */
export const LIVE_STATUSES = new Set(['open', 'cancel_requested', 'placing']);
export const isLive = (o: ManualOrder) => o.legs.some((l) => LIVE_STATUSES.has(l.status));

export function useDeskConfig() {
    return useQuery({
        queryKey: ['manual', 'config'],
        queryFn: async ({ signal }) => {
            const config = await manualApi.config(signal);
            registerProviders((config.providers || []).map((p) => p.code));
            return config;
        },
        refetchInterval: 15000,
    });
}

const ORDERS_KEY = ['manual', 'orders'] as const;

export function useManualOrders(status: string) {
    return useLiveQuery({
        queryKey: [...ORDERS_KEY, status],
        queryFn: async ({ signal }) => {
            const { orders = [] } = await manualApi.orders(status, signal);
            registerProviders(orders.flatMap((o) => o.legs.map((l) => l.provider)));
            return orders;
        },
        // Fast while something is working on a book, slow otherwise.
        refetchInterval: (query) => (query.state.data?.some(isLive) ? 4000 : 15000),
        errorBanner: 'none',
    });
}

/** Writes that change the order list refetch it, whatever their outcome. */
function useOrderWrite<V, R>(fn: (vars: V) => Promise<R>) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSettled: () => client.invalidateQueries({ queryKey: ORDERS_KEY }),
    });
}

export const usePlaceOrder = () => useOrderWrite(manualApi.place);
export const useCancelOrder = () => useOrderWrite(({ orderId, legId }: { orderId: string; legId?: string }) => manualApi.cancel(orderId, legId));
export const usePreviewOrder = () => useMutation({ mutationFn: manualApi.quote });
