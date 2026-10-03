import type { ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { cx, signClass } from '../../../shared/lib';
import { JsonView, StatusBadge, TableHead, Template, type HeaderSpec } from '../../../shared/ui';
import type { AuditLeg, AuditTrade as Trade } from '../api';
import { AuditValue, FieldCheck, fieldLabel, fieldState, fmtValText, MARK_BAD, MARK_NEAR, MARK_OK, MISSING, needsAttention } from '../verdict';

// Which asset an exchange bills its commission in decides which balance the
// cost lands on, so it is shown rather than folded into one number.
function FeeLine({ leg }: { leg: AuditLeg }) {
    const { t, format } = useI18n();
    if (!leg.fee_measured) return leg.verified ? <> · <span className="fee-text">{t('audit.feeNotReported')}</span></> : null;
    const parts: string[] = [];
    if (leg.fee_quote) parts.push(`${fmtValText(leg.fee_quote, 'IRT')} IRT`);
    if (leg.fee_base) parts.push(`${fmtValText(leg.fee_base, 'USDT')} USDT`);
    if (!parts.length) parts.push(format.number(0));
    return <> · <span className="fee-text">{t('audit.feeCharged', { parts: parts.join(' + ') })}</span></>;
}

// Status is compared like any other field - first, since it decides how every
// row under it should be read.
function StatusRow({ leg }: { leg: AuditLeg }) {
    const { t } = useI18n();
    const recorded = leg.recorded_status || t('common.unknown');
    if (!leg.verified) {
        return (
            <tr className="audit-row-missing">
                <td>{t('audit.field.status')}</td>
                <td>{recorded}</td>
                <td><span className="audit-missing">{t('audit.notVerified')}</span></td>
                <td>{MISSING}</td>
            </tr>
        );
    }
    const exchange = leg.exchange_status || t('common.unknown');
    const bad = leg.status_mismatch || leg.status_stale;
    const same = !bad && (leg.recorded_status || '').toLowerCase() === exchange.toLowerCase();
    const showRaw = leg.exchange_raw_status && leg.exchange_raw_status.toLowerCase() !== exchange.toLowerCase();
    const state = bad ? 'bad' : same ? 'ok' : 'near';
    return (
        <tr className={`audit-row-${state}`}>
            <td>
                {t('audit.field.status')}
                {leg.status_stale && <div className="audit-note-inline">{t('audit.statusStale')}</div>}
            </td>
            <td>{recorded}</td>
            <td className="audit-exch">
                {exchange}
                {showRaw && <> <span className="audit-sub">{leg.exchange_raw_status}</span></>}
                {!leg.terminal && <> <span className="audit-sub">· {t('audit.stillOpen')}</span></>}
            </td>
            <td>{state === 'bad' ? MARK_BAD : state === 'ok' ? MARK_OK : MARK_NEAR}</td>
        </tr>
    );
}

/** Not verified, N mismatches, or matches. */
function Verdict({ mismatches, verified }: { mismatches: number; verified: boolean }) {
    const { t, plural } = useI18n();
    if (mismatches > 0) return <StatusBadge tone="failed">{plural('audit.mismatches', mismatches)}</StatusBadge>;
    if (!verified) return <StatusBadge tone="pending">{t('audit.notVerified')}</StatusBadge>;
    return <StatusBadge tone="ok">{t('audit.matches')}</StatusBadge>;
}

function Leg({ leg }: { leg: AuditLeg }) {
    const { t } = useI18n();
    const columns: HeaderSpec[] = [
        { key: 'field', header: t('audit.col.field') },
        { key: 'recorded', header: t('audit.col.recorded') },
        { key: 'exchange', header: t('audit.col.exchange') },
        { key: 'difference', header: t('audit.col.difference') },
    ];
    return (
        <div className="audit-leg">
            <div className="audit-leg-head">
                <span className={leg.side === 'buy' ? 'side-buy' : 'side-sell'}>{String(leg.side).toUpperCase()}</span>
                <span className="provider-tag">{leg.provider}</span>
                <span className="spacer" />
                {/* An unverified leg says so before it says anything about mismatches. */}
                <Verdict mismatches={leg.verified ? leg.mismatch_count : 0} verified={leg.verified} />
            </div>
            <div className="audit-leg-order">{t('audit.order', { id: leg.order_id || '—' })}<FeeLine leg={leg} /></div>
            {/* A leg the exchange never answered for shows its recorded values
                with an empty exchange column and says why - never a clean-looking row. */}
            {leg.error && <div className="audit-leg-error">{leg.error}</div>}
            <table className="audit-table">
                <TableHead columns={columns} />
                <tbody>
                    <StatusRow leg={leg} />
                    {(leg.fields || []).map((f, i) => {
                        const state = fieldState(f, leg);
                        return (
                            <tr key={`${f.field}-${i}`} className={`audit-row-${state}`}>
                                <td title={f.note || ''}>{fieldLabel(f.field)}</td>
                                <td><AuditValue v={f.recorded} unit={f.unit} /></td>
                                <td className="audit-exch"><AuditValue v={f.exchange} unit={f.unit} /></td>
                                <td><FieldCheck field={f} state={state} /></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {leg.raw != null && (
                <details className="audit-raw">
                    <summary>{t('audit.rawResponse')}</summary>
                    <JsonView value={leg.raw} />
                </details>
            )}
        </div>
    );
}

function Figure({ label, children }: { label: ReactNode; children: ReactNode }) {
    return <span className="audit-fig"><span className="audit-fig-label">{label}</span>{children}</span>;
}

/** One trade: a summary line that folds open to both legs, field by field. */
export function AuditTrade({ trade, open, onToggle }: { trade: Trade; open: boolean; onToggle: (open: boolean) => void }) {
    const { t, format } = useI18n();
    const measured = trade.realized_net !== null && trade.realized_net !== undefined;
    const realizedClass = signClass(trade.realized_net);
    const realized = measured
        ? <span className={realizedClass}><AuditValue v={trade.realized_net} unit="IRT" /></span>
        : <span className="audit-missing">{t('audit.notMeasurable')}</span>;
    const statusTone = trade.status === 'completed' ? 'completed' : trade.status === 'failed' ? 'failed' : 'pending';
    const venue = (leg: AuditLeg | undefined) => leg?.provider || '—';

    return (
        <details className={cx('audit-trade', trade.mismatch_count > 0 && 'has-mismatch')} open={open}
                 onToggle={(e) => { if (e.currentTarget.open !== open) onToggle(e.currentTarget.open); }}>
            <summary className="audit-trade-head">
                <span className="audit-caret" aria-hidden="true" />
                <span className="audit-time">{format.dateTime(trade.created_at)}</span>
                <span className="provider-tag">{trade.symbol}</span>
                <span className="audit-route"><span className="side-buy">{venue(trade.buy)}</span> → <span className="side-sell">{venue(trade.sell)}</span></span>
                <StatusBadge tone={statusTone}>{trade.status || 'pending'}</StatusBadge>
                {trade.simulated && <StatusBadge tone="simulated">{t('common.simulated')}</StatusBadge>}
                <span className="spacer" />
                <Figure label={t('audit.expected')}>
                    <span className={(trade.expected_profit || 0) >= 0 ? 'profit-positive' : 'profit-negative'}><AuditValue v={trade.expected_profit} unit="IRT" /></span>
                </Figure>
                <Figure label={t('audit.realized')}>{realized}</Figure>
                <Verdict mismatches={trade.mismatch_count} verified={!needsAttention(trade)} />
            </summary>
            <div className="audit-legs">
                <Leg leg={trade.buy} />
                <Leg leg={trade.sell} />
            </div>
            <div className="audit-note">
                {/* This strategy takes its profit as retained base asset, not IRT,
                    so the outcome only makes sense as both axes added together -
                    the IRT change alone reads as a large loss on a trade that
                    made money. Both parts stay visible. */}
                {measured && (
                    <span>
                        {t('audit.realized')} {realized}{' '}
                        <Template template={t('audit.realizedBreakdown')} nodes={{
                            flow: <span className={signClass(trade.quote_flow_net)}><AuditValue v={trade.quote_flow_net} unit="IRT" /></span>,
                            base: <AuditValue v={trade.retained_base} unit="USDT" />,
                            value: <AuditValue v={trade.retained_base_value} unit="IRT" />,
                            fees: <AuditValue v={trade.modeled_fees} unit="IRT" />,
                            feeLabel: t(trade.fees_measured ? 'audit.feesLabel' : 'audit.feesModeled'),
                        }} />
                    </span>
                )}
                <span className="audit-exec-id">
                    <Template template={t('audit.execution')} nodes={{ id: <bdi>{trade.execution_id}</bdi> }} />
                </span>
            </div>
        </details>
    );
}
