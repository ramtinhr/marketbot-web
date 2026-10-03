import { create } from 'zustand';

import { ApiError, http } from '../../shared/api';
import { authApi, type Admin } from './api';

// Who is signed in. The session itself is an HttpOnly cookie the API sets and
// this code never sees; what the app knows is whether GET /auth/me answers.
// Any 401 afterwards - the session expired, or was ended by a password change
// on another tab - drops back to the sign-in page, which returns here after.

export type AuthStatus =
    | { status: 'loading' }
    | { status: 'signedOut'; expired: boolean }
    | { status: 'signedIn'; admin: Admin };

export type LoginResult =
    | { ok: true }
    | { ok: false; reason: 'invalid' | 'throttled' | 'unreachable' | 'other'; retryAfter?: number; message?: string };

interface AuthState {
    session: AuthStatus;
    /** Asks the API who the cookie belongs to; once per page load. */
    restore: () => Promise<void>;
    login: (username: string, password: string) => Promise<LoginResult>;
    logout: () => Promise<void>;
}

function loginFailure(err: unknown): LoginResult {
    if (!(err instanceof ApiError) || err.status >= 500) return { ok: false, reason: 'unreachable' };
    if (err.status === 401) return { ok: false, reason: 'invalid' };
    if (err.status === 429) return { ok: false, reason: 'throttled', retryAfter: Number(err.data.retry_after) || undefined };
    return { ok: false, reason: 'other', message: typeof err.data.error === 'string' ? err.data.error : undefined };
}

let restoring: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()((set) => ({
    session: { status: 'loading' },

    restore: () => {
        restoring ??= authApi.me()
            .then((admin) => set({ session: { status: 'signedIn', admin } }))
            .catch(() => set({ session: { status: 'signedOut', expired: false } }));
        return restoring;
    },

    login: async (username, password) => {
        try {
            const admin = await authApi.login(username, password);
            set({ session: { status: 'signedIn', admin } });
            return { ok: true };
        } catch (err) {
            return loginFailure(err);
        }
    },

    logout: async () => {
        try { await authApi.logout(); } catch { /* signed out here regardless */ }
        set({ session: { status: 'signedOut', expired: false } });
    },
}));

// Answers from these are about signing in, not a sign that the session died.
const AUTH_PATHS = /\/auth\/(login|logout|me)$/;

http.interceptors.response.use((res) => {
    if (res.status === 401 && !AUTH_PATHS.test(String(res.config.url || '').split('?')[0])) {
        const { session } = useAuthStore.getState();
        if (session.status === 'signedIn') useAuthStore.setState({ session: { status: 'signedOut', expired: true } });
    }
    return res;
});

/** The signed-in admin, or null. */
export function useCurrentAdmin(): Admin | null {
    return useAuthStore((s) => (s.session.status === 'signedIn' ? s.session.admin : null));
}
