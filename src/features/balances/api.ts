import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';

export interface AssetBalance {
    asset: string;
    free: number;
    locked: number;
    total: number;
}

/** One venue's balances; `error` instead when the venue could not be read. */
export interface ProviderBalances {
    provider: string;
    total_irt?: number;
    balances?: AssetBalance[];
    error?: string;
}

export interface BalancesResponse {
    providers: ProviderBalances[];
    total_irt: number | null;
}

export const balancesApi = {
    all: (signal?: AbortSignal) => request<BalancesResponse>('/balances', { signal }),
};

export function useBalances() {
    return useLiveQuery({
        queryKey: ['balances'],
        queryFn: ({ signal }) => balancesApi.all(signal),
        refetchInterval: 15000,
    });
}
