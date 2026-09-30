import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

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

export interface JsonResult<T = any> {
    ok: boolean;
    status: number;
    data: T;
}

/**
 * GET (or any method) and parse JSON without throwing on a non-2xx: every
 * failure from the API is {"error": "..."}, which callers read off `data`.
 * A network failure still throws, which is how pages tell "API unreachable"
 * from "API said no".
 */
export async function fetchJSON<T = any>(path: string, config?: AxiosRequestConfig): Promise<JsonResult<T>> {
    const res = await http.request<T>({ ...config, url: apiUrl(path) });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data };
}

/** JSON body helper for POST/PUT/DELETE. */
export function sendJSON<T = any>(path: string, method: string, body?: unknown, headers?: Record<string, string>) {
    return fetchJSON<T>(path, {
        method,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
        data: body !== undefined ? JSON.stringify(body) : undefined,
    });
}
