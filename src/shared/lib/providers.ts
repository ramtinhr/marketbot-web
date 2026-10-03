import { t } from '../../i18n';

// ---- Provider colour mapping: one hue per venue, everywhere ----
//
// A fixed slot order, assigned by provider code, so a colour follows the venue
// and nothing else. Not by rank, not by registration order, not by a hash of
// the name: filtering a provider out of a chart, or one going offline, must
// not repaint the others.
//
// The eight slots are validated for colour-vision deficiency in both themes,
// in this order (worst adjacent pair: CVD dE 9.2 light / 9.4 dark,
// normal-vision dE 27.6 / 19.7). Re-run the check before touching the order or
// adding a slot - the ordering is what makes the set safe, not the hexes.
//
// Deliberately none of the status colours (--green/--red/--amber): those mean
// bid, ask, profit, loss and warning across this dashboard, and a venue that
// happened to be painted green would read as a direction.
export const providerPalette = {
    dark: ['#3987e5', '#d95926', '#199e70', '#9085e9', '#d55181', '#5598e7', '#c98500', '#e66767'],
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7', '#e87ba4', '#256abf', '#eda100', '#e34948'],
};

// Slots are claimed in sorted order of provider code as codes are first seen,
// so a given set of venues always produces the same assignment whatever order
// the API returned them in.
const providerSlots: Record<string, number> = {};

export function currentTheme(): 'dark' | 'light' {
    const stamped = document.documentElement.getAttribute('data-theme');
    if (stamped === 'light' || stamped === 'dark') return stamped;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Claims slots for a whole set at once. Call it with every provider a page
 * knows about before drawing, so the assignment reflects the full set rather
 * than whichever arrived first.
 */
export function registerProviders(codes: Array<string | null | undefined>): Record<string, number> {
    const fresh = (codes || [])
        .map(c => String(c || '').toLowerCase().trim())
        .filter(c => c && !(c in providerSlots))
        .sort();
    let next = Object.keys(providerSlots).length;
    fresh.forEach(code => { providerSlots[code] = next++; });
    return providerSlots;
}

export function providerSlot(code: string | null | undefined): number {
    const key = String(code || '').toLowerCase().trim();
    if (!(key in providerSlots)) registerProviders([key]);
    return providerSlots[key];
}

/**
 * The one function every page and chart asks. Past the eighth venue the slots
 * would repeat, which is indistinguishable under CVD - a ninth exchange needs
 * a real decision, so it is logged rather than silently cycled.
 */
export function providerColor(code: string | null | undefined): string {
    const palette = providerPalette[currentTheme()];
    const slot = providerSlot(code);
    if (slot >= palette.length) console.warn('[marketbot] no validated colour slot left for provider', code);
    return palette[slot % palette.length];
}

/** A soft form of the same hue, for the secondary half of a pair (an ask against its bid). */
export function providerColorSoft(code: string | null | undefined, alpha = 0.55): string {
    return withAlpha(providerColor(code), alpha);
}

export function withAlpha(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Venue codes are lowercase in the DB and title-case on screen. */
export function providerLabel(code: string | null | undefined): string {
    const s = String(code || '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : t('common.unknown');
}
