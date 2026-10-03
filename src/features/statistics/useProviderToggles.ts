import { useEffect, useMemo, useState } from 'react';

import { useAccumulated } from '../../shared/hooks';

export interface ProviderToggles {
    /** Every venue seen so far, sorted; null before the first load. */
    known: string[] | null;
    /** Null until the provider list arrives; then the codes drawn. */
    enabled: Set<string> | null;
    isEnabled: (code: string) => boolean;
    toggle: (code: string, on: boolean) => void;
}

/**
 * Which venues the charts draw. Toggling re-renders from data already in
 * hand; every fresh load switches every known venue back on.
 */
export function useProviderToggles(codes: string[] | undefined, loadedAt: number): ProviderToggles {
    const seen = useAccumulated(codes ?? []);
    const known = useMemo(() => [...seen].sort(), [seen]);
    const [enabled, setEnabled] = useState<Set<string> | null>(null);

    const knownKey = known.join(',');
    useEffect(() => {
        if (loadedAt) setEnabled(new Set(known));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadedAt, knownKey]);

    return {
        known: codes === undefined ? null : known,
        enabled,
        isEnabled: (code) => !enabled || enabled.has(String(code || '').toLowerCase()),
        toggle: (code, on) => setEnabled((prev) => {
            const next = new Set(prev ?? known);
            if (on) next.add(code); else next.delete(code);
            return next;
        }),
    };
}
