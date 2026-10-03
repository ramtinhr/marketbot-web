import { useMemo } from 'react';

import { useI18n } from '../../../i18n';
import { DataTable, EChart, fmtInt, fmtPct, fmtQty, fmtToman, useChartTokens, type ChartEmpty, type Column } from '../../../shared/charts/charts';
import { Segmented } from '../../../shared/ui';
import { deltaMeasure, type DeltaMetric, type Model, type StatsData, type SweepPoint } from '../model';
import type { SetControls } from '../useStatsControls';
import { ChartPanel, Control } from './ChartPanel';

const DELTA_METRICS: DeltaMetric[] = ['cumulative', 'average', 'volume', 'capital'];

/** What the bot would have made at each entry threshold. */
export function ThresholdPanel({ data, model, loading, deltaMetric, set }: {
    data: StatsData;
    model: Model;
    loading: boolean;
    deltaMetric: DeltaMetric;
    set: SetControls;
}) {
    const { t } = useI18n();
    const tokens = useChartTokens();
    const sweep = useMemo(() => model.computeSweep(), [model]);
    const deltaOption = useMemo(() => model.buildDeltaOption(tokens, sweep), [model, tokens, sweep]);
    const sizeOption = useMemo(() => model.buildSizeOption(tokens, sweep), [model, tokens, sweep]);

    let meta = '—';
    let deltaEmpty: ChartEmpty | null = null;
    let sizeEmpty: ChartEmpty | null = null;
    if (data.loaded) {
        if (!sweep) {
            meta = t('stats.threshold.meta.none');
            deltaEmpty = { message: t('stats.threshold.empty'), hint: t('stats.threshold.emptyHint') };
            sizeEmpty = { message: t('stats.threshold.noSizes') };
        } else {
            meta = data.projectionTruncated
                ? t('stats.threshold.meta.of', { count: fmtInt.format(sweep.rowCount), total: fmtInt.format(data.projectionTotal) })
                : t('stats.threshold.meta.detections', { count: fmtInt.format(sweep.rowCount) });
            // The builder returns null when no venue published a size.
            sizeEmpty = { message: t('stats.threshold.noPublishedSize') };
        }
    }

    const columns: Column<SweepPoint>[] = [
        { label: t('stats.threshold.col.threshold'), render: (r) => fmtPct(r.threshold, 3) },
        { label: t('stats.threshold.col.realTrades'), render: (r) => fmtInt.format(r.placeableCount) },
        { label: t('stats.threshold.col.detections'), render: (r) => fmtInt.format(r.count) },
        { label: t('stats.threshold.col.volume'), render: (r) => fmtQty(r.placeableVolume, 2) },
        { label: t('stats.threshold.col.capital'), render: (r) => fmtToman(r.placeableDeployed) },
        { label: t('stats.threshold.col.gross'), render: (r) => fmtToman(r.placeableGross) },
        { label: t('stats.threshold.col.net'), render: (r) => fmtToman(r.placeableTotal) },
        { label: t('stats.threshold.col.return'), render: (r) => fmtPct(r.placeableReturnPct, 3) },
        { label: t('stats.threshold.col.perTrade'), render: (r) => fmtToman(r.placeableAvg) },
        { label: t('stats.threshold.col.inclUntradeable'), render: (r) => fmtToman(r.total) },
        { label: t('stats.threshold.col.medianSize'), render: (r) => (r.medianSize === null ? '—' : fmtQty(r.medianSize)) },
    ];

    const picker = (
        <Control label={t('stats.toolbar.measure')}>
            <Segmented value={deltaMetric} onPick={(m) => set({ deltaMetric: m })}
                       options={DELTA_METRICS.map((m) => ({ value: m, label: t(`stats.threshold.metric.${m}`) }))} />
        </Control>
    );

    return (
        <ChartPanel id="threshold" title={t('stats.threshold.title')} meta={meta} controls={picker} note="stats.threshold.note" caption={t('stats.threshold.caption')}>
            {/* Two charts under one toggle. */}
            {(view) => (
                <>
                    <div className="chart-stack">
                        <div className="stack-label" hidden={view === 'table'}>{t(deltaMeasure(deltaMetric).caption)}</div>
                        <div hidden={view === 'table'}>
                            <EChart className="chart-box" option={data.loaded ? deltaOption : null} empty={deltaEmpty} loading={loading} />
                        </div>
                        <div className="stack-label">{t('stats.threshold.sizeLabel')}</div>
                        <div hidden={view === 'table'}>
                            <EChart className="chart-box short" option={data.loaded ? sizeOption : null} empty={sizeEmpty} loading={loading} />
                        </div>
                    </div>
                    <div className="chart-table" hidden={view !== 'table'}>
                        {data.loaded && <DataTable columns={columns} rows={sweep ? sweep.points : []} limit={200} emptyText={t('stats.threshold.tableEmpty')} />}
                    </div>
                </>
            )}
        </ChartPanel>
    );
}
