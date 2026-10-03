import { useI18n } from '../../i18n';
import { useAccumulated, useListControls } from '../../shared/hooks';
import { Field, Html, PageFooter, Pagination, Panel, SelectField, Skeleton, valueOptions, type Option } from '../../shared/ui';
import { DEFAULT_VIEW, defaultFilters, useMissedReport, type MissedFilters, type MissedReport } from './api';
import { MissedRows } from './components/MissedRows';
import { MissedSummary } from './components/MissedSummary';
import { PairsTable } from './components/PairsTable';
import { TopupTable } from './components/TopupTable';
import './MissedOpportunities.css';

const percentOptions = (values: string[]) => valueOptions(values, (v) => `${v}%`);

/** Every venue the report mentions, in rows or in the top-up plan. */
const venuesOf = (data: MissedReport | undefined) => [
    ...(data?.rows ?? []).flatMap((r) => [r.buy_provider, r.sell_provider]),
    ...(data?.topups ?? []).map((g) => g.venue),
];

export default function MissedOpportunitiesPage() {
    const { t, format } = useI18n();
    const list = useListControls(defaultFilters, DEFAULT_VIEW);
    const { draft, applied } = list;
    const { data, refetch } = useMissedReport(applied, list.view);
    const symbols = useAccumulated(data?.symbols ?? []);
    const providers = useAccumulated(venuesOf(data));

    // Selects apply on change: the page is mostly read by flipping pair and reason.
    const select = (id: string, key: keyof MissedFilters, label: string, options: Option[], title?: string) => (
        <SelectField id={id} label={label} title={title} value={draft[key]} options={options} onChange={(v) => list.apply({ [key]: v })} />
    );
    const date = (id: string, key: 'from' | 'to', label: string) => (
        <Field id={id} label={label}>
            <input type="date" id={id} value={draft[key]} onChange={(e) => list.setFilter(key, e.target.value)} onKeyDown={list.applyOnEnter} />
        </Field>
    );
    // Clicking a pair filters the whole page to it; clicking it again clears.
    const onPair = (symbol: string) => list.apply({ symbol: applied.symbol === symbol ? '' : symbol });

    const all: Option = { value: '', label: t('common.all') };
    const loading = <Skeleton>{t('missed.loading')}</Skeleton>;
    const coverage = data?.coverage || 90;

    return (
        <>
            <Panel title={t('missed.filters.title')} hint={t('missed.filters.hint')}>
                <div className="filters">
                    {date('fFrom', 'from', t('opps.filter.from'))}
                    {date('fTo', 'to', t('opps.filter.to'))}
                    {select('fSymbol', 'symbol', t('missed.filter.pair'), [all, ...valueOptions(symbols)])}
                    {select('fBuy', 'buy', t('opps.filter.buyVenue'), [all, ...valueOptions(providers)])}
                    {select('fSell', 'sell', t('opps.filter.sellVenue'), [all, ...valueOptions(providers)])}
                    {select('fReason', 'reason', t('missed.filter.reason'), [
                        all,
                        { value: 'balance', label: t('missed.reason.balance') },
                        { value: 'buy_balance', label: t('missed.reason.buyBalance') },
                        { value: 'sell_balance', label: t('missed.reason.sellBalance') },
                        { value: 'error', label: t('missed.reason.error') },
                    ])}
                    {select('fSimulated', 'simulated', t('opps.filter.mode'), [
                        all, { value: 'false', label: t('opps.filter.realTrading') }, { value: 'true', label: t('opps.filter.simulation') },
                    ])}
                    {select('fFraction', 'fraction', t('missed.filter.fraction'), percentOptions(['10', '25', '50', '70', '90', '100']), t('missed.filter.fractionHint'))}
                    {select('fProfitable', 'profitable', t('missed.filter.profit'), [all, { value: 'true', label: t('missed.filter.profitableOnly') }])}
                    {select('fCoverage', 'coverage', t('missed.filter.coverage'), percentOptions(['50', '75', '90', '100']), t('missed.filter.coverageHint'))}
                    {select('fPageSize', 'pageSize', t('common.pageSize'), valueOptions(['25', '50', '100']))}
                    <button className="btn primary" onClick={() => list.apply()}>{t('common.apply')}</button>
                    <button className="btn" onClick={list.reset}>{t('common.reset')}</button>
                    <button className="btn" onClick={() => void refetch()} title={t('common.refreshNow')}>{t('common.refresh')}</button>
                </div>
            </Panel>

            <Panel title={t('missed.summary.title')} hint={t('missed.summary.hint')}>
                {data ? <MissedSummary data={data} /> : loading}
                <Html as="div" className="summary-caption" k="missed.summary.caption" />
            </Panel>

            <Panel title={t('missed.topup.title')} hint={t('missed.topup.hint')}>
                {data ? <TopupTable groups={data.topups || []} coverage={coverage} /> : loading}
                <div className="summary-caption">
                    {data && t('missed.topup.caption', { coverage: format.number(coverage) })
                        + (data.live_balances ? '' : ' ' + t('missed.topup.noLive'))
                        + (data.live_credit ? '' : ' ' + t('missed.topup.noCredit'))}
                </div>
            </Panel>

            <Panel title={t('missed.pairs.title')} hint={t('missed.pairs.hint')}>
                {data ? <PairsTable pairs={data.pairs || []} selected={applied.symbol} onPair={onPair} /> : loading}
            </Panel>

            <Panel title={t('missed.list.title')} count={data ? format.number(data.total || 0) : 0} hint={t('missed.list.hint')}>
                {data ? <MissedRows rows={data.rows || []} sort={{ view: list.view, onSort: list.sortBy }} /> : loading}
                {data && <Pagination data={data} onPage={list.setPage} />}
            </Panel>

            <PageFooter>{t('missed.footer')}</PageFooter>
        </>
    );
}
