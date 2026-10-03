import { useI18n } from '../../../i18n';
import { fmtQty, fmtSignedPct, fmtToman } from '../../../shared/lib';
import { Stat, StatGrid } from '../../../shared/ui';
import type { ProjectionSummary as Summary } from '../api';

const USDT = <span className="fee-text">USDT</span>;
const count = (n: number | undefined) => fmtQty(n, 0);
const sign = (n: number | undefined) => ((n || 0) >= 0 ? 'green' : 'red');

// Two strips, deliberately in this order. The first is sized from the order
// book alone - 70% of min(top ask size, top bid size) - which is what the
// venues were actually offering. The second is sized from what this bot could
// have taken, which the TradeAmountUSDT cap and the wallet balances hold far
// below that, so reading it as "the opportunity" understates the book by
// whatever the caps removed.
export function ProjectionSummary({ s }: { s: Summary }) {
    const { t, format } = useI18n();
    const span = s.first_detected_at && s.last_detected_at
        ? `${format.date(s.first_detected_at)} → ${format.date(s.last_detected_at)}`
        : t('opps.summary.noDetections');
    const rows = s.best_price_rows || 0;
    const unsized = (s.count || 0) - rows;
    // The fraction actually applied, recovered from the totals rather than
    // hardcoded, so it stays right if OPPORTUNITY_PROJECTION_FRACTION changes
    // (it is stored per row, not on the summary).
    const fraction = format.number((s.best_price_matched_qty || 0) > 0
        ? Math.round((s.best_price_qty || 0) / s.best_price_matched_qty! * 100)
        : 70);
    const unverifiable = rows - (s.best_price_placeable_count || 0);
    const notVerifiable = unverifiable > 0 ? ' · ' + t('opps.summary.notVerifiable', { count: count(unverifiable) }) : '';

    return (
        <>
            <div className="stat-group-label">{t('opps.summary.bookGroup', { fraction })}</div>
            <StatGrid>
                <Stat label={t('opps.summary.opportunities')} value={count(s.count)}
                      sub={<>{span}{unsized > 0 ? ` · ${t('opps.summary.unsized', { count: count(unsized) })}` : ''}</>} />
                <Stat label={t('opps.summary.netAtBest')} tone={sign(s.best_price_net)} value={fmtToman(s.best_price_net)} sub={t('opps.summary.netAtBestSub')} />
                <Stat label={t('opps.summary.avgPer')} value={fmtToman(s.best_price_avg_net)}
                      sub={t('opps.summary.avgPerSub', { value: fmtToman(s.best_price_max_net) })} />
                <Stat label={t('opps.summary.avgMargin')} tone="accent" value={fmtSignedPct(s.best_price_avg_net_pct, 4)}
                      sub={t('opps.summary.avgMarginSub', { value: fmtSignedPct(s.best_price_max_net_pct, 4) })} />
                <Stat label={t('opps.summary.avgSize')} value={<>{fmtQty(s.best_price_avg_qty)} {USDT}</>}
                      sub={t('opps.summary.avgSizeSub', { fraction, value: fmtQty(s.best_price_avg_matched_qty) })} />
                <Stat label={t('opps.summary.volume')} value={<>{fmtQty(s.best_price_qty)} {USDT}</>}
                      sub={t('opps.summary.volumeSub', { value: fmtQty(s.best_price_matched_qty) })} />
                <Stat label={t('opps.summary.fees')} tone="amber" value={fmtToman(s.best_price_fees)} sub={t('opps.summary.feesSub')} />
                <Stat label={t('opps.summary.capital')} value={fmtToman(s.best_price_deployed)} sub={t('opps.summary.capitalSub')} />
                <Stat label={t('opps.summary.placeable')} value={count(s.best_price_placeable_count)}
                      sub={<>{t('opps.summary.placeableSub')}{notVerifiable}</>} />
            </StatGrid>
            <div className="stat-group-label">{t('opps.summary.cappedGroup')}</div>
            <StatGrid>
                <Stat label={t('opps.summary.totalNet')} tone={sign(s.total_net_profit)} value={fmtToman(s.total_net_profit)} sub={t('opps.summary.totalNetSub')} />
                <Stat label={t('opps.summary.avgProjected')} value={<>{fmtQty(s.avg_projected_qty)} {USDT}</>}
                      sub={t('opps.summary.avgProjectedSub', { fraction, value: fmtQty(s.avg_max_amount) })} />
                <Stat label={t('opps.summary.costs')} tone="amber" value={fmtToman((s.total_fees || 0) + (s.total_slippage || 0))}
                      sub={t('opps.summary.costsSub', { fees: fmtToman(s.total_fees), slippage: fmtToman(s.total_slippage) })} />
                <Stat label={t('opps.summary.placeable')} value={count(s.placeable_count)} sub={t('opps.summary.placeableProjectedSub')} />
                <Stat label={t('opps.summary.traded')} value={<>{fmtQty(s.total_traded_qty)} {USDT}</>}
                      sub={t('opps.summary.tradedSub', { executed: count(s.executed_count), count: count(s.count), projected: fmtQty(s.total_projected_qty) })} />
            </StatGrid>
        </>
    );
}
