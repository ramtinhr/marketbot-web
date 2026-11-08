import { request } from '../../shared/api/client';
import { financialRequest } from '../../shared/api/financial';

export interface Customer {
    id: string; username: string; display_name: string; first_name: string | null; last_name: string | null;
    email: string | null; phone: string | null; national_id: string | null; birth_date: string | null;
    status: string; status_reason: string | null; kyc_level: number; note: string | null; is_demo: boolean;
    created_at: string; updated_at: string; created_by: string;
}
export interface Wallet { asset: string; available: string; frozen: string; locked: string; total: string; status: string }
export interface Bank { id: string; label: string; holder_name: string; iban: string; created_at: string }
export type RecordRow = Record<string, unknown>;
export const userPath = (id: string) => `/users/${encodeURIComponent(id)}`;
export const customerApi = {
    list: (q: string, status: string, demo: string, offset: number, signal?: AbortSignal) => request<{users: Customer[]; total: number}>('/users', {params: {q,status,is_demo:demo,offset,limit:25},signal}),
    detail: (id: string, signal?: AbortSignal) => request<{user: Customer; wallets: Wallet[]}>(userPath(id), {signal}),
    banks: (id: string, signal?: AbortSignal) => request<{accounts: Bank[]}>(`${userPath(id)}/bank-accounts`, {signal}),
    move: (id: string, asset: string, kind: string, body: unknown) => financialRequest(`${userPath(id)}/wallets/${encodeURIComponent(asset)}/${kind}`, {method:'POST',body,headers:{'x-marketbot-intent':'wallet-operation'}}),
};
