import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuthStore } from './store';

/** A same-app path to return to after signing in; anything else is ignored. */
export function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login')) return '/dashboard';
    return raw;
}

/** Renders its children only for a signed-in admin; otherwise sends them to sign in and back. */
export function RequireAuth({ children }: { children: ReactNode }) {
    const session = useAuthStore((s) => s.session);
    const location = useLocation();

    if (session.status === 'loading') return null;
    if (session.status === 'signedOut') {
        const next = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/login?next=${next}${session.expired ? '&expired=1' : ''}`} replace />;
    }
    return <>{children}</>;
}
