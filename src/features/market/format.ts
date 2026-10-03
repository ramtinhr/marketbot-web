import { format, t } from '../../i18n';

export const baseOf = (symbol: unknown) => String(symbol || '').split('_')[0] || '';
export const quoteLabel = () => t('common.toman');
export const pairLabel = (symbol: unknown) => `${baseOf(symbol)} / ${quoteLabel()}`;
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Persian and Arabic-Indic digits, grouping commas and the Persian decimal
// mark all mean the same number; the engine wants plain ASCII decimals.
function normalizeDigits(raw: unknown): string {
    return String(raw || '')
        .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[٫]/g, '.')
        .replace(/[,٬\s]/g, '');
}
export function parseAmount(raw: unknown): string | null {
    const s = normalizeDigits(raw);
    return /^\d+(\.\d{1,8})?$/.test(s) && Number(s) > 0 ? s : null;
}
// Rounded down to 8 places, written without an exponent or trailing zeros.
export function toAmount(n: number): string {
    if (!(n > 0) || !Number.isFinite(n)) return '';
    const floored = Math.floor(n * 1e8 + 1e-6) / 1e8;
    return floored > 0 ? floored.toFixed(8).replace(/\.?0+$/, '') : '';
}

// ---- Number formats: decided by the asset, never by the number's size ----
//
// Sizing decimals by magnitude put 3.0099, 92.56 and 663 in one column and
// Toman prices to two decimals. Each asset now has one precision, shown in
// full (trailing zeros kept) so a column lines up: Toman is whole - it has
// no sub-unit - and each coin gets the decimals it actually trades in.
const ASSET_DIGITS: Record<string, number> = {
    IRT: 0, USDT: 2, USDC: 2,
    BTC: 8, ETH: 6, BNB: 4, SOL: 4,
    XRP: 2, TRX: 2, DOGE: 2, ADA: 2, SHIB: 0,
};
const DEFAULT_ASSET_DIGITS = 4;
const assetDigits = (asset: unknown) => ASSET_DIGITS[String(asset || '').toUpperCase()] ?? DEFAULT_ASSET_DIGITS;
export const blank = (v: unknown) => v === null || v === undefined || v === '' || !Number.isFinite(Number(v));

/** A number to exactly `digits` decimals. */
export const fixed = (n: number, digits: number) => format.number(n, { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * An amount of `asset` at that asset's precision. `floor` rounds down rather
 * than to nearest - for balances, which must never read as more than is
 * there to spend.
 */
export function fmtAsset(v: unknown, asset: unknown, { floor = false } = {}): string {
    if (blank(v)) return '—';
    const digits = assetDigits(asset);
    let n = num(v);
    if (floor) {
        const f = 10 ** digits;
        n = Math.floor(n * f + 1e-9) / f;
    }
    return fixed(n, digits);
}
export const fmtToman = (v: unknown) => fmtAsset(v, 'IRT');
export const fmtTime = (v: unknown) => format.time(v);
export const sideWord = (side: string) => t(side === 'buy' ? 'market.side.buy' : 'market.side.sell');

/** The class and arrow for a price that last moved up (1), down (-1) or not at all. */
export const dirClass = (d: number) => (d > 0 ? 'mk-up' : d < 0 ? 'mk-down' : '');
export const dirArrow = (d: number) => (d > 0 ? ' ↑' : d < 0 ? ' ↓' : '');
