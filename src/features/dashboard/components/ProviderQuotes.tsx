import type { ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { cx, fmtNum, fmtRounded } from '../../../shared/lib';
import { EmptyState, ProviderName, Skeleton, StatusBadge, Template } from '../../../shared/ui';
import type { BestRoute as Route, ProviderQuote, QuoteStatus } from '../api';
import { usePriceFormat } from '../usePriceFormat';

const STATUS_BADGE: Record<QuoteStatus, string> = {
    live: 'online',
    stale: 'stale',
    no_quote: 'offline',
    circuit_open: 'offline',
};

// Signed figures are isolated left-to-right, or a Persian page renders -150
// as 150- and the loss reads as a gain.
const signed = (n: number, text: string): ReactNode => <bdi dir="ltr">{n > 0 ? '+' : ''}{text}</bdi>;

/** The best buy-here, sell-there pair across venues right now. */
export function BestRoute({ route }: { route: Route | null | undefined }) {
    const { t, format } = useI18n();
    const fmtPrice = usePriceFormat();
    if (!route) return null;
    const clears = route.clears_min_profit === true;
    const positive = route.net_per_unit > 0;

    return (
        <div className={cx('best-route', clears ? 'clears' : positive ? 'thin' : 'loss')}>
            <span className="br-label">{t('dashboard.providers.route.title')}</span>
            <span className="br-leg">
                {t('dashboard.providers.route.buy')}
                {' '}<span className="provider-tag">{route.buy_provider}</span>
                {' '}<b className="mono">{fmtPrice(route.buy_net)}</b>
            </span>
            <span className="arrow">→</span>
            <span className="br-leg">
                {t('dashboard.providers.route.sell')}
                {' '}<span className="provider-tag">{route.sell_provider}</span>
                {' '}<b className="mono">{fmtPrice(route.sell_net)}</b>
            </span>
            <span className="br-net mono">
                {signed(route.net_per_unit, fmtPrice(route.net_per_unit, route.buy_price))}
                {' '}({signed(route.profit_pct, format.percent(route.profit_pct, 3))})
            </span>
            {typeof route.trade_profit_toman === 'number' && (
                <span className="br-trade">
                    <Template template={t('dashboard.providers.route.perTrade', { notional: fmtRounded(route.trade_notional_toman) })}
                              nodes={{ profit: signed(route.trade_profit_toman, fmtRounded(route.trade_profit_toman)) }} />
                    {typeof route.min_profit_toman === 'number'
                        ? ` · ${t(clears ? 'dashboard.providers.route.clears' : 'dashboard.providers.route.short', { min: fmtNum(route.min_profit_toman) })}`
                        : ''}
                </span>
            )}
        </div>
    );
}

function QuoteSide({ side, p }: { side: 'bid' | 'ask'; p: ProviderQuote }) {
    const { t } = useI18n();
    const fmtPrice = usePriceFormat();
    const isBid = side === 'bid';
    const price = isBid ? p.bid : p.ask;
    const net = isBid ? p.bid_net : p.ask_net;
    const size = isBid ? p.bid_size : p.ask_size;
    const best = isBid ? p.best_to_sell : p.best_to_buy;
    return (
        <div className={cx('q-side', side, best && 'best')}>
            <div className="q-label">
                {t(isBid ? 'dashboard.providers.bid' : 'dashboard.providers.ask')}
                {best && <span className="q-best">{t(isBid ? 'dashboard.providers.bestSell' : 'dashboard.providers.bestBuy')}</span>}
            </div>
            <div className="q-price">{fmtPrice(price)}</div>
            <div className="q-net" title={t(isBid ? 'dashboard.providers.netBidHint' : 'dashboard.providers.netAskHint')}>
                {t('dashboard.providers.net')} <b>{fmtPrice(net)}</b>
            </div>
            <div className="q-size">{t('dashboard.providers.size')} {size > 0 ? fmtPrice(size) : t('common.na')}</div>
        </div>
    );
}

/** A tripped circuit; the closed (normal) case earns no chip. */
function CircuitChip({ state, labelKey }: { state: string | undefined; labelKey: string }) {
    const { t } = useI18n();
    if (!state || state === 'closed') return null;
    return <span className={`chip circuit-${state.replace('_', '-')}`}>{t(labelKey, { state })}</span>;
}

function QuoteCard({ p }: { p: ProviderQuote }) {
    const { t, format } = useI18n();
    const fmtPrice = usePriceFormat();
    const age = typeof p.age_s === 'number'
        ? t('dashboard.providers.age', { age: format.seconds(p.age_s, p.age_s < 10 ? 1 : 0) })
        : t('common.na');

    return (
        <div className={`card quote-card status-${p.status}`}>
            <div className="card-header">
                <ProviderName code={p.code} />
                <StatusBadge tone={STATUS_BADGE[p.status] || 'offline'}>{t(`dashboard.providers.status.${p.status}`)}</StatusBadge>
            </div>
            <div className="card-meta">
                <span className="chip">{t('dashboard.providers.fee', { fee: format.percent(p.fee_pct, 2) })}</span>
                {p.has_quote && <span className={cx('chip', p.stale && 'stale-text')}>{age}</span>}
                <CircuitChip state={p.circuit_state} labelKey="dashboard.providers.circuit" />
                <CircuitChip state={p.order_circuit_state} labelKey="dashboard.providers.orderCircuit" />
            </div>
            {p.has_quote ? (
                <>
                    <div className="q-sides">
                        <QuoteSide side="bid" p={p} />
                        <QuoteSide side="ask" p={p} />
                    </div>
                    <div className="q-spread">
                        <span>{t('common.spread')}</span>
                        <b className="mono">{fmtPrice(p.spread, p.ask)} <span className="fee-text">({format.percent(p.spread_pct, 3)})</span></b>
                    </div>
                </>
            ) : (
                <div className="empty-state q-empty">{t('dashboard.providers.noQuote')}</div>
            )}
        </div>
    );
}

export function QuoteGrid({ providers }: { providers: ProviderQuote[] | undefined }) {
    const { t } = useI18n();
    return (
        <div className="grid quote-grid">
            {!providers ? <Skeleton>{t('dashboard.providers.loading')}</Skeleton>
                : providers.length === 0 ? <EmptyState icon="🔌" text={t('dashboard.providers.empty')} style={{ gridColumn: '1/-1' }} />
                    : providers.map((p) => <QuoteCard key={p.code} p={p} />)}
        </div>
    );
}
