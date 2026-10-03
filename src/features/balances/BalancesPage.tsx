import { useI18n } from '../../i18n';
import { fmtNum } from '../../shared/lib';
import { EmptyState, PageFooter, Panel, Skeleton, Stat, StatGrid } from '../../shared/ui';
import { useBalances } from './api';
import { BalanceCard } from './BalanceCard';

export default function BalancesPage() {
    const { t, format } = useI18n();
    const { data } = useBalances();
    const providers = data?.providers ?? [];
    const total = typeof data?.total_irt === 'number' ? fmtNum(Math.round(data.total_irt)) : '—';

    return (
        <>
            <StatGrid>
                <Stat label={t('balances.stat.total')} value={total} />
                <Stat label={t('balances.stat.reporting')} value={data ? format.number(providers.length) : '—'} tone="accent" />
            </StatGrid>

            <Panel title={t('balances.panel.title')} count={providers.length} hint={t('balances.panel.hint')}>
                <div className="grid">
                    {!data ? (
                        <Skeleton>{t('balances.loading')}</Skeleton>
                    ) : providers.length === 0 ? (
                        <EmptyState icon="💰" text={t('balances.empty')} style={{ gridColumn: '1/-1' }} />
                    ) : providers.map((pb, i) => <BalanceCard key={pb.provider ?? i} venue={pb} />)}
                </div>
            </Panel>

            <PageFooter>{t('balances.footer')}</PageFooter>
        </>
    );
}
