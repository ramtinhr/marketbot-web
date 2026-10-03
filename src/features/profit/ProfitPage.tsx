import { useI18n } from '../../i18n';
import { PageFooter, Panel } from '../../shared/ui';
import { useProfit } from './api';
import { MethodTable, PredictedTable, TradesTable, VerifiedTable } from './components/ProfitTables';
import { VerifiedStats } from './components/VerifiedStats';

export default function ProfitPage() {
    const { t } = useI18n();
    const { data } = useProfit();

    return (
        <>
            <VerifiedStats data={data?.verified} />
            <Panel title={t('profit.verified.title')} hint={t('profit.verified.hint')}>
                <VerifiedTable days={data?.verified.daily} />
            </Panel>
            <Panel title={t('profit.trades.title')} hint={t('profit.trades.hint')}>
                <TradesTable trades={data?.verified.trades} />
            </Panel>
            <Panel title={t('profit.method.title')} hint={t('profit.method.hint')}>
                <MethodTable />
            </Panel>
            <Panel title={t('profit.predicted.title')} hint={t('profit.predicted.hint')}>
                <PredictedTable data={data?.predicted} />
            </Panel>
            <PageFooter>{t('profit.footer')}</PageFooter>
        </>
    );
}
