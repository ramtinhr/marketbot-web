import { useCallback, useEffect, useRef, useState } from 'react';

import { readStore, writeStore } from './ui';

/**
 * Calls `fn` now and every `ms` after, always the latest `fn` (so it can close
 * over current state without re-arming the timer). `ms` of 0/null disables the
 * interval but still runs once. Returns a function that runs it on demand.
 */
export function usePolling(fn: () => unknown, ms: number | null, deps: unknown[] = []): () => void {
    const ref = useRef(fn);
    ref.current = fn;
    const run = useCallback(() => { void ref.current(); }, []);
    useEffect(() => {
        run();
        if (!ms) return undefined;
        const id = window.setInterval(run, ms);
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ms, run, ...deps]);
    return run;
}

/** A plain interval with the latest callback, no immediate run. */
export function useInterval(fn: () => void, ms: number | null): void {
    const ref = useRef(fn);
    ref.current = fn;
    useEffect(() => {
        if (!ms) return undefined;
        const id = window.setInterval(() => ref.current(), ms);
        return () => window.clearInterval(id);
    }, [ms]);
}

/** useState backed by localStorage (string values). */
export function useStoredState(key: string, fallback: string): [string, (v: string) => void] {
    const [value, setValue] = useState<string>(() => readStore(key) ?? fallback);
    const set = useCallback((v: string) => {
        setValue(v);
        writeStore(key, v);
    }, [key]);
    return [value, set];
}
