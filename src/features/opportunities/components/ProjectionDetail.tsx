import { Fragment } from 'react';

import { useI18n } from '../../../i18n';
import { fmtQty, fmtSignedPct, fmtToman, signClass } from '../../../shared/lib';
import { Breakdown, DetailColumn, Skeleton, StatusBadge } from '../../../shared/ui';
import { useExecution, type BookLevel, type Projection } from '../api';
import { bestPriceOf, fmtCap, limitLabel, outcomeOf, placeabilityOf } from '../labels';

function BookSide({ levels, emptyKey }: { levels: BookLevel[] | undefined; emptyKey: string }) {
    const { t } = useI18n();
    if (!levels?.length) return <div className="audit-missing">{t(emptyKey)}</div>;
    return (
        <div className="book-side">
            {levels.slice(0, 10).map(([price, size], i) => (
                <Fragment key={i}>
                    <div>{fmtToman(price)}</div>
                    <div>{size > 0 ? fmtQty(size, 4) : t('opps.detail.sizeNotPublished')}</div>
                </Fragment>
            ))}
        </div>
    );
}

function ExecutionSlot({ id }: { id: string }) {
    const { t } = useI18n();
    const { data: e, error, isPending } = useExecution(id, true);
    if (error) return <div className="error-line">{t('opps.detail.executionFailed', { error: error.message })}</div>;
    if (isPending) return <Skeleton>{t('opps.detail.loadingExecution')}</Skeleton>;
    if (!e) return null;
    return (
        <Breakdown lines={[
            { label: t('opps.detail.tradedSize'), value: t('opps.detail.tradedSizeValue', { bought: fmtQty(e.amount, 8), sold: fmtQty(e.sell_amount, 8) }) },
            { label: t('opps.detail.prices'), value: `${fmtToman(e.buy_price)} → ${fmtToman(e.sell_price)}` },
            {
                label: t('opps.detail.expectedProfit'), className: signClass(e.expected_profit),
                value: t('opps.detail.netWithPct', { value: fmtToman(e.expected_profit), pct: fmtSignedPct(e.expected_profit_pct, 3) }),
            },
            { label: t('common.status'), value: t('opps.detail.statusValue', { status: e.status, buy: e.buy_status, sell: e.sell_status }) },
            { label: t('opps.detail.execution'), value: e.id },
        ]} />
    );
}

// The best prices on their own: no depth walked, so no slippage. This is the
// size that can be taken with neither leg leaving its best price, which is a
// different - and smaller - order than the deep-book projection beside it.
function BestPriceColumn({ r, fraction }: { r: Projection; fraction: string }) {
    const { t } = useI18n();
    const bp = bestPriceOf(r);
    if (!bp.known) return <div className="audit-missing">{t('opps.detail.bestPriceUnknown', { buy: r.buy_provider, sell: r.sell_provider })}</div>;
    const place = placeabilityOf(bp.placeable);
    return (
        <Breakdown lines={[
            { label: t('opps.detail.resting'), value: `${fmtQty(r.top_ask_size, 4)} / ${fmtQty(r.top_bid_size, 4)} USDT` },
            { label: t('opps.detail.matched'), value: `${fmtQty(bp.matched_qty, 6)} USDT` },
            { label: t('opps.detail.orderAt', { fraction }), value: `${fmtQty(bp.amount, 8)} USDT`, total: true },
            { label: t('opps.detail.filledAt'), value: <>{fmtToman(r.top_ask)} → {fmtToman(r.top_bid)} <span className="fee-text">{t('opps.detail.noSlippage')}</span></> },
            { label: t('opps.detail.gross'), value: fmtToman(bp.gross), className: signClass(bp.gross) },
            { label: t('opps.detail.buyFee', { provider: r.buy_provider }), value: `−${fmtToman(bp.buy_fee)}`, className: 'neg' },
            { label: t('opps.detail.sellFee', { provider: r.sell_provider }), value: `−${fmtToman(bp.sell_fee)}`, className: 'neg' },
            {
                label: t('opps.detail.netAtBest'), className: signClass(bp.net), total: true,
                value: t('opps.detail.netWithPct', { value: fmtToman(bp.net), pct: fmtSignedPct(bp.net_pct, 4) }),
            },
            { label: t('opps.detail.capital'), value: t('opps.detail.tomanValue', { value: fmtToman(bp.deployed) }) },
            { label: t('opps.detail.clearsMinimums'), value: <StatusBadge tone={place.badge} title={place.long}>{place.label}</StatusBadge> },
            { label: t('opps.detail.vsDeepBook'), value: t('opps.detail.vsDeepBookValue', { qty: fmtQty(r.projected_amount, 4), net: fmtToman(r.net_profit) }) },
        ]} />
    );
}

