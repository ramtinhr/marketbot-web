import axios, { type AxiosInstance } from 'axios';

// Where the API lives. Same-origin `/api/v1` by default: in development the
// Vite server proxies it (vite.config.ts), and in production the dashboard is
// expected behind the same nginx as the API. Set VITE_API_BASE at build time
// to point elsewhere (e.g. https://api.example.com/api/v1).
export const API_BASE: string = (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/+$/, '');

/** Absolute ws(s):// URL for a path under API_BASE. */
export function wsUrl(path: string): string {
    const base = new URL(API_BASE, window.location.href);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${base.toString().replace(/\/+$/, '')}${path}`;
}

/** `/opportunities?x=1` -> `${API_BASE}/opportunities?x=1`; absolute URLs pass through. */
export function apiUrl(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    if (path.startsWith(API_BASE)) return path;
    return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Every non-2xx resolves instead of rejecting, and an unparseable or empty
// body becomes {} so callers can always read `data.error`.
export const http: AxiosInstance = axios.create({
    responseType: 'text',
    validateStatus: () => true,
    transformResponse: [(raw: unknown) => {
        if (typeof raw !== 'string') return raw ?? {};
        try { return JSON.parse(raw); } catch { return {}; }
    }],
});

/** The API answered, but not with a 2xx. `message` is its `{"error": "..."}` when it gave one. */
export class ApiError extends Error {
    readonly status: number;
    readonly data: Record<string, unknown>;

    constructor(status: number, data: Record<string, unknown>) {
        super(typeof data.error === 'string' && data.error ? data.error : `HTTP ${status}`);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Empty strings, null and undefined are left out, so an unset filter is no filter. */
    params?: QueryParams;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

/** The params as a query string, without the empty ones. */
export function queryString(params: QueryParams = {}): string {
    const out = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== '' && value !== null && value !== undefined) out.set(key, String(value));
    }
    return out.toString();
}

/**
 * The one way services talk to the API: resolves with the parsed body on a
 * 2xx, rejects with ApiError otherwise. A network failure rejects with axios's
 * own error, which is how callers tell "API unreachable" from "API said no".
 */
export async function request<T>(path: string, { method = 'GET', params, body, headers, signal }: RequestOptions = {}): Promise<T> {
    const qs = queryString(params);
    const res = await http.request({
        url: apiUrl(qs ? `${path}?${qs}` : path),
        method,
        signal,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        data: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, res.data ?? {});
    return res.data as T;
}
