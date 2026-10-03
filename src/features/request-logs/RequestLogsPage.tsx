import { useI18n } from '../../i18n';
import { useListControls } from '../../shared/hooks';
import { Field, PageFooter, Pagination, Panel, SelectField, Stat, StatGrid, valueOptions } from '../../shared/ui';
import { OPERATIONS, useLogProviders, useRequestLogs, type LogFilters, type RequestLog } from './api';
import { LogTable } from './components/LogTable';

const EMPTY_FILTERS = (): LogFilters => ({ provider: '', operation: '', success: '', symbol: '', orderId: '', pageSize: '25' });
const PAGE_SIZES = ['10', '25', '50', '100'];

function LogStats({ total, logs }: { total: number | undefined; logs: RequestLog[] | undefined }) {
    const { t, format } = useI18n();
    const num = (n: number) => format.number(n);
    const succeeded = logs?.filter((l) => l.success).length ?? 0;
    const avgMs = logs?.length ? Math.round(logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / logs.length) : 0;
    return (
        <StatGrid>
            <Stat label={t('logs.stat.total')} tone="accent" value={logs ? num(total || 0) : '—'} />
            <Stat label={t('logs.stat.page')} value={logs ? num(logs.length) : '—'} />
            <Stat label={t('logs.stat.success')} tone="green" value={logs ? num(succeeded) : '—'} />
            <Stat label={t('logs.stat.failed')} tone="red" value={logs ? num(logs.length - succeeded) : '—'} />
            <Stat label={t('logs.stat.avgDuration')} tone="amber"
                  value={logs?.length ? t('common.milliseconds', { value: num(avgMs) }) : '—'} />
        </StatGrid>
    );
}

export default function RequestLogsPage() {
    const { t } = useI18n();
    const list = useListControls(EMPTY_FILTERS);
    const { draft, setFilter, applyOnEnter } = list;
    const { data, refetch } = useRequestLogs(list.applied, list.view.page);
    const { data: providers = [] } = useLogProviders();
    const all = { value: '', label: t('common.all') };

    return (
        <>
            <LogStats total={data?.total} logs={data?.logs} />

            <Panel title={t('logs.panel.title')} count={data?.total || 0} hint={t('logs.panel.hint')}>
                {/* Venue codes and API operation names are the bot's own
                    identifiers and appear verbatim in its logs, so only the
                    "All" option is a word. */}
                <div className="filters">
                    <SelectField id="fProvider" label={t('common.provider')} value={draft.provider} onChange={(v) => setFilter('provider', v)}
                                 options={[all, ...providers.map((p) => ({
                                     value: p.code,
                                     label: p.active ? p.code : t('logs.filter.inactiveProvider', { code: p.code }),
                                 }))]} />
                    <SelectField id="fOperation" label={t('logs.filter.operation')} value={draft.operation}
                                 onChange={(v) => setFilter('operation', v)} options={[all, ...valueOptions(OPERATIONS)]} />
                    <SelectField id="fSuccess" label={t('logs.filter.result')} value={draft.success} onChange={(v) => setFilter('success', v)}
                                 options={[all, { value: 'true', label: t('logs.filter.success') }, { value: 'false', label: t('logs.filter.failed') }]} />
                    <Field id="fSymbol" label={t('common.symbol')}>
                        <input type="text" id="fSymbol" placeholder={t('logs.filter.symbolPlaceholder')}
                               value={draft.symbol} onChange={(e) => setFilter('symbol', e.target.value)} onKeyDown={applyOnEnter} />
                    </Field>
                    <Field id="fOrderId" label={t('logs.filter.orderId')}>
                        <input type="text" id="fOrderId" placeholder={t('logs.filter.orderIdPlaceholder')}
                               value={draft.orderId} onChange={(e) => setFilter('orderId', e.target.value)} onKeyDown={applyOnEnter} />
                    </Field>
                    <SelectField id="fPageSize" label={t('common.pageSize')} value={draft.pageSize}
                                 onChange={(v) => setFilter('pageSize', v)} options={valueOptions(PAGE_SIZES)} />
                    <button className="btn primary" onClick={() => list.apply()}>{t('common.apply')}</button>
                    <button className="btn" onClick={list.reset}>{t('common.reset')}</button>
                    <button className="btn" title={t('common.refreshNow')} onClick={() => void refetch()}>{t('common.refresh')}</button>
                </div>

                <LogTable logs={data?.logs} />
                {data && data.logs.length > 0 && <Pagination data={data} onPage={list.setPage} rangeKey="common.showingRange" />}
            </Panel>

            <PageFooter>{t('logs.footer')}</PageFooter>
        </>
    );
}
