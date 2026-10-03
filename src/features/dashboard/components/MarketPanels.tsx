import { useI18n } from '../../../i18n';
import { fmtNum } from '../../../shared/lib';
import { DataTable, ProviderRoute, Skeleton, type Column } from '../../../shared/ui';
import type { ArbOpportunity, BestPrice } from '../api';

function PriceCard({ symbol, d }: { symbol: string; d: BestPrice | null }) {
    const { t, format } = useI18n();
    if (!d?.best_bid || !d.best_ask) {
        return (
            <div className="price-card">
                <div className="symbol">{symbol}</div>
                <div className="empty-state" style={{ padding: '10px 0' }}>{t('dashboard.prices.noData')}</div>
            </div>
        );
    }
    return (
        <div className="price-card">
            <div className="symbol">{symbol}</div>
            <div className="bid-ask-row">
                <div className="bid-ask-col">
                    <div className="bid-ask-label">{t('dashboard.prices.bestBid')}</div>
                    <div className="bid-ask-price bid">{fmtNum(d.best_bid.price)}</div>
                    <div className="bid-ask-provider">{d.best_bid.provider}</div>
                </div>
                <div className="bid-ask-col" style={{ textAlign: 'end' }}>
                    <div className="bid-ask-label">{t('dashboard.prices.bestAsk')}</div>
                    <div className="bid-ask-price ask">{fmtNum(d.best_ask.price)}</div>
                    <div className="bid-ask-provider">{d.best_ask.provider}</div>
                </div>
            </div>
            <div className="spread-line">
                <span>{t('common.spread')}</span>
                <b>{fmtNum(d.spread)} ({format.percent(d.spread_pct || 0, 2)})</b>
            </div>
        </div>
    );
}

export function BestPrices({ symbols, prices }: { symbols: string[]; prices: Array<BestPrice | null> | undefined }) {
    const { t } = useI18n();
    return (
        <div className="price-cards">
            {!prices ? <Skeleton>{t('dashboard.prices.loading')}</Skeleton>
                : symbols.map((symbol, i) => <PriceCard key={symbol} symbol={symbol} d={prices[i]} />)}
        </div>
    );
}

export function ArbitrageTable({ opportunities }: { opportunities: ArbOpportunity[] | undefined }) {
    const { t, format } = useI18n();
    const profit = (o: ArbOpportunity) => (o.profit_after_fees > 0 ? 'profit-positive' : 'profit-negative');
    const columns: Column<ArbOpportunity>[] = [
        { key: 'route', header: t('common.buySell'), className: 'route-cell', cell: (o) => <ProviderRoute from={o.buy_provider} to={o.sell_provider} /> },
        { key: 'symbol', header: t('common.symbol'), cell: (o) => o.symbol },
        { key: 'buy', header: t('common.buyPrice'), cell: (o) => fmtNum(o.buy_price) },
        { key: 'sell', header: t('common.sellPrice'), cell: (o) => fmtNum(o.sell_price) },
        { key: 'spread', header: t('common.spread'), cell: (o) => <>{fmtNum(o.raw_spread)} <span className="fee-text">({format.percent(o.raw_spread_pct, 4)})</span></> },
        { key: 'fees', header: t('common.fees'), className: 'fee-text', cell: (o) => format.percent(o.total_fee_pct, 4) },
        { key: 'profit', header: t('common.profit'), className: profit, cell: (o) => fmtNum(o.profit_after_fees) },
        { key: 'profitPct', header: t('common.profitPct'), className: profit, cell: (o) => format.percent(o.profit_pct, 3) },
        { key: 'max', header: t('dashboard.arbitrage.maxAmount'), cell: (o) => format.decimal(o.max_amount, 2) },
    ];
    const rows = opportunities && [...opportunities].sort((a, b) => b.profit_pct - a.profit_pct);
    return (
        <DataTable columns={columns} rows={rows} rowKey={(_, i) => i}
                   rowClassName={(o) => (o.profit_after_fees > 0 ? 'profitable' : undefined)}
                   loading={t('dashboard.arbitrage.loading')} empty={{ icon: '📭', text: t('dashboard.arbitrage.empty') }} />
    );
}
