import { useMutation, useQueryClient } from '@tanstack/react-query';

import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import { registerProviders } from '../../shared/lib';

export interface Credential {
    field: string;
    label: string;
    hint?: string;
    env: string;
    stored: boolean;
    unreadable?: boolean;
    mask?: string;
    length?: number;
    /** Where the bot actually reads it from; null when the bot has not said. */
    active_source: 'database' | 'environment' | null;
}

export interface HostUrl {
    field: string;
    label: string;
    hint?: string;
    env?: string;
    required?: boolean;
    default: string | null;
    override: string | null;
    effective: string | null;
    /** What the running bot uses, when it reports it. */
    active?: string | null;
}

export interface CreditLine {
    asset: string;
    amount: number | 'unlimited';
}

export interface ProviderSetting {
    code: string;
    name: string;
    catalog_name?: string;
    is_active: boolean;
    known: boolean;
    registrable: boolean;
    registered: boolean;
    circuit_state: string | null;
    seeded_base_url?: string | null;
    credentials: Credential[];
    urls: HostUrl[];
    credit: CreditLine[];
    /** The credit the bot is counting; null when it has not said. */
    active_credit: CreditLine[] | null;
}

export interface AvailableProvider {
    code: string;
    name: string;
}

export interface ProviderSettings {
    providers: ProviderSetting[];
    available_codes: AvailableProvider[];
    credentials_available: boolean;
    bot_publishing: boolean;
}

export interface ProviderDetail {
    provider: ProviderSetting;
    credentials_available: boolean;
}

/** Whether the bot re-read the table after a change. */
export interface ReloadResult {
    ok: boolean;
    registered?: number;
    error?: string;
}

export interface MutationResult {
    provider?: ProviderSetting;
    reload?: ReloadResult | null;
}

// The API refuses settings writes that do not declare themselves, so a stray
// cross-site form post cannot switch a venue off.
const INTENT = { 'x-marketbot-intent': 'provider-settings' };
const BASE = '/providers/settings';
const at = (...segments: string[]) => [BASE, ...segments.map(encodeURIComponent)].join('/');

const send = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
    request<MutationResult>(path, { method, body, headers: INTENT });

export const providersApi = {
    list: (signal?: AbortSignal) => request<ProviderSettings>(BASE, { signal }),
    get: (code: string, signal?: AbortSignal) => request<ProviderDetail>(at(code), { signal }),
    add: (code: string, name: string) => send('POST', BASE, name ? { code, name } : { code }),
    setActive: (code: string, active: boolean) => send('POST', at(code, active ? 'activate' : 'deactivate')),
    reloadBot: () => send('POST', `${BASE}/reload`),
    rename: (code: string, name: string) => send('PATCH', at(code), { name }),
    /** Credentials, host overrides and the credit line all go through the same endpoint. */
    putSettings: (code: string, body: Record<string, unknown>) => send('PUT', at(code, 'credentials'), body),
    clearSetting: (code: string, field: string) => send('DELETE', at(code, 'credentials', field)),
};

const KEY = ['providers'] as const;

// Neither query is polled. This page holds forms an operator is typing into,
// and a list that repaints under a half-clicked toggle is how the wrong venue
// gets switched off. They reload when a change is made, and not otherwise.

export function useProviderSettings() {
    return useLiveQuery({
        queryKey: [...KEY, 'list'],
        queryFn: async ({ signal }) => {
            const data = await providersApi.list(signal);
            registerProviders((data.providers || []).map((p) => p.code));
            return data;
        },
        errorBanner: 'message',
    });
}

export function useProviderDetail(code: string) {
    return useLiveQuery({
        queryKey: [...KEY, 'detail', code],
        queryFn: ({ signal }) => providersApi.get(code, signal),
        enabled: Boolean(code),
        errorBanner: 'message',
    });
}

/**
 * Any settings write. Whatever the outcome the lists are refetched, so a
 * rejected toggle never leaves a switch showing a state the database never
 * took; a write that returns the provider updates its page at once.
 */
export function useProviderMutation<V>(fn: (vars: V) => Promise<MutationResult>) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: (data) => {
            if (data.provider) {
                const code = data.provider.code;
                client.setQueryData<ProviderDetail>([...KEY, 'detail', code], (old) => old && { ...old, provider: data.provider! });
            }
        },
        onSettled: () => client.invalidateQueries({ queryKey: KEY }),
    });
}
