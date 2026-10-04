import { useI18n } from '../../i18n';
import { useAccumulated, useListControls } from '../../shared/hooks';
import { Html, PageFooter, Pagination, Panel, Skeleton } from '../../shared/ui';
import { DEFAULT_VIEW, defaultFilters, opportunitiesApi, useProjections } from './api';
import { ProjectionFilters } from './components/ProjectionFilters';
import { ProjectionSummary } from './components/ProjectionSummary';
import { ProjectionTable } from './components/ProjectionTable';

export default function OpportunitiesPage() {
    const { t } = useI18n();
    const list = useListControls(defaultFilters, DEFAULT_VIEW);
    const { data, refetch } = useProjections(list.applied, list.view);
    const rows = data?.projections;
    const providers = useAccumulated(rows?.flatMap((r) => [r.buy_provider, r.sell_provider]) ?? []);

    const exportCsv = () => { window.location.href = opportunitiesApi.exportUrl(list.applied, list.view); };

    return (
        <>
            <Panel title={t('opps.summary.title')} hint={t('opps.summary.hint')}>
                {data ? <ProjectionSummary s={data.summary || {}} /> : <Skeleton>{t('opps.summary.loading')}</Skeleton>}
                <details className="osum-help">
                    <summary>{t('opps.summary.howToRead')}</summary>
                    <Html as="div" className="summary-caption" k="opps.summary.caption" />
                </details>
            </Panel>

            <Panel title={t('opps.panel.title')} count={data?.total || 0} hint={t('opps.panel.hint')}>
                <div className="filters">
                    <ProjectionFilters draft={list.draft} providers={providers} setFilter={list.setFilter} onEnter={list.applyOnEnter} />
                    <button className="btn primary" onClick={() => list.apply()}>{t('common.apply')}</button>
                    <button className="btn" onClick={list.reset}>{t('common.reset')}</button>
                    <button className="btn" onClick={() => void refetch()} title={t('common.refreshNow')}>{t('common.refresh')}</button>
                    <button className="btn" onClick={exportCsv} title={t('opps.exportHint')}>{t('opps.export')}</button>
                </div>

                <ProjectionTable rows={rows} sort={{ view: list.view, onSort: list.sortBy }} />
                {data && <Pagination data={data} onPage={list.setPage} />}
            </Panel>

            <PageFooter>{t('opps.footer')}</PageFooter>
        </>
    );
}
