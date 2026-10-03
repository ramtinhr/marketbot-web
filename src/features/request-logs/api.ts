import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import type { PageInfo } from '../../shared/ui';

export interface RequestLog {
    id: number;
    created_at: string;
    provider: string;
    operation: string;
    symbol: string | null;
    side: 'buy' | 'sell' | null;
    order_id: string | null;
    duration_ms: number;
    success: boolean;
    request: unknown;
    response: unknown;
    error_message: string | null;
}

export interface RequestLogPage extends PageInfo {
    logs: RequestLog[];
}

export interface LogProvider {
    code: string;
    active: boolean;
}

export interface LogFilters {
    provider: string;
    operation: string;
    success: string;
    symbol: string;
    orderId: string;
    pageSize: string;
}

export const OPERATIONS = ['place_order', 'get_status', 'cancel_order'];

export const requestLogsApi = {
    list: (filters: LogFilters, page: number, signal?: AbortSignal) => request<RequestLogPage>('/request-logs', {
        params: {
            page,
            page_size: filters.pageSize,
            provider: filters.provider,
            operation: filters.operation,
            success: filters.success,
            symbol: filters.symbol.trim(),
            order_id: filters.orderId.trim(),
        },
        signal,
    }),
    providers: (signal?: AbortSignal) => request<{ providers: LogProvider[] }>('/request-logs/providers', { signal }),
};

export function useRequestLogs(filters: LogFilters, page: number) {
    return useLiveQuery({
        queryKey: ['request-logs', filters, page],
        queryFn: ({ signal }) => requestLogsApi.list(filters, page, signal),
        refetchInterval: 10000,
        placeholderData: keepPreviousData,
    });
}

/** Active venues plus any with logs. A failure leaves only "All", which still
 *  works - the filter is a convenience, not the page. */
export function useLogProviders() {
    return useQuery({
        queryKey: ['request-logs', 'providers'],
        queryFn: ({ signal }) => requestLogsApi.providers(signal),
        select: (data) => data.providers || [],
        staleTime: Infinity,
    });
}
