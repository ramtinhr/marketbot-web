import { useI18n } from '../../i18n';
import { fmtNum } from '../../shared/lib';
import { DataTable, PageFooter, Panel, ProviderRoute, StatusBadge, type Column } from '../../shared/ui';
import { useRecentOrders, type Order } from './api';

export default function OrdersPage() {
    const { t, format } = useI18n();
    const { data } = useRecentOrders();
    const orders = data?.orders;

    const columns: Column<Order>[] = [
        { key: 'time', header: t('common.time'), cell: (o) => format.dateTime(o.created_at) },
        { key: 'route', header: t('common.buySell'), className: 'route-cell', cell: (o) => <ProviderRoute from={o.buy_provider} to={o.sell_provider} /> },
        { key: 'symbol', header: t('common.symbol'), cell: (o) => o.symbol },
        { key: 'buy', header: t('common.buyPrice'), cell: (o) => fmtNum(o.buy_price) },
        { key: 'sell', header: t('common.sellPrice'), cell: (o) => fmtNum(o.sell_price) },
        { key: 'amount', header: t('common.amount'), cell: (o) => fmtNum(o.amount) },
        {
            key: 'profit',
            header: t('orders.col.expectedProfit'),
            className: (o) => ((o.expected_profit || 0) >= 0 ? 'profit-positive' : 'profit-negative'),
            cell: (o) => <>{fmtNum(o.expected_profit)} <span className="fee-text">({format.percent(o.expected_profit_pct || 0, 2)})</span></>,
        },
        {
            key: 'status',
            header: t('common.status'),
            cell: (o) => {
                const status = o.status || 'pending';
                return <><StatusBadge tone={status}>{status}</StatusBadge>{o.simulated && <> <span className="fee-text">{t('common.sim')}</span></>}</>;
            },
        },
    ];

    return (
        <>
            <Panel title={t('orders.panel.title')} count={data?.count ?? orders?.length ?? 0} hint={t('orders.panel.hint')}>
                <DataTable columns={columns} rows={orders} rowKey={(o, i) => o.id ?? i}
                           loading={t('orders.loading')} empty={{ icon: '🧾', text: t('orders.empty') }} />
            </Panel>
            <PageFooter>{t('orders.footer')}</PageFooter>
        </>
    );
}
