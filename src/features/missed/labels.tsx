import type { ReactNode } from 'react';

import { t } from '../../i18n';
import { fmtQty, fmtToman, isMissing } from '../../shared/lib';

// A buy leg is held in Toman and a sell leg in the pair's base coin; one
// formatter for both would print Toman to eight decimals or BTC to none.
const TOMAN_ASSETS = new Set(['IRT', 'TMN', 'IRR']);

export function Amount({ n, asset }: { n: number | null | undefined; asset: string }): ReactNode {
    if (isMissing(n)) return '—';
    return <>{TOMAN_ASSETS.has(asset.toUpperCase()) ? fmtToman(n) : fmtQty(n, 6)} <span className="fee-text">{asset}</span></>;
}

// What stopped the trade, for a badge. Refusal outcomes reuse the
// projections page's short labels so the two pages name them the same.
const ERROR_KINDS: Record<string, string> = {
    execution_failed: 'missed.error.executionFailed',
    skipped_below_min_trade: 'opps.outcomeShort.belowMinTrade',
    skipped_order_circuit: 'opps.outcomeShort.orderCircuit',
    skipped_quantity_too_small: 'opps.outcomeShort.quantityTooSmall',
    refused_implausible: 'opps.outcomeShort.implausible',
};

export const errorLabel = (kind: string) => (ERROR_KINDS[kind] ? t(ERROR_KINDS[kind]) : kind);
export const count = (n: number | undefined) => fmtQty(n, 0);
