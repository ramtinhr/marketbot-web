import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';

export type ReconciliationStatus = 'ok' | 'mismatch' | 'no_live_data' | 'stale_live';

export interface ReconciledAccount {
    provider: string;
    asset: string;
    internal_balance: number;
    live_balance: number | null;
    diff: number | null;
    status: ReconciliationStatus;
    live_updated_at: string | null;
}

export interface ReconciliationResponse {
    accounts: ReconciledAccount[];
}

export const reconciliationApi = {
    accounts: (signal?: AbortSignal) => request<ReconciliationResponse>('/reconciliation', { signal }),
};

export function useReconciliation() {
    return useLiveQuery({
        queryKey: ['reconciliation'],
        queryFn: ({ signal }) => reconciliationApi.accounts(signal),
        refetchInterval: 15000,
    });
}
