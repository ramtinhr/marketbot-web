import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { fetchJSON, http, sendJSON } from './api';

// Who is signed in. The session itself is an HttpOnly cookie the API sets and
// this code never sees; what the app knows is whether GET /auth/me answers.
// Any 401 afterwards - the session expired, or was ended by a password change
// on another tab - drops back to the sign-in page, which returns here after.

export interface Admin { id: number; username: string }

type AuthState =
    | { status: 'loading' }
    | { status: 'signedOut'; expired: boolean }
    | { status: 'signedIn'; admin: Admin };

export type LoginResult =
    | { ok: true }
    | { ok: false; reason: 'invalid' | 'throttled' | 'unreachable' | 'other'; retryAfter?: number; message?: string };

interface AuthValue {
    state: AuthState;
    admin: Admin | null;
    login: (username: string, password: string) => Promise<LoginResult>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

// Answers from these are about signing in, not a sign that the session died.
const AUTH_PATHS = /\/auth\/(login|logout|me)$/;

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;
        fetchJSON<{ admin: Admin }>('/auth/me')
            .then(({ ok, data }) => {
                if (!cancelled) setState(ok ? { status: 'signedIn', admin: data.admin } : { status: 'signedOut', expired: false });
            })
            .catch(() => { if (!cancelled) setState({ status: 'signedOut', expired: false }); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const id = http.interceptors.response.use((res) => {
            if (res.status === 401 && !AUTH_PATHS.test(String(res.config.url || '').split('?')[0])) {
                setState((prev) => (prev.status === 'signedIn' ? { status: 'signedOut', expired: true } : prev));
            }
            return res;
        });
        return () => http.interceptors.response.eject(id);
    }, []);

    const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
        try {
            const { ok, status, data } = await sendJSON<{ admin: Admin; error?: string; retry_after?: number }>(
                '/auth/login', 'POST', { username, password });
            if (ok) {
                setState({ status: 'signedIn', admin: data.admin });
                return { ok: true };
            }
            if (status === 401) return { ok: false, reason: 'invalid' };
            if (status === 429) return { ok: false, reason: 'throttled', retryAfter: data.retry_after };
            if (status >= 500 || status === 0) return { ok: false, reason: 'unreachable' };
            return { ok: false, reason: 'other', message: data.error };
        } catch {
            return { ok: false, reason: 'unreachable' };
        }
    }, []);

    const logout = useCallback(async () => {
        try { await sendJSON('/auth/logout', 'POST'); } catch { /* signed out here regardless */ }
        setState({ status: 'signedOut', expired: false });
    }, []);

    const value = useMemo<AuthValue>(() => ({
        state, admin: state.status === 'signedIn' ? state.admin : null, login, logout,
    }), [state, login, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth outside AuthProvider');
    return ctx;
}

/** A same-app path to return to after signing in; anything else is ignored. */
export function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login')) return '/dashboard';
    return raw;
}

/** Renders its children only for a signed-in admin; otherwise sends them to sign in and back. */
export function RequireAuth({ children }: { children: ReactNode }) {
    const { state } = useAuth();
    const location = useLocation();
    if (state.status === 'loading') return null;
    if (state.status === 'signedOut') {
        const next = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/login?next=${next}${state.expired ? '&expired=1' : ''}`} replace />;
    }
    return <>{children}</>;
}
