import { useCallback, useState } from 'react';

import type { DeltaMetric, OppMetric, OppShape, PriceMode, Range } from './model';

/** Every choice on the page that reshapes what the charts draw. */
export interface StatsControls {
    range: Range;
    symbol: string;
    showBid: boolean;
    showAsk: boolean;
    priceMode: PriceMode;
    oppMetric: OppMetric;
    oppShape: OppShape;
    realOnly: boolean;
    deltaMetric: DeltaMetric;
}

const INITIAL: StatsControls = {
    range: '6h',
    symbol: 'USDT_IRT',
    showBid: true,
    showAsk: true,
    // Prices are shown fee-inclusive by default: a raw bid/ask crossing
    // between two venues is not an opportunity, and the whole question this
    // page exists to answer is which crossings were real.
    priceMode: 'effective',
    oppMetric: 'pct',
    oppShape: 'points',
    // Only opportunities that could actually have been traded: the projected
    // order cleared both venues' minimums and the net was positive.
    realOnly: true,
    deltaMetric: 'cumulative',
};

export type SetControls = (patch: Partial<StatsControls>) => void;

export function useStatsControls(): [StatsControls, SetControls] {
    const [controls, setControls] = useState(INITIAL);
    const set = useCallback<SetControls>((patch) => setControls((c) => ({ ...c, ...patch })), []);
    return [controls, set];
}
