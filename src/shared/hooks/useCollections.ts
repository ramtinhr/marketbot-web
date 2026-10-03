import { useCallback, useEffect, useState } from 'react';

/**
 * Every value seen so far, in first-seen order (each batch sorted). Filter
 * dropdowns use it so a venue does not vanish from the list just because the
 * current page of results happens not to mention it.
 */
export function useAccumulated(values: readonly (string | null | undefined)[]): string[] {
    const [seen, setSeen] = useState<string[]>([]);
    const key = values.join('\u0000');
    useEffect(() => {
        setSeen((prev) => {
            const have = new Set(prev);
            const add = [...new Set(values.filter((v): v is string => Boolean(v)))].filter((v) => !have.has(v)).sort();
            return add.length ? [...prev, ...add] : prev;
        });
        // `key` is the content of `values`; the array itself is new every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return seen;
}

/** Which rows of a list are open. */
export function useExpanded<K = string | number>() {
    const [open, setOpen] = useState<ReadonlySet<K>>(() => new Set());
    const toggle = useCallback((key: K) => setOpen((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    }), []);
    return { isOpen: (key: K) => open.has(key), toggle };
}
