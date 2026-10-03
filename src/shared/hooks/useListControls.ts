import { useCallback, useState, type KeyboardEvent } from 'react';

export type SortDir = 'asc' | 'desc';

export interface ListView {
    page: number;
    sort: string;
    dir: SortDir;
}

/**
 * The state behind a filterable, sortable, paged list: the filters being
 * edited, the filters last applied (what the query is keyed on), and the
 * page and sort. Editing a filter changes nothing until it is applied.
 */
export function useListControls<F extends object>(initialFilters: () => F, initialView: ListView = { page: 1, sort: '', dir: 'desc' }) {
    const [draft, setDraft] = useState<F>(initialFilters);
    const [applied, setApplied] = useState<F>(draft);
    const [view, setView] = useState<ListView>(initialView);

    const setFilter = useCallback(<K extends keyof F>(key: K, value: F[K]) => setDraft((d) => ({ ...d, [key]: value })), []);

    /** Applies the draft (plus `patch`, for a control that applies itself) and returns to page one. */
    const apply = (patch: Partial<F> = {}) => {
        const next = { ...draft, ...patch };
        setDraft(next);
        setApplied(next);
        setView((v) => ({ ...v, page: 1 }));
    };

    const reset = () => {
        const fresh = initialFilters();
        setDraft(fresh);
        setApplied(fresh);
        setView(initialView);
    };

    const setPage = (page: number) => setView((v) => ({ ...v, page }));

    /** The same column flips direction; a new one starts descending. */
    const sortBy = (sort: string) => setView((v) => (v.sort === sort
        ? { ...v, dir: v.dir === 'asc' ? 'desc' : 'asc', page: 1 }
        : { sort, dir: 'desc', page: 1 }));

    const applyOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') apply(); };

    return { draft, setFilter, applied, apply, reset, view, setPage, sortBy, applyOnEnter };
}
