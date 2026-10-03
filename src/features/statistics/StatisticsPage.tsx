// Statistics page: three views of the same slice of collected data.
//
// The slice is chosen once, in the toolbar, and every chart re-renders against
// it, so no two panels can be describing different windows.
import { useEffect, useMemo, useState } from 'react';

import { msg, useI18n } from '../../i18n';
import { fmtInt } from '../../shared/charts/charts';
import { usePageStatus } from '../../shared/stores/pageStatus';
import { providerCodes, useOrderLimits, useStatsSlice } from './api';
import { OpportunitiesPanel } from './components/OpportunitiesPanel';
import { PricePanel } from './components/PricePanel';
import { StatsToolbar } from './components/StatsToolbar';
import { ThresholdPanel } from './components/ThresholdPanel';
import { makeModel, type StatsData } from './model';
import { useProviderToggles } from './useProviderToggles';
import { useStatsControls } from './useStatsControls';

const EMPTY_DATA: StatsData = { loaded: false, history: null, projections: [], projectionTotal: 0, projectionTruncated: false };

export default function StatisticsPage() {
    const { t } = useI18n();
    const { showError } = usePageStatus();
    const [controls, set] = useStatsControls();
    const { range, symbol } = controls;

    const limitsQuery = useOrderLimits(symbol);
    // A failure falls back to raw quotes and says so, instead of showing
    // fee-free prices under a "fees included" label.
    useEffect(() => {
        if (!limitsQuery.error) return;
        console.warn('[marketbot] order limits unavailable:', limitsQuery.error);
        set({ priceMode: 'raw' });
        showError(msg('stats.limitsUnavailable'));
    }, [limitsQuery.error, limitsQuery.errorUpdatedAt, set, showError]);
    const limits = limitsQuery.isError ? null : limitsQuery.data ?? null;

    // The pair list comes from the server rather than the markup, so a pair
    // added to the bot appears here without a second edit.
    const [symbols, setSymbols] = useState<string[]>(['USDT_IRT']);
    const tradedKey = limitsQuery.data?.symbols?.join(',') ?? '';
    useEffect(() => {
        if (tradedKey) setSymbols(tradedKey.split(','));
    }, [tradedKey]);

    const slice = useStatsSlice(range, symbol, !limitsQuery.isPending);
    const data = useMemo<StatsData>(() => (slice.data ? { loaded: true, ...slice.data } : EMPTY_DATA), [slice.data]);
    const codes = useMemo(() => slice.data && providerCodes(slice.data.history, slice.data.projections), [slice.data]);
    const toggles = useProviderToggles(codes, slice.dataUpdatedAt);
    const { enabled } = toggles;

    const { showBid, showAsk, priceMode, oppMetric, oppShape, realOnly, deltaMetric } = controls;
    const model = useMemo(() => makeModel({
        data, limits, enabled, showBid, showAsk, priceMode, oppMetric, oppShape, realOnly, deltaMetric,
    }), [data, limits, enabled, showBid, showAsk, priceMode, oppMetric, oppShape, realOnly, deltaMetric]);

    // A truncated sample has to say so on the chart it shaped.
    useEffect(() => {
        if (!data.loaded || !data.projectionTruncated) return;
        showError(msg('stats.threshold.truncated', {
            shown: fmtInt.format(data.projections.length),
            total: fmtInt.format(data.projectionTotal),
        }));
    }, [data, enabled, deltaMetric, showError]);

    // Before the first load the fee-inclusive wording stands.
    const effective = data.loaded ? model.effective : priceMode === 'effective';
    // The switch labels name what the two lines currently are, so a reader
    // toggling "Buy cost" off is never left wondering which line went. They
    // are taken as the catalogue wrote them (capitalising the first letter is
    // a Latin-script habit).
    const sideLabels = effective
        ? { strong: t('stats.side.sellNet'), soft: t('stats.side.buyCost') }
        : { strong: t('stats.side.bid'), soft: t('stats.side.ask') };

    const refresh = () => {
        if (limitsQuery.isError) void limitsQuery.refetch();
        void slice.refetch();
    };
    const loading = slice.isFetching || limitsQuery.isFetching;

    return (
        <>
            <StatsToolbar controls={controls} set={set} symbols={symbols} toggles={toggles} sideLabels={sideLabels} onRefresh={refresh} />
            <PricePanel data={data} model={model} loading={loading} effective={effective} sideLabels={sideLabels} />
            <OpportunitiesPanel data={data} model={model} loading={loading} controls={controls} set={set} />
            <ThresholdPanel data={data} model={model} loading={loading} deltaMetric={deltaMetric} set={set} />
            <footer className="page-footer">{t('stats.footer')}</footer>
        </>
    );
}
