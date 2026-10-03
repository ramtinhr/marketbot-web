import { useI18n } from '../../i18n';
import { fmtNum, fmtNumOrDash } from '../../shared/lib';
import { DataTable, PageFooter, Panel, ProviderName, Stat, StatGrid, StatusBadge, type Column } from '../../shared/ui';
import { useReconciliation, type ReconciledAccount, type ReconciliationStatus } from './api';

export default function ReconciliationPage() {
    const { t, format } = useI18n();
    const { data } = useReconciliation();
    const accounts = data?.accounts;
    const countWhere = (pred: (a: ReconciledAccount) => boolean) => (accounts ? format.number(accounts.filter(pred).length) : '—');

    const columns: Column<ReconciledAccount>[] = [
        { key: 'provider', header: t('common.provider'), cell: (a) => <ProviderName code={a.provider} /> },
        { key: 'asset', header: t('recon.col.asset'), cell: (a) => a.asset },
        { key: 'internal', header: t('recon.col.internal'), cell: (a) => fmtNum(a.internal_balance) },
        { key: 'live', header: t('recon.col.live'), cell: (a) => fmtNumOrDash(a.live_balance) },
        { key: 'diff', header: t('recon.col.diff'), cell: (a) => fmtNumOrDash(a.diff) },
        { key: 'status', header: t('common.status'), cell: (a) => <ReconciliationBadge status={a.status} /> },
        { key: 'updated', header: t('recon.col.liveUpdated'), cell: (a) => (a.live_updated_at ? format.time(a.live_updated_at) : '—') },
    ];

    return (
        <>
            <StatGrid>
                <Stat label={t('recon.stat.accounts')} value={countWhere(() => true)} />
                <Stat label={t('recon.stat.mismatches')} value={countWhere((a) => a.status === 'mismatch')} tone="accent" />
                <Stat label={t('recon.stat.noData')} value={countWhere((a) => a.status === 'no_live_data')} />
            </StatGrid>

            <Panel title={t('recon.panel.title')} count={accounts?.length ?? 0} hint={t('recon.panel.hint')}>
                <DataTable columns={columns} rows={accounts} rowKey={(a, i) => `${a.provider}:${a.asset}:${i}`}
                           loading={t('recon.loading')} empty={{ icon: '⚖️', text: t('recon.empty') }} />
            </Panel>

            <PageFooter>{t('recon.footer')}</PageFooter>
        </>
    );
}

function ReconciliationBadge({ status }: { status: ReconciliationStatus }) {
    const { t } = useI18n();
    switch (status) {
        case 'mismatch': return <StatusBadge tone="offline">{t('recon.status.mismatch')}</StatusBadge>;
        case 'no_live_data': return <StatusBadge>{t('recon.status.noLiveData')}</StatusBadge>;
        case 'stale_live': return <StatusBadge tone="stale" title={t('recon.status.awaitingRefreshHint')}>{t('recon.status.awaitingRefresh')}</StatusBadge>;
        default: return <StatusBadge tone="online">{t('recon.status.ok')}</StatusBadge>;
    }
}
