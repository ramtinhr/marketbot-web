import { useState } from 'react';

import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { API_BASE, fetchJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { fmtNum } from '../lib/ui';

export default function Orders() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();
    const [data, setData] = useState<any>(null);

    async function fetchData() {
        try {
            const { ok, data } = await fetchJSON('/orders?limit=50');
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            setData(data);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error fetching orders:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('error.unreachable', { base: API_BASE }));
        }
    }

    usePolling(fetchData, 5000, [locale]);

    const orders: any[] = (data && data.orders) || [];
    const count = data && typeof data.count === 'number' ? data.count : orders.length;

    return (
        <>
            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('orders.panel.title')}</span> <span className="count">{count}</span></h2>
                    <span className="panel-hint">{t('orders.panel.hint')}</span>
                </div>
                <div>
                    {!data ? (
                        <div className="skeleton">{t('orders.loading')}</div>
                    ) : orders.length === 0 ? (
                        <div className="empty-state"><span className="big">🧾</span>{t('orders.empty')}</div>
                    ) : (
                        <div className="table-scroll">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{t('common.time')}</th>
                                        <th>{t('common.buySell')}</th>
                                        <th>{t('common.symbol')}</th>
                                        <th>{t('common.buyPrice')}</th>
                                        <th>{t('common.sellPrice')}</th>
                                        <th>{t('common.amount')}</th>
                                        <th>{t('orders.col.expectedProfit')}</th>
                                        <th>{t('common.status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map((o, i) => {
                                        // The status is the bot's own recorded value and doubles as the
                                        // badge's class, so it is shown as recorded.
                                        const orderStatus = o.status || 'pending';
                                        const profitClass = (o.expected_profit || 0) >= 0 ? 'profit-positive' : 'profit-negative';
                                        return (
                                            <tr key={o.id ?? i}>
                                                <td>{format.dateTime(o.created_at)}</td>
                                                <td className="route-cell">
                                                    <span className="provider-tag">{o.buy_provider}</span><span className="arrow">→</span><span className="provider-tag">{o.sell_provider}</span>
                                                </td>
                                                <td>{o.symbol}</td>
                                                <td>{fmtNum(o.buy_price)}</td>
                                                <td>{fmtNum(o.sell_price)}</td>
                                                <td>{fmtNum(o.amount)}</td>
                                                <td className={profitClass}>{fmtNum(o.expected_profit)} <span className="fee-text">({format.percent(o.expected_profit_pct || 0, 2)})</span></td>
                                                <td>
                                                    <span className={`status-badge ${orderStatus}`}>{orderStatus}</span>
                                                    {o.simulated && <> <span className="fee-text">{t('common.sim')}</span></>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>

            <footer className="page-footer">{t('orders.footer')}</footer>
        </>
    );
}
