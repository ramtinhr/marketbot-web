import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';

export interface Order {
    id: number;
    created_at: string;
    buy_provider: string;
    sell_provider: string;
    symbol: string;
    buy_price: number;
    sell_price: number;
    amount: number;
    expected_profit: number | null;
    expected_profit_pct: number | null;
    /** The bot's own recorded value; doubles as the badge's class. */
    status: string | null;
    simulated: boolean;
}

export interface OrdersResponse {
    orders: Order[];
    count: number;
}

export const ordersApi = {
    recent: (limit: number, signal?: AbortSignal) => request<OrdersResponse>('/orders', { params: { limit }, signal }),
};

const LIMIT = 50;

export function useRecentOrders() {
    return useLiveQuery({
        queryKey: ['orders', 'recent', LIMIT],
        queryFn: ({ signal }) => ordersApi.recent(LIMIT, signal),
        refetchInterval: 5000,
    });
}
