import { useEffect, useRef } from 'react';

/**
 * A plain interval with the latest callback, no immediate run. For API data
 * prefer useLiveQuery; this is for work TanStack Query does not model (a
 * stream session, a clock).
 */
export function useInterval(fn: () => void, ms: number | null): void {
    const ref = useRef(fn);
    ref.current = fn;
    useEffect(() => {
        if (!ms) return undefined;
        const id = window.setInterval(() => ref.current(), ms);
        return () => window.clearInterval(id);
    }, [ms]);
}
