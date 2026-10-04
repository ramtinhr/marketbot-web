import { t } from '../../i18n';
import { ApiError, request } from '../../shared/api';

// The exchange's payloads are passed through as the engine sends them.
export type ExchangeUser = { id: string; username: string; display_name: string };
export type ExchangeOrder = any;
export type ExchangeTrade = any;
export type Balance = any;
export type Depth = any;
export type Hedging = any;

export interface CandleDTO { time: number; open: number; high: number; low: number; close: number; volume: number }

// Orders move money (real money, in live mode), so the API refuses them unless they say so.
const INTENT = { 'x-marketbot-intent': 'market-order' };
const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body, headers: INTENT });
const user = (id: string) => encodeURIComponent(id);

export const marketApi = {
    symbols: () => request<{ symbols?: string[] }>('/exchange/symbols'),
    users: () => request<{ users: ExchangeUser[] }>('/exchange/users'),
    status: () => request<{ hedging?: Hedging; trading_mode?: string }>('/exchange/status'),
    realBalances: () => request<{ balances?: Balance[]; unavailable?: string[] }>('/exchange/real-balances'),
    candles: (symbol: string, interval: string) =>
        request<{ candles?: CandleDTO[]; summary?: Record<string, number> | null }>('/exchange/candles', { params: { symbol, interval, limit: 500 } }),
    marketTrades: (symbol: string, limit: number) => request<{ trades: ExchangeTrade[] }>('/exchange/trades', { params: { symbol, limit } }),
    userTrades: (userId: string, symbol: string) =>
        request<{ trades: ExchangeTrade[] }>('/exchange/trades', { params: { user_id: userId, symbol, limit: 200 } }),
    orders: (userId: string, symbol: string, scope: 'open' | 'history') =>
        request<{ orders: ExchangeOrder[] }>('/exchange/orders', { params: { user_id: userId, symbol, scope, limit: scope === 'open' ? 200 : 100 } }),
    balances: (userId: string) => request<{ balances: Balance[] }>(`/exchange/users/${user(userId)}/balances`),

    place: (body: { user_id: string; symbol: string | null; side: string; price: string; quantity: string }) =>
        post<{ order?: ExchangeOrder; orders?: ExchangeOrder[]; trades?: ExchangeTrade[]; event?: { hedges?: unknown[] } }>('/exchange/orders', body),
    cancel: (orderId: string, userId: string | null) =>
        post<{ order?: ExchangeOrder }>(`/exchange/orders/${encodeURIComponent(orderId)}/cancel`, { user_id: userId }),
    cancelAll: (userId: string | null, symbol: string | null) =>
        post<{ cancelled?: number; failed?: number; failures?: unknown[] }>('/exchange/orders/cancel-all', { user_id: userId, symbol }),
    faucet: (userId: string, symbol: string | null) =>
        post<{ balances?: Balance[]; credited: Record<string, number> }>(`/exchange/users/${user(userId)}/faucet`, { symbol }),
};

// The engine's refusal codes; the text is the page's to say.
const REJECT_KEYS: Record<string, string> = {
    invalid_order: 'market.reject.invalidOrder',
    unknown_user: 'market.reject.unknownUser',
    user_inactive: 'market.reject.userInactive',
    wallet_inactive: 'market.reject.walletInactive',
    insufficient_balance: 'market.reject.insufficientBalance',
    order_not_found: 'market.reject.orderNotFound',
    order_closed: 'market.reject.orderClosed',
    internal_error: 'market.reject.internalError',
};

/** What the engine's refusal (`{reason, error}`) says, in the page's words where it has them. */
export function rejectionText(data: unknown): string {
    const d = (data || {}) as { reason?: string; error?: string };
    return d.reason && REJECT_KEYS[d.reason] ? t(REJECT_KEYS[d.reason]) : d.error || t('error.requestFailed');
}

/** A refusal in the engine's terms; anything else (the network) as its own message. */
export const refusalText = (err: unknown) => (err instanceof ApiError ? rejectionText(err.data) : (err as Error).message);

/** The API's own error text, the fallback when it gave none, or the network's message. */
export function errorText(err: unknown, fallbackKey: string): string {
    if (err instanceof ApiError) return typeof err.data.error === 'string' && err.data.error ? err.data.error : t(fallbackKey);
    return (err as Error).message;
}
