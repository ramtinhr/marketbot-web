import type { ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { cx, fmtCompact, fmtQty, fmtSignedPct, fmtToman } from '../../../shared/lib';
import { InfoIcon } from '../../../shared/ui';
import type { ProjectionSummary as Summary } from '../api';

const count = (n: number | undefined) => fmtQty(n, 0);
const sign = (n: number | undefined) => ((n || 0) >= 0 ? 'green' : 'red');

function Hint({ text }: { text: string }) {
    return <span className="osum-hint" title={text} aria-label={text} role="img"><InfoIcon /></span>;
}

interface KpiProps {
    label: string;
    hint?: string;
    value: string;
    /** The exact figure, on hover, when `value` is shortened. */
    exact?: string;
    unit?: string;
    tone?: string;
    children?: ReactNode;
}

function Kpi({ label, hint, value, exact, unit, tone, children }: KpiProps) {
    return (
        <div className="osum-kpi">
            <div className="osum-kpi-label">{label}{hint && <Hint text={hint} />}</div>
            <div className={cx('osum-kpi-value', tone)} title={exact}>
                {value}{unit && <span className="osum-unit">{unit}</span>}
            </div>
            {children && <div className="osum-kpi-sub">{children}</div>}
        </div>
    );
}

/** A count as a share of the total, with the bar that makes the share readable at a glance. */
function Ratio({ part, total, extra }: { part: number; total: number; extra?: string }) {
    const { t, format } = useI18n();
    const pct = total > 0 ? Math.min(100, (part / total) * 100) : 0;
    return (
        <>
            <div className="osum-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct}%` }} />
            </div>
            {t('opps.summary.ofTotal', { pct: format.percent(pct, 0), total: count(total) })}{extra ? ` · ${extra}` : ''}
        </>
    );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="osum-row">
            <dt>{label}{hint && <Hint text={hint} />}</dt>
            <dd>{children}</dd>
        </div>
    );
}

function Section({ title, note, hint, kpis, rows }: { title: string; note: string; hint: string; kpis: ReactNode; rows: ReactNode }) {
    return (
        <section className="osum-section">
            <header className="osum-section-head">
                <h3>{title}<Hint text={hint} /></h3>
                <p>{note}</p>
            </header>
            <div className="osum-kpis">{kpis}</div>
            <dl className="osum-rows">{rows}</dl>
        </section>
    );
}

