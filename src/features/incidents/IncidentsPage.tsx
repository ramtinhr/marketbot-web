import { useI18n } from '../../i18n';
import { DataTable, PageFooter, Panel, StatusBadge, type Column } from '../../shared/ui';
import { useHealthEvents, type HealthEvent } from './api';

export default function IncidentsPage() {
    const { t, format } = useI18n();
    const { data } = useHealthEvents();
    const events = data?.events;

    const columns: Column<HealthEvent>[] = [
        { key: 'time', header: t('common.time'), cell: (e) => format.dateTime(e.created_at) },
        { key: 'provider', header: t('common.provider'), className: 'provider-tag', cell: (e) => e.provider_code },
        {
            key: 'transition',
            header: t('incidents.col.transition'),
            className: 'route-cell',
            cell: (e) => <>{e.from_state}<span className="arrow">→</span><StatusBadge tone={(e.to_state || '').toLowerCase()}>{e.to_state}</StatusBadge></>,
        },
        { key: 'reason', header: t('incidents.col.reason'), cell: (e) => e.reason || '' },
    ];

    return (
        <>
            <Panel title={t('incidents.panel.title')} count={data?.count ?? events?.length ?? 0} hint={t('incidents.panel.hint')}>
                <DataTable columns={columns} rows={events} rowKey={(e, i) => e.id ?? i}
                           loading={t('incidents.loading')} empty={{ icon: '✅', text: t('incidents.empty') }} />
            </Panel>
            <PageFooter>{t('incidents.footer')}</PageFooter>
        </>
    );
}