/** Everything known about one projection: sizing, pricing, money, outcome and both books. */
export function ProjectionDetail({ r }: { r: Projection }) {
    const { t, format } = useI18n();
    const fees = (r.buy_fee || 0) + (r.sell_fee || 0);
    const outcome = outcomeOf(r.outcome);
    const fraction = format.number(Math.round((r.projected_fraction || 0.70) * 100));
    const projectedPct = format.number(Math.round((r.projected_fraction || 0) * 100));
    const sizeOrNone = (n: number) => (n > 0 ? fmtQty(n, 4) : t('opps.detail.notPublished'));

    return (
        <div className="detail-grid">
            <DetailColumn label={t('opps.detail.bestPriceLabel', { fraction })}>
                <BestPriceColumn r={r} fraction={fraction} />
            </DetailColumn>
            <DetailColumn label={t('opps.detail.sizingLabel')}>
                <Breakdown lines={[
                    {
                        label: t('opps.detail.depthClearing'), className: r.depth_known ? '' : 'muted',
                        value: `${fmtQty(r.depth_max_amount, 4)} USDT${r.depth_known ? '' : t('opps.detail.depthUnknown')}`,
                    },
                    { label: t('opps.detail.buyAffords'), value: fmtCap(r.buy_balance_max_amount) },
                    { label: t('opps.detail.sellAffords'), value: fmtCap(r.sell_balance_max_amount) },
                    { label: t('opps.detail.configuredSize'), value: `${fmtQty(r.config_max_amount, 4)} USDT` },
                    { label: t('opps.detail.maximum', { limit: limitLabel(r.limited_by) }), value: `${fmtQty(r.max_amount, 6)} USDT`, total: true },
                    { label: t('opps.detail.projectedOrder', { fraction: projectedPct }), value: `${fmtQty(r.projected_amount, 8)} USDT` },
                    { label: t('opps.detail.sellLeg'), value: `${fmtQty(r.projected_sell_amount, 8)} USDT` },
                    { label: t('opps.detail.retained'), value: `${fmtQty(r.retained_usdt, 8)} USDT`, className: 'pos' },
                ]} />
            </DetailColumn>
            <DetailColumn label={t('opps.detail.pricingLabel')}>
                <Breakdown lines={[
                    { label: t('opps.detail.topOfBook'), value: `${fmtToman(r.top_ask)} / ${fmtToman(r.top_bid)}` },
                    { label: t('opps.detail.restingThere'), value: `${sizeOrNone(r.top_ask_size)} / ${sizeOrNone(r.top_bid_size)} USDT` },
                    { label: t('opps.detail.scoredAt'), value: `${fmtToman(r.scored_buy_price)} → ${fmtToman(r.scored_sell_price)} (${fmtSignedPct(r.scored_profit_pct)})` },
                    { label: t('opps.detail.fillingCosts'), value: `${fmtToman(r.projected_buy_price)} → ${fmtToman(r.projected_sell_price)}`, total: true },
                    { label: t('opps.detail.rawSpread'), value: t('opps.detail.rawSpreadValue', { value: fmtToman(r.raw_spread), pct: fmtSignedPct(r.raw_spread_pct) }) },
                    {
                        label: t('common.fees'),
                        value: t('opps.detail.feesValue', {
                            buy: format.decimal(r.buy_fee_pct || 0, 2),
                            sell: format.decimal(r.sell_fee_pct || 0, 2),
                            total: format.decimal(r.total_fee_pct || 0, 4),
                        }),
                    },
                ]} />
            </DetailColumn>
            <DetailColumn label={t('opps.detail.moneyLabel')}>
                <Breakdown lines={[
                    {
                        label: t('opps.detail.grossFormula', { qty: fmtQty(r.projected_amount, 4), delta: fmtToman((r.projected_sell_price || 0) - (r.projected_buy_price || 0)) }),
                        value: fmtToman(r.gross_profit), className: signClass(r.gross_profit),
                    },
                    { label: t('opps.detail.buyFee', { provider: r.buy_provider }), value: `−${fmtToman(r.buy_fee)}`, className: 'neg' },
                    { label: t('opps.detail.sellFee', { provider: r.sell_provider }), value: `−${fmtToman(r.sell_fee)}`, className: 'neg' },
                    {
                        label: t('opps.detail.netProfit'), className: signClass(r.net_profit), total: true,
                        value: t('opps.detail.netWithPct', { value: fmtToman(r.net_profit), pct: fmtSignedPct(r.net_profit_pct) }),
                    },
                    { label: t('opps.detail.capital'), value: t('opps.detail.tomanValue', { value: fmtToman(r.deployed) }) },
                    {
                        label: t('opps.detail.slippage'), className: (r.slippage_cost || 0) > 0 ? 'neg' : 'muted',
                        value: t('opps.detail.tomanValue', { value: fmtToman(r.slippage_cost) }),
                    },
                    { label: t('opps.detail.totalCost'), value: t('opps.detail.tomanValue', { value: fmtToman(fees + (r.slippage_cost || 0)) }) },
                ]} />
            </DetailColumn>
            <DetailColumn label={t('opps.detail.outcomeLabel')}>
                <Breakdown lines={[
                    { label: t('common.outcome'), value: outcome.long },
                    r.outcome_detail ? { label: t('opps.detail.reason'), value: r.outcome_detail } : null,
                    { label: t('opps.detail.actuallyTraded'), value: r.traded_amount > 0 ? fmtQty(r.traded_amount, 8) + ' USDT' : t('opps.detail.nothing') },
                    { label: t('opps.detail.mode'), value: t(r.simulated ? 'opps.detail.simulation' : 'opps.detail.realTrading') },
                    { label: t('opps.detail.projectionId'), value: r.id },
                ]} />
                {r.execution_id && (
                    <>
                        <div className="detail-col-label" style={{ marginTop: 14 }}>{t('opps.detail.executionProduced')}</div>
                        <div><ExecutionSlot id={r.id} /></div>
                    </>
                )}
            </DetailColumn>
            <DetailColumn label={t('opps.detail.asksLabel', { provider: r.buy_provider })}>
                <BookSide levels={r.book?.asks} emptyKey="opps.detail.noAsks" />
            </DetailColumn>
            <DetailColumn label={t('opps.detail.bidsLabel', { provider: r.sell_provider })}>
                <BookSide levels={r.book?.bids} emptyKey="opps.detail.noBids" />
            </DetailColumn>
            {r.notes && <div className="detail-meta"><div className="note-line">⚠️ {r.notes}</div></div>}
        </div>
    );
}
