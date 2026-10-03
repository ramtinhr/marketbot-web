import { useMemo } from 'react';

import { useI18n } from '../../../i18n';
import {
    DataTable, EChart, Swatch, fmtDateTime, fmtInt, fmtPct, fmtQty, fmtToman, useChartTokens, type ChartEmpty, type Column,
} from '../../../shared/charts/charts';
import { providerLabel } from '../../../shared/lib';
import { Segmented } from '../../../shared/ui';
import type { StatsProjection } from '../api';
import type { Model, StatsData } from '../model';
import type { SetControls, StatsControls } from '../useStatsControls';
import { ChartOrTable, ChartPanel, Control } from './ChartPanel';

/** Arbitrage opportunities over the slice. */
export function OpportunitiesPanel({ data, model, loading, controls, set }: {
    data: StatsData;
    model: Model;
    loading: boolean;
    controls: StatsControls;
    set: SetControls;
}) {
    const { t, plural } = useI18n();
    const tokens = useChartTokens();
    const option = useMemo(() => model.buildOppOption(tokens), [model, tokens]);
    const rows: StatsProjection[] = model.visibleProjections();
    const excluded = model.excludedCount();

    let meta = '—';
    let empty: ChartEmpty | null = null;
    let shown: any | null = null;
    if (data.loaded) {
        if (!data.projections.length) {
            meta = t('stats.opp.meta.none');
            empty = { message: t('stats.opp.empty'), hint: t('stats.opp.emptyHint') };
        } else if (!rows.length && excluded > 0) {
            meta = t('stats.opp.meta.zeroRealOf', { total: fmtInt.format(excluded + rows.length) });
            empty = { message: t('stats.opp.noneTradeable', { count: fmtInt.format(excluded) }), hint: t('stats.opp.noneTradeableHint') };
        } else if (!rows.length) {
            meta = t('stats.opp.meta.zeroOf', { total: fmtInt.format(data.projections.length) });
            empty = { message: t('stats.opp.noneEnabled'), hint: t('stats.price.allHiddenHint') };
        } else {
            meta = controls.realOnly
                ? t('stats.opp.meta.realOf', { real: fmtInt.format(rows.length), total: fmtInt.format(rows.length + excluded) })
                : plural('stats.opp.meta.detections', rows.length, { count: fmtInt.format(rows.length) });
            shown = option;
        }
    }

    const columns: Column<StatsProjection>[] = [
        { label: t('opps.col.detected'), render: (r) => fmtDateTime(r.detected_at) },
        {
            label: t('common.route'),
            render: (r) => (
                <span>
                    <Swatch code={r.buy_provider} />
                    <span style={{ marginLeft: '7px' }}>{`${providerLabel(r.buy_provider)} → ${providerLabel(r.sell_provider)}`}</span>
                </span>
            ),
        },
        { label: t('stats.opp.col.edgePct'), render: (r) => fmtPct(r.scored_profit_pct, 3), className: (r) => (r.scored_profit_pct > 0 ? 'profit-positive' : 'profit-negative') },
        { label: t('stats.opp.col.netToman'), render: (r) => fmtToman(r.net_profit) },
        { label: t('stats.opp.col.sizeUsdt'), render: (r) => fmtQty(r.projected_amount) },
        { label: t('stats.opp.tip.placeable'), render: (r) => t(r.placeable ? 'common.yes' : 'common.no') },
        { label: t('common.outcome'), render: (r) => r.outcome },
    ];

    const pickers = (
        <>
            <Control label={t('stats.toolbar.measure')}>
                <Segmented value={controls.oppMetric} onPick={(oppMetric) => set({ oppMetric })} options={[
                    { value: 'pct', label: t('stats.opp.metric.pct') },
                    { value: 'net', label: t('stats.opp.metric.net') },
                ]} />
            </Control>
            <Control label={t('stats.toolbar.shape')}>
                <Segmented value={controls.oppShape} onPick={(oppShape) => set({ oppShape })} options={[
                    { value: 'points', label: t('stats.opp.shape.points') },
                    { value: 'lines', label: t('stats.opp.shape.lines') },
                ]} />
            </Control>
            {/* Scopes the opportunities chart. The threshold panel keeps both
                lines regardless, since its whole subject is the difference
                between them. */}
            <Control label={t('stats.toolbar.show')}>
                <Segmented value={controls.realOnly ? 'real' : 'all'} onPick={(v) => set({ realOnly: v === 'real' })} options={[
                    { value: 'real', label: t('stats.opp.real.realOnly') },
                    { value: 'all', label: t('stats.opp.real.all') },
                ]} />
            </Control>
        </>
    );

    return (
        <ChartPanel id="opportunities" title={t('stats.opp.title')} meta={meta} controls={pickers} note="stats.opp.note" caption={t('stats.opp.caption')}>
            {(view) => (
                <ChartOrTable view={view} unit={t('stats.opp.unit')}
                              chart={<EChart className="chart-box tall" option={shown} empty={empty} loading={loading} />}
                              table={data.loaded && <DataTable columns={columns} rows={rows.slice().reverse()} limit={400} emptyText={t('stats.opp.tableEmpty')} />} />
            )}
        </ChartPanel>
    );
}
