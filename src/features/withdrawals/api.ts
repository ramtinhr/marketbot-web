import { useMutation, useQueryClient } from '@tanstack/react-query';
import { financialRequest, request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import type { PageInfo } from '../../shared/ui';

export const STATUSES = ['pending', 'processing', 'paid', 'rejected', 'cancelled'] as const;
export type WithdrawalStatus = typeof STATUSES[number];
export type ReviewAction = 'edit' | 'approve' | 'reject' | 'paid';
export interface Withdrawal {
    id: string;
    user_id: string | number;
    exchange_user_id: string;
    asset: string;
    amount: string;
    network: string | null;
    destination: string;
    beneficiary_name: string | null;
    status: WithdrawalStatus;
    note: string | null;
    created_at: string;
    revision: string;
}
export interface WithdrawalPage extends PageInfo {
    withdrawals: Withdrawal[];
    networks: Record<string, string[]>;
}
export interface ReviewBody {
    revision: string;
    reason: string;
    amount?: string;
    destination?: string;
    network?: string;
    beneficiary_name?: string;
    note?: string;
}
const KEY = ['withdrawals'] as const;
export function useWithdrawals(status: string, q: string, page: number) {
    return useLiveQuery({
        queryKey: [...KEY, status, q, page],
        queryFn: ({ signal }) => request<WithdrawalPage>('/withdrawals', { params: { status, q, page, page_size: 25 }, signal }),
        errorBanner: 'message',
        // Refresh explicitly so an operator reviews a stable request snapshot.
    });
}
export function useReviewWithdrawal() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ({ row, action, body }: { row: Withdrawal; action: ReviewAction; body: ReviewBody }) =>
            financialRequest<{ withdrawal: Withdrawal }>(`/withdrawals/${encodeURIComponent(row.id)}${action === 'edit' ? '' : `/${action}`}`, {
                method: action === 'edit' ? 'PATCH' : 'POST', body, headers: { 'x-marketbot-intent': 'withdrawal-review' },
            }),
        onSettled: () => client.invalidateQueries({ queryKey: KEY }),
    });
}
