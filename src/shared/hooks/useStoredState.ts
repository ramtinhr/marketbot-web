import { useCallback, useState } from 'react';

import { readStore, writeStore } from '../lib/storage';

/** useState backed by localStorage (string values). */
export function useStoredState(key: string, fallback: string): [string, (v: string) => void] {
    const [value, setValue] = useState<string>(() => readStore(key) ?? fallback);
    const set = useCallback((v: string) => {
        setValue(v);
        writeStore(key, v);
    }, [key]);
    return [value, set];
}
