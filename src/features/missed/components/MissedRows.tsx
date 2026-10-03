import { Fragment, type ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { fmtQty, fmtShortTime, fmtSignedPct, fmtToman, signClass } from '../../../shared/lib';
import { EmptyState, ProviderRoute, StatusBadge, TableHead, type HeaderSpec, type TableSort } from '../../../shared/ui';
import type { Leg, MissedRow } from '../api';
import { Amount, errorLabel } from '../labels';

function LegCell({ l }: { l: Leg }) {
    const { t } = useI18n();
    if (!l.known) return <span className="fee-text" title={t('missed.leg.unknownHint')}>{t('common.unknown')}</span>;
    if (!l.short) return <><span className="fee-text">{t('missed.leg.ok')}</span> <Amount n={l.have} asset={l.asset} /></>;
    return (
        <>
            <div><Amount n={l.have} asset={l.asset} /> / <Amount n={l.need} asset={l.asset} /></div>
            <div className="profit-negative">{t('missed.leg.short', { venue: l.venue })} <Amount n={l.shortfall} asset={l.asset} /></div>
        </>
    );
}

function ReasonCell({ r }: { r: MissedRow }) {
    const { t } = useI18n();
    const reasons = r.reasons || [];
    const badges: ReactNode[] = [];
    if (reasons.includes('buy_balance')) badges.push(<StatusBadge key="buy" tone="failed">{t('missed.reason.buyBalance')}</StatusBadge>);
    if (reasons.includes('sell_balance')) badges.push(<StatusBadge key="sell" tone="failed">{t('missed.reason.sellBalance')}</StatusBadge>);
    if (r.error) badges.push(<StatusBadge key="error" tone={r.error.kind === 'execution_failed' ? 'failed' : 'pending'}>{errorLabel(r.error.kind)}</StatusBadge>);
    // A wallet refusal carries the bot's own reason, like an error does.
    const text = r.error ? r.error.message : r.wallet_refusal ? r.outcome_detail : '';
    return (
        <>
            {badges.map((b, i) => <Fragment key={i}>{i > 0 && ' '}{b}</Fragment>)}
            {r.simulated && <> <span className="fee-text">{t('common.sim')}</span></>}
            {text && <div className="fee-text reason-line" title={text}>{text}</div>}
        </>
    );
}

function Row({ r }: { r: MissedRow }) {
    const { t, format } = useI18n();
    const base = r.symbol.split('_')[0];
    return (
        <tr>
            <td className="audit-time" title={format.dateTime(r.detected_at)}>{fmtShortTime(r.detected_at)}</td>
            <td>{r.symbol}</td>
            <td className="route-cell"><ProviderRoute from={r.buy_provider} to={r.sell_provider} /></td>
            {r.known ? (
                <>
                    <td title={t('missed.list.matchedHint', { matched: fmtQty(r.matched_qty, 6) })}>
                        {fmtQty(r.target_qty, 6)} <span className="fee-text">{base}</span>
                        <div className="fee-text">{t('missed.list.eachSide', { matched: fmtQty(r.matched_qty, 6) })}</div>
                    </td>
                    <td className={signClass(r.gross)}>{fmtToman(r.gross)}</td>
                    <td className={signClass(r.net)}>
                        {fmtToman(r.net)} <span className="fee-text">{fmtSignedPct(r.net_pct, 3)}</span>
                        <div className="fee-text">{t('missed.list.fees', { fees: fmtToman(r.fees) })}</div>
                    </td>
                </>
            ) : (
                <td colSpan={3} className="audit-missing" title={t('opps.row.depthNotPublishedHint')}>{t('opps.row.depthNotPublished')}</td>
            )}
            <td className="leg-cell"><LegCell l={r.buy} /></td>
            <td className="leg-cell"><LegCell l={r.sell} /></td>
            <td><ReasonCell r={r} /></td>
        </tr>
    );
}

export function MissedRows({ rows, sort }: { rows: MissedRow[]; sort: TableSort }) {
    const { t } = useI18n();
    if (rows.length === 0) return <EmptyState icon="🎯" text={t('missed.empty')} />;

    const columns: HeaderSpec[] = [
        { key: 'detected_at', header: t('opps.col.detected'), sortable: true },
        { key: 'pair', header: t('missed.list.col.pair') },
        { key: 'route', header: t('common.route') },
        { key: 'target_qty', header: t('missed.list.col.target'), headerTitle: t('missed.list.col.targetHint'), sortable: true },
        { key: 'gross', header: t('missed.list.col.gross'), headerTitle: t('missed.list.col.grossHint'), sortable: true },
        { key: 'net', header: t('missed.list.col.net'), sortable: true },
        { key: 'buyWallet', header: t('missed.list.col.buyWallet'), headerTitle: t('missed.list.col.buyWalletHint') },
        { key: 'sellWallet', header: t('missed.list.col.sellWallet'), headerTitle: t('missed.list.col.sellWalletHint') },
        { key: 'reason', header: t('missed.list.col.reason') },
    ];
    return (
        <div className="table-scroll">
            <table className="data-table">
                <TableHead columns={columns} sort={sort} />
                <tbody>{rows.map((r, i) => <Row key={r.id ?? i} r={r} />)}</tbody>
            </table>
        </div>
    );
}
