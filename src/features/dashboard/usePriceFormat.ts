import { useI18n } from '../../i18n';

export type FmtPrice = (n: number, ref?: number) => string;

/**
 * Enough decimals to tell two quotes apart at any price: whole Toman on USDT,
 * but SHIB trades near 1 and would round every venue to the same figure. A
 * difference of prices takes the scale of the prices (`ref`).
 */
export function usePriceFormat(): FmtPrice {
    const { format } = useI18n();
    return (n, ref = n) => {
        const abs = Math.abs(Number(ref));
        const digits = abs >= 1000 ? 1 : abs >= 1 ? 4 : 8;
        return format.number(n, { maximumFractionDigits: digits });
    };
}
