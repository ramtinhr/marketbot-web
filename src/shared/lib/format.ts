import { format } from '../../i18n';

export function fmtNum(n: number | string | null | undefined): string {
    return format.number(n);
}

/** A number, or an em dash when there is none. */
export function fmtNumOrDash(n: number | string | null | undefined): string {
    return n === null || n === undefined ? '—' : format.number(n);
}

export const isMissing = (n: unknown): n is null | undefined => n === null || n === undefined || Number.isNaN(Number(n));

// Toman figures run to millions, quantities to eight decimals - one formatter
// for both would make every column unreadable at one end or the other.

/** Whole Toman, or a dash. */
export const fmtToman = (n: number | null | undefined): string =>
    isMissing(n) ? '—' : format.number(n, { maximumFractionDigits: 0 });

/** A quantity to at most `d` decimals, or a dash. */
export const fmtQty = (n: number | null | undefined, d = 4): string =>
    isMissing(n) ? '—' : format.number(n, { maximumFractionDigits: d });

/** A headline figure shortened past a million (2.69B), or a dash. Pair it with the exact value somewhere it can be read. */
export const fmtCompact = (n: number | null | undefined): string =>
    isMissing(n) ? '—' : Math.abs(n) < 1e6
        ? format.number(n, { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 })
        : format.number(n, { notation: 'compact', maximumFractionDigits: 2 });

/** A percentage with an explicit sign, or a dash. */
export const fmtSignedPct = (n: number | null | undefined, d = 4): string =>
    isMissing(n) ? '—' : (n >= 0 ? '+' : '') + format.percent(n, d);

/** Short enough that a ten-column table fits without a horizontal scroll. */
export const fmtShortTime = (iso: string): string => format.dateTime(iso, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** Green for zero and up, red below; no colour when there is no figure. */
export function signClass(n: number | null | undefined): string {
    if (n === null || n === undefined || Number.isNaN(n)) return '';
    return n >= 0 ? 'profit-positive' : 'profit-negative';
}

/** A toman amount rounded to whole units. */
export function fmtRounded(n: number | null | undefined): string {
    return format.number(Math.round(n || 0));
}

export function escapeHtml(s: unknown): string {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] as string));
}

/** The first letter of a name, for an avatar. */
export function initial(name: string): string {
    return name.slice(0, 1).toUpperCase();
}
