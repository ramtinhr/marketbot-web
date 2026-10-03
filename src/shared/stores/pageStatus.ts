import type { ReactNode } from 'react';
import { create } from 'zustand';

import type { Message } from '../../i18n';

// The shell's per-page state: the live pill in the topbar, the error banner,
// the topbar's right-hand slot and title overrides. Pages write it, the shell
// reads it, and it resets whenever the route changes.
//
// The pill and banner hold what happened, not translated text, so they follow
// a language switch without refetching.

export type StatusPill =
    | { kind: 'default' }
    | { kind: 'updated'; at: number }
    | { kind: 'lost' }
    | { kind: 'text'; healthy: boolean; message: Message };

export type ErrorBanner =
    | { kind: 'unreachable' }
    | { kind: 'text'; text: string }
    | { kind: 'message'; message: Message };

export interface TitleOverride { title?: string; subtitle?: string; docTitle?: string }

export interface PageStatus {
    /** A good poll at `at` (ms): the pill reads "Updated hh:mm:ss" and the banner clears. */
    reportUpdated: (at?: number) => void;
    /** A failed poll: the pill reads "Connection lost" and the banner explains (null: no banner). */
    reportLost: (banner?: ErrorBanner | null) => void;
    /** A page's own pill wording (a catalogue message, or raw text); a healthy one also clears the banner. */
    setStatus: (healthy: boolean, message: Message | string) => void;
    /** Raw text (an API's own words) or a catalogue message, which follows a language switch. */
    showError: (error: string | Message) => void;
    hideError: () => void;
    /** Replaces the topbar's right-hand slot (manual-trade puts its mode badge there). */
    setTopbarRight: (node: ReactNode) => void;
    /** Overrides the topbar title/subtitle and the tab title with translated text; null restores the page's. */
    setTitles: (titles: TitleOverride | null) => void;
}

interface PageStatusState {
    pill: StatusPill;
    banner: ErrorBanner | null;
    topbarRight: ReactNode;
    titles: TitleOverride | null;
    actions: PageStatus & { reset: () => void };
}

const initial = { pill: { kind: 'default' }, banner: null, topbarRight: null, titles: null } as const;

export const usePageStatusStore = create<PageStatusState>()((set) => ({
    ...initial,
    actions: {
        reportUpdated: (at = Date.now()) => set({ pill: { kind: 'updated', at }, banner: null }),
        reportLost: (banner = { kind: 'unreachable' }) => set({ pill: { kind: 'lost' }, banner }),
        setStatus: (healthy, message) => set((s) => ({
            pill: { kind: 'text', healthy, message: typeof message === 'string' ? { text: message } : message },
            banner: healthy ? null : s.banner,
        })),
        showError: (error) => set({ banner: typeof error === 'string' ? { kind: 'text', text: error } : { kind: 'message', message: error } }),
        hideError: () => set({ banner: null }),
        setTopbarRight: (topbarRight) => set({ topbarRight }),
        setTitles: (titles) => set({ titles }),
        reset: () => set(initial),
    },
}));

/** The page's handle on the shell. Stable across renders. */
export function usePageStatus(): PageStatus {
    return usePageStatusStore((s) => s.actions);
}
