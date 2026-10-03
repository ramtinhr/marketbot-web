import { Fragment } from 'react';

import { useI18n } from '../../../i18n';
import { useExpanded } from '../../../shared/hooks';
import { cx, fmtQty, fmtShortTime, fmtSignedPct, fmtToman, signClass } from '../../../shared/lib';
import { DetailRow, EmptyState, ProviderRoute, Skeleton, StatusBadge, TableHead, type HeaderSpec, type TableSort } from '../../../shared/ui';
import type { Projection } from '../api';
import { bestPriceOf, limitLabel, limitShort, outcomeOf, placeabilityOf } from '../labels';
import { ProjectionDetail } from './ProjectionDetail';

function ProjectionRow({ r, open, onToggle }: { r: Projection; open: boolean; onToggle: () => void }) {
    const { t, format } = useI18n();
    const outcome = outcomeOf(r.outcome);
    const bp = bestPriceOf(r);
    const place = placeabilityOf(bp.placeable);
    return (
        <tr className={cx('log-row', open && 'expanded')} onClick={onToggle}>
            <td><span className="expand-arrow">▶</span></td>
            <td className="audit-time" title={format.dateTime(r.detected_at)}>{fmtShortTime(r.detected_at)}</td>
            <td className="route-cell"><ProviderRoute from={r.buy_provider} to={r.sell_provider} /></td>
            <td>
                {fmtQty(r.max_amount)}{' '}
                <span className="fee-text" title={t('opps.row.limitedBy', { limit: limitLabel(r.limited_by) })}>{limitShort(r.limited_by)}</span>
            </td>
            <td>{fmtQty(r.projected_amount)}{!r.placeable && <> <span className="fee-text" title={t('opps.row.belowMinimum')}>⚠</span></>}</td>
            <td className={signClass(r.net_profit)}>{fmtToman(r.net_profit)}</td>
            <td className={signClass(r.net_profit_pct)}>{fmtSignedPct(r.net_profit_pct)}</td>
            {bp.known ? (
                <>
                    <td>
                        {fmtQty(bp.amount)}{' '}
                        <span className="fee-text" title={t('opps.row.matchedHint', { matched: fmtQty(bp.matched_qty, 4), hint: place.long })}>
                            {t('opps.row.ofMatched', { matched: fmtQty(bp.matched_qty), placeable: place.label })}
                        </span>
                    </td>
                    <td className={signClass(bp.net)}>{fmtToman(bp.net)} <span className="fee-text">{fmtSignedPct(bp.net_pct, 3)}</span></td>
                </>
            ) : (
                <td colSpan={2} className="audit-missing" title={t('opps.row.depthNotPublishedHint')}>{t('opps.row.depthNotPublished')}</td>
            )}
            <td><StatusBadge tone={outcome.badge}>{outcome.label}</StatusBadge>{r.simulated && <> <span className="fee-text">{t('common.sim')}</span></>}</td>
        </tr>
    );
}

/**
 * Two groups: the deep-book projection (Max size / Projected / Net), which
 * walks down both books, and the best-price pair, which never leaves the top
 * level. They answer different questions and are shown side by side rather
 * than one standing in for the other. The best-price columns are derived on
 * read, so the API has nothing to sort them by.
 */
export function ProjectionTable({ rows, sort }: { rows: Projection[] | undefined; sort: TableSort }) {
    const { t } = useI18n();
    const { isOpen, toggle } = useExpanded<string>();

    if (!rows) return <Skeleton>{t('opps.loading')}</Skeleton>;
    if (rows.length === 0) return <EmptyState icon="🧮" text={t('opps.empty')} />;

    const columns: HeaderSpec[] = [
        { key: 'expand', header: null },
        { key: 'detected_at', header: t('opps.col.detected'), sortable: true },
        { key: 'buy_provider', header: t('common.route'), sortable: true },
        { key: 'max_amount', header: t('opps.col.maxSize'), sortable: true },
        { key: 'projected_amount', header: t('opps.col.projected'), sortable: true },
        { key: 'net_profit', header: t('opps.col.net'), sortable: true },
        { key: 'net_profit_pct', header: t('opps.col.netPct'), sortable: true },
        { key: 'best', header: t('opps.col.bestPrice'), headerTitle: t('opps.col.bestPriceHint') },
        { key: 'netAtBest', header: t('opps.col.netAtBest'), headerTitle: t('opps.col.netAtBestHint') },
        { key: 'outcome', header: t('common.outcome'), sortable: true },
    ];
    return (
        <div className="table-scroll">
            <table className="data-table log-table">
                <TableHead columns={columns} sort={sort} />
                <tbody>
                    {rows.map((r) => (
                        <Fragment key={r.id}>
                            <ProjectionRow r={r} open={isOpen(r.id)} onToggle={() => toggle(r.id)} />
                            <DetailRow open={isOpen(r.id)} span={columns.length}>
                                <div className="detail-wrap"><ProjectionDetail r={r} /></div>
                            </DetailRow>
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
