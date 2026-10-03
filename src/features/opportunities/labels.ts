import { t } from '../../i18n';
import { fmtQty } from '../../shared/lib';
import type { BestPriceFigures, Placeable, Projection } from './api';

/** A label, its status-badge tone, and a longer sentence. */
interface Labelled { label: string; badge: string; long: string }

// Whether a best-price order clears both venues' minimum order quantities.
// Three-valued on purpose: the minimums are not on the row, so "unknown" is
// a real answer and must not be dressed up as a yes.
const PLACEABILITY: Record<Placeable, [string, string, string]> = {
    yes: ['opps.placeable.yes', 'completed', 'opps.placeable.yesHint'],
    no: ['opps.placeable.no', 'failed', 'opps.placeable.noHint'],
    unknown: ['opps.placeable.unknown', 'pending', 'opps.placeable.unknownHint'],
};

export function placeabilityOf(state: Placeable): Labelled {
    const [label, badge, hint] = PLACEABILITY[state] || PLACEABILITY.unknown;
    return { label: t(label), badge, long: t(hint) };
}

// The outcome codes are the bot's own enum; each maps to a short badge for
// the table and a full sentence for the detail view, where there is room for
// one and the abbreviation would be guesswork.
const OUTCOMES: Record<string, [string, string, string]> = {
    executed: ['opps.outcomeShort.executed', 'completed', 'opps.outcomeLong.executed'],
    skipped_below_min_trade: ['opps.outcomeShort.belowMinTrade', 'pending', 'opps.outcomeLong.belowMinTrade'],
    skipped_order_circuit: ['opps.outcomeShort.orderCircuit', 'failed', 'opps.outcomeLong.orderCircuit'],
    skipped_quantity_too_small: ['opps.outcomeShort.quantityTooSmall', 'pending', 'opps.outcomeLong.quantityTooSmall'],
    refused_implausible: ['opps.outcomeShort.implausible', 'failed', 'opps.outcomeLong.implausible'],
    skipped_not_best: ['opps.outcomeShort.notBest', 'pending', 'opps.outcomeLong.notBest'],
};

/** An outcome this page has not learned yet shows its raw code rather than nothing. */
export function outcomeOf(code: string): Labelled {
    const hit = OUTCOMES[code];
    return hit ? { label: t(hit[0]), badge: hit[1], long: t(hit[2]) } : { label: code, badge: 'pending', long: code };
}

/** The outcome filter's choices. */
export const OUTCOME_OPTIONS: Array<[string, string]> = [
    ['executed', 'opps.outcome.executed'],
    ['skipped_below_min_trade', 'opps.outcome.belowMinTrade'],
    ['skipped_order_circuit', 'opps.outcome.orderCircuit'],
    ['skipped_quantity_too_small', 'opps.outcome.quantityTooSmall'],
    ['refused_implausible', 'opps.outcome.implausible'],
    ['skipped_not_best', 'opps.outcome.notBest'],
];

const LIMIT_KEYS: Record<string, [long: string, short: string, option: string]> = {
    depth: ['opps.limit.depth', 'opps.limitShort.depth', 'opps.limitOption.depth'],
    buy_balance: ['opps.limit.buyBalance', 'opps.limitShort.buyBalance', 'opps.limitOption.buyBalance'],
    sell_balance: ['opps.limit.sellBalance', 'opps.limitShort.sellBalance', 'opps.limitOption.sellBalance'],
    config: ['opps.limit.config', 'opps.limitShort.config', 'opps.limitOption.config'],
};

export const LIMIT_CODES = Object.keys(LIMIT_KEYS);
export const limitLabel = (code: string) => (LIMIT_KEYS[code] ? t(LIMIT_KEYS[code][0]) : code);
export const limitShort = (code: string) => (LIMIT_KEYS[code] ? t(LIMIT_KEYS[code][1]) : code);
export const limitOption = (code: string) => t(LIMIT_KEYS[code][2]);

// A cap of -1 is "not known" and must never render as a venue holding
// nothing - see OpportunityProjection.BuyBalanceMaxAmount.
export const fmtCap = (n: number) => (n === -1 ? t('opps.notKnown') : fmtQty(n, 4) + ' USDT');

// Every best-price figure is computed server-side and arrives on the row.
// Nothing here recomputes it.
export const bestPriceOf = (r: Projection): BestPriceFigures => r.best_price || { known: false, placeable: 'unknown' };
