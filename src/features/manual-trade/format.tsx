import { format } from '../../i18n';
import { providerColor } from '../../shared/lib';

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export const baseAsset = (symbol: string | null | undefined) => String(symbol || '').split('_')[0] || '';

/** A price, more decimals when it is small; a dash for none (zero included). */
export const fmtPrice = (v: number | null | undefined) =>
    !finite(v) || v === 0 ? '—' : format.number(v, { maximumFractionDigits: v < 100 ? 6 : 2 });

/** A quantity to eight decimals, as the venues report it. */
export const fmtQty = (v: number | null | undefined) => (finite(v) ? format.number(v, { maximumFractionDigits: 8 }) : '—');

export const fmtToman = (v: number | null | undefined) => (finite(v) ? format.number(Math.round(v)) : '—');

/** A venue with its colour dot. */
export function VenueTag({ code }: { code: string }) {
    return <><span className="provider-dot" style={{ background: providerColor(code) }} /> <span className="provider-tag">{code}</span></>;
}