// Two sections, deliberately in this order. The first is sized from the order
// book alone - 70% of min(top ask size, top bid size) - which is what the
// venues were actually offering. The second is sized from what this bot could
// have taken, which the TradeAmountUSDT cap and the wallet balances hold far
// below that, so reading it as "the opportunity" understates the book by
// whatever the caps removed.
export function ProjectionSummary({ s }: { s: Summary }) {
    const { t, format } = useI18n();
    const toman = t('common.toman');
    const total = s.count || 0;
    const span = s.first_detected_at && s.last_detected_at
        ? `${format.date(s.first_detected_at)} → ${format.date(s.last_detected_at)}`
        : t('opps.summary.noDetections');
    const rows = s.best_price_rows || 0;
    const unsized = total - rows;
    // The fraction actually applied, recovered from the totals rather than
    // hardcoded, so it stays right if OPPORTUNITY_PROJECTION_FRACTION changes
    // (it is stored per row, not on the summary).
    const fraction = format.number((s.best_price_matched_qty || 0) > 0
        ? Math.round((s.best_price_qty || 0) / s.best_price_matched_qty! * 100)
        : 70);
    const unverifiable = rows - (s.best_price_placeable_count || 0);
    const costs = (s.total_fees || 0) + (s.total_slippage || 0);

    return (
        <div className="osum">
            <div className="osum-meta">
                <strong>{t('opps.summary.countValue', { count: count(total) })}</strong>
                <span>{span}</span>
                {unsized > 0 && <span>{t('opps.summary.unsized', { count: count(unsized) })}</span>}
            </div>

            <Section
                title={t('opps.summary.bookTitle')}
                note={t('opps.summary.bookNote', { fraction })}
                hint={t('opps.summary.bookGroup', { fraction })}
                kpis={<>
                    <Kpi label={t('opps.summary.netAtBest')} hint={t('opps.summary.netAtBestSub')} tone={sign(s.best_price_net)}
                         value={fmtCompact(s.best_price_net)} exact={fmtToman(s.best_price_net)} unit={toman}>
                        {t('opps.summary.perOpportunity', { value: fmtToman(s.best_price_avg_net) })}
                    </Kpi>
                    <Kpi label={t('opps.summary.avgMargin')} hint={t('opps.summary.avgMarginSub', { value: fmtSignedPct(s.best_price_max_net_pct, 4) })}
                         tone={sign(s.best_price_avg_net_pct)} value={fmtSignedPct(s.best_price_avg_net_pct, 4)}>
                        {t('opps.summary.best', { value: fmtSignedPct(s.best_price_max_net_pct, 4) })}
                    </Kpi>
                    <Kpi label={t('opps.summary.volume')} hint={t('opps.summary.volumeSub', { value: fmtQty(s.best_price_matched_qty) })}
                         value={fmtCompact(s.best_price_qty)} exact={fmtQty(s.best_price_qty)} unit="USDT">
                        {t('opps.summary.matchedOf', { value: fmtCompact(s.best_price_matched_qty) })}
                    </Kpi>
                    <Kpi label={t('opps.summary.placeable')} hint={t('opps.summary.placeableSub')} value={count(s.best_price_placeable_count)}>
                        <Ratio part={s.best_price_placeable_count || 0} total={rows}
                               extra={unverifiable > 0 ? t('opps.summary.notVerifiable', { count: count(unverifiable) }) : undefined} />
                    </Kpi>
                </>}
                rows={<>
                    <Row label={t('opps.summary.bestSingle')}>{fmtToman(s.best_price_max_net)} <small>{toman}</small></Row>
                    <Row label={t('opps.summary.avgSize')} hint={t('opps.summary.avgSizeSub', { fraction, value: fmtQty(s.best_price_avg_matched_qty) })}>
                        {fmtQty(s.best_price_avg_qty, 2)} <small>USDT</small>
                    </Row>
                    <Row label={t('opps.summary.fees')} hint={t('opps.summary.feesSub')}>{fmtToman(s.best_price_fees)} <small>{toman}</small></Row>
                    <Row label={t('opps.summary.capital')} hint={t('opps.summary.capitalSub')}>{fmtToman(s.best_price_deployed)} <small>{toman}</small></Row>
                </>}
            />

            <Section
                title={t('opps.summary.cappedTitle')}
                note={t('opps.summary.cappedNote')}
                hint={t('opps.summary.cappedGroup')}
                kpis={<>
                    <Kpi label={t('opps.summary.totalNet')} hint={t('opps.summary.totalNetSub')} tone={sign(s.total_net_profit)}
                         value={fmtCompact(s.total_net_profit)} exact={fmtToman(s.total_net_profit)} unit={toman}>
                        {t('opps.summary.afterCosts')}
                    </Kpi>
                    <Kpi label={t('opps.summary.avgProjected')} hint={t('opps.summary.avgProjectedSub', { fraction, value: fmtQty(s.avg_max_amount) })}
                         value={fmtCompact(s.avg_projected_qty)} exact={fmtQty(s.avg_projected_qty)} unit="USDT">
                        {t('opps.summary.avgMaxOf', { value: fmtCompact(s.avg_max_amount) })}
                    </Kpi>
                    <Kpi label={t('opps.summary.costs')} value={fmtCompact(costs)} exact={fmtToman(costs)} unit={toman}>
                        {t('opps.summary.costsSplit', { fees: fmtCompact(s.total_fees), slippage: fmtCompact(s.total_slippage) })}
                    </Kpi>
                    <Kpi label={t('opps.summary.placeable')} hint={t('opps.summary.placeableProjectedSub')} value={count(s.placeable_count)}>
                        <Ratio part={s.placeable_count || 0} total={total} />
                    </Kpi>
                </>}
                rows={<>
                    <Row label={t('opps.summary.executed')}>{t('opps.summary.executedValue', { executed: count(s.executed_count), count: count(total) })}</Row>
                    <Row label={t('opps.summary.traded')}>{fmtQty(s.total_traded_qty, 2)} <small>USDT</small></Row>
                    <Row label={t('opps.summary.projectedVolume')}>{fmtQty(s.total_projected_qty, 2)} <small>USDT</small></Row>
                </>}
            />
        </div>
    );
}
