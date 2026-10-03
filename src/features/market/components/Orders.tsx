import { useI18n } from '../../../i18n';
import { cx } from '../../../shared/lib';
import { DataTable, type Column } from '../../../shared/ui';
import type { ExchangeOrder, ExchangeTrade } from '../api';
import type { Side } from '../book';
import { fmtToman, num, sideWord } from '../format';
import type { MarketSession, OrdersTab } from '../session';

const TABS: OrdersTab[] = ['open', 'history', 'trades'];
const ORDER_BADGE: Record<string, string> = { open: 'simulated', partial: 'pending', filled: 'completed', cancelled: 'stale' };

const EmptyRows = ({ text }: { text: string }) => <div className="empty-state">{text}</div>;

function MyTrades({ market }: { market: MarketSession }) {
    const { t, format } = useI18n();
    const s = market.s;
    if (!s.myTrades.length) return <EmptyRows text={t('market.orders.empty.trades')} />;
    const sideOf = (tr: ExchangeTrade): Side => (tr.buy_user_id === s.userId ? 'buy' : 'sell');
    const columns: Column<ExchangeTrade>[] = [
        { key: 'time', header: t('market.orders.col.time'), className: 'mk-dim', cell: (tr) => format.dateTime(tr.executed_at) },
        { key: 'side', header: t('market.orders.col.side'), cell: (tr) => <span className={`side-${sideOf(tr)}`}>{sideWord(sideOf(tr))}</span> },
        { key: 'price', header: t('market.orders.col.price'), cell: (tr) => market.fmtPrice(tr.price) },
        { key: 'amount', header: t('market.orders.col.amount'), cell: (tr) => market.fmtQty(tr.quantity) },
        { key: 'total', header: t('market.orders.col.total'), cell: (tr) => fmtToman(num(tr.price) * num(tr.quantity)) },
        { key: 'role', header: t('market.orders.col.role'), cell: (tr) => t(sideOf(tr) === tr.taker_side ? 'market.role.taker' : 'market.role.maker') },
        {
            key: 'counterparty', header: t('market.orders.col.counterparty'),
            cell: (tr) => <span className={cx('mk-src', !tr.venue && 'user')}>{market.counterparty(tr, sideOf(tr))}</span>,
        },
    ];
    return <DataTable className="mk-table" columns={columns} rows={s.myTrades} rowKey={(tr) => tr.id} loading={null} empty={{ text: '' }} />;
}

function OrderList({ market, open }: { market: MarketSession; open: boolean }) {
    const { t, format } = useI18n();
    const s = market.s;
    const list = open
        ? [...s.open.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        : s.history;
    if (!list.length) return <EmptyRows text={t(open ? 'market.orders.empty.open' : 'market.orders.empty.history')} />;

    const columns: Column<ExchangeOrder>[] = [
        { key: 'time', header: t('market.orders.col.time'), className: 'mk-dim', cell: (o) => format.dateTime(o.created_at) },
        { key: 'side', header: t('market.orders.col.side'), cell: (o) => <span className={`side-${o.side}`}>{sideWord(o.side)}</span> },
        { key: 'price', header: t('market.orders.col.price'), cell: (o) => market.fmtPrice(o.price) },
        { key: 'amount', header: t('market.orders.col.amount'), cell: (o) => market.fmtQty(num(o.quantity)) },
        {
            key: 'filled', header: t('market.orders.col.filled'),
            cell: (o) => {
                const qty = num(o.quantity);
                const pct = qty > 0 ? (num(o.filled_quantity) / qty) * 100 : 0;
                return <div className="mk-fill"><span>{market.fmtQty(num(o.filled_quantity))}</span><div className="mt-progress"><span style={{ width: `${pct.toFixed(1)}%` }} /></div></div>;
            },
        },
        {
            key: 'avg', header: t('market.orders.col.avg'),
            cell: (o) => (num(o.filled_quantity) > 0 ? market.fmtPrice(num(o.filled_quote) / num(o.filled_quantity)) : '—'),
        },
        { key: 'total', header: t('market.orders.col.total'), cell: (o) => fmtToman(num(o.price) * num(o.quantity)) },
        {
            key: 'status', header: t('market.orders.col.status'),
            cell: (o) => <span className={`status-badge ${ORDER_BADGE[o.status] || 'pending'}`}>{t(`market.status.${o.status}`)}</span>,
        },
        {
            key: 'cancel', header: '',
            cell: (o) => open && (
                <button className="btn mt-small mt-danger" type="button" disabled={s.cancelling.has(o.id)}
                        onClick={() => void market.cancelOrder(o.id)}>{t('market.orders.cancel')}</button>
            ),
        },
    ];
    return <DataTable className="mk-table" columns={columns} rows={list} rowKey={(o) => o.id} loading={null} empty={{ text: '' }} />;
}

/** The user's open orders, order history and trades on this pair. */
export function Orders({ market }: { market: MarketSession }) {
    const { t, format } = useI18n();
    const s = market.s;
    const tabLabel = (tab: OrdersTab) => (tab === 'open'
        ? <><span>{t('market.orders.open')}</span> <span className="mk-count">{format.number(s.open.size)}</span></>
        : t(tab === 'history' ? 'market.orders.history' : 'market.orders.myTrades'));

    let body;
    if (!s.userId) body = <EmptyRows text={t('market.orders.selectUser')} />;
    else if (s.tab === 'trades') body = <MyTrades market={market} />;
    else body = <OrderList market={market} open={s.tab === 'open'} />;

    return (
        <section className="panel mk-orders">
            <div className="mk-panel-head">
                <div className="mk-tabs" role="tablist">
                    {TABS.map((tab) => (
                        <button key={tab} type="button" role="tab" aria-selected={s.tab === tab}
                                className={s.tab === tab ? 'active' : ''} onClick={() => market.setTab(tab)}>
                            {tabLabel(tab)}
                        </button>
                    ))}
                </div>
                <button className="btn mt-small mt-danger" type="button" hidden={s.tab !== 'open' || s.open.size === 0}
                        disabled={s.cancelAllBusy} onClick={() => void market.cancelAll()}>
                    {t('market.orders.cancelAll')}
                </button>
            </div>
            <div>{body}</div>
        </section>
    );
}
