import { useMemo } from 'react';

import { useI18n } from '../../../i18n';
import { DataTable, EChart, fmtDateTime, fmtInt, fmtPrice, useChartTokens, type ChartEmpty, type Column } from '../../../shared/charts/charts';
import { providerLabel } from '../../../shared/lib';
import type { Model, StatsData } from '../model';
import { ChartOrTable, ChartPanel } from './ChartPanel';

type PriceRow = { t: string; byProvider: Record<string, any> };

/** Bid and ask per provider. */
export function PricePanel({ data, model, loading, effective, sideLabels }: {
    data: StatsData;
    model: Model;
    loading: boolean;
    effective: boolean;
    sideLabels: { strong: string; soft: string };
}) {
    const { t, plural, format } = useI18n();
    const tokens = useChartTokens();
    const option = useMemo(() => model.buildPriceOption(tokens), [model, tokens]);
    const { history } = data;
    const visible = model.visibleSeries;

    let meta = '—';
    let empty: ChartEmpty | null = null;
    let shown: any | null = null;
    if (data.loaded) {
        if (!history || history.empty) {
            meta = t('stats.price.meta.noData');
            empty = { message: t('stats.price.empty'), hint: t('stats.price.emptyHint') };
        } else if (!visible.length) {
            meta = t('stats.price.meta.noProviders');
            empty = { message: t('stats.price.allHidden'), hint: t('stats.price.allHiddenHint') };
        } else {
            meta = plural('stats.price.meta', visible.length, {
                count: format.number(visible.length),
                bucket: format.number(history.bucket_seconds),
            });
            shown = option;
        }
    }
    const caption = data.loaded && history && !history.empty
        ? t('stats.price.captionFull', { bucket: format.number(history.bucket_seconds), samples: fmtInt.format(history.total_samples) })
        : t('stats.price.caption');

    const columns: Column<PriceRow>[] = [
        { label: t('common.time'), render: (r) => fmtDateTime(r.t) },
        ...visible.flatMap((x) => (['strong', 'soft'] as const).map((half): Column<PriceRow> => ({
            label: `${providerLabel(x.provider)} ${sideLabels[half]}`,
            render: (r) => {
                const p = r.byProvider[x.provider];
                if (!p) return '—';
                const v = model.quoteOf(p, x.provider)[half];
                return v === null ? '—' : fmtPrice(v);
            },
        }))),
    ];

    return (
        <ChartPanel id="prices" title={t(effective ? 'stats.price.title.effective' : 'stats.price.title.raw')} meta={meta}
                    note={effective ? 'stats.price.note.effective' : 'stats.price.note.raw'} caption={caption}>
            {/* The unit keys the marks rather than repeating the y-axis unit:
                the axis states what is measured, this states how to read the
                two lines per venue. */}
            {(view) => (
                <ChartOrTable view={view} unit={t(effective ? 'stats.price.unit.effective' : 'stats.price.unit.raw')}
                              chart={<EChart className="chart-box tall" option={shown} empty={empty} loading={loading} />}
                              table={data.loaded && <DataTable columns={columns} rows={model.priceTableRows()} limit={300} emptyText={t('stats.price.tableEmpty')} />} />
            )}
        </ChartPanel>
    );
}
