import type { ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { DataTable, EmptyState, Panel, type Column } from '../../../shared/ui';
import type { OrderRequest, Plan, PlanLeg, PlanVenue } from '../api';
import { baseAsset, fmtPrice, fmtQty, fmtToman, VenueTag } from '../format';
import type { OrderTicket, PreviewNote } from '../useOrderTicket';

function SummaryFigure({ label, children }: { label: ReactNode; children: ReactNode }) {
    return <div><span className="stat-label">{label}</span>{children}</div>;
}

function LegsTable({ legs }: { legs: PlanLeg[] }) {
    const { t, format } = useI18n();
    const columns: Column<PlanLeg>[] = [
        { key: 'venue', header: t('manual.preview.col.venue'), cell: (l) => <VenueTag code={l.provider} /> },
        { key: 'volume', header: t('manual.preview.col.volume'), cell: (l) => fmtQty(l.qty) },
        {
            key: 'kind', header: t('manual.preview.col.kind'),
            cell: (l) => (l.rest_qty > 0 ? t('manual.preview.takeAndRest', { take: fmtQty(l.take_qty), rest: fmtQty(l.rest_qty) }) : t('manual.preview.take')),
        },
        { key: 'limit', header: t('manual.preview.col.limit'), cell: (l) => fmtPrice(l.limit_price) },
        { key: 'avg', header: t('manual.preview.col.expectedAvg'), cell: (l) => fmtPrice(l.expected_avg_price) },
        { key: 'value', header: t('manual.preview.col.value'), cell: (l) => fmtToman(l.notional) },
        { key: 'fee', header: t('manual.preview.col.fee'), className: 'fee-text', cell: (l) => t('manual.preview.feeAndValue', { fee: format.number(l.fee_pct), value: fmtToman(l.est_fee) }) },
    ];
    return <DataTable className="mt-table" columns={columns} rows={legs} rowKey={(_, i) => i} loading={null} empty={{ text: '' }} />;
}

function VenueBalance({ v }: { v: PlanVenue }) {
    const { t } = useI18n();
    if (!v.balance_known) return <span className="fee-text">{t('common.unknown')}</span>;
    // Credit the venue lends is spendable too, and the router sized against
    // it - so it is shown, apart from the account's own funds.
    const credit = v.credit_unlimited
        ? <> <span className="fee-text">{t('manual.preview.creditUnlimited')}</span></>
        : (v.credit || 0) > 0 ? <> <span className="fee-text">{t('manual.preview.credit', { amount: fmtQty(v.credit) })}</span></> : null;
    return <>{fmtQty(v.free)} {v.balance_asset}{credit}</>;
}

function VenuesTable({ plan, request }: { plan: Plan; request: OrderRequest }) {
    const { t, format } = useI18n();
    const columns: Column<PlanVenue>[] = [
        { key: 'venue', header: t('manual.preview.col.venue'), cell: (v) => <VenueTag code={v.provider} /> },
        { key: 'best', header: t(plan.side === 'buy' ? 'manual.preview.col.bestAsk' : 'manual.preview.col.bestBid'), cell: (v) => fmtPrice(v.best_price) },
        {
            key: 'depth', header: t(request.price > 0 ? 'manual.preview.col.depthAtPrice' : 'manual.preview.col.depth'),
            cell: (v) => (v.depth_known ? fmtQty(v.depth) : <>{fmtQty(v.depth)} <span className="fee-text">{t('manual.preview.unsizedBook')}</span></>),
        },
        { key: 'balance', header: t('manual.preview.col.balance'), cell: (v) => <VenueBalance v={v} /> },
        { key: 'fee', header: t('manual.preview.col.feeMin'), className: 'fee-text', cell: (v) => t('manual.preview.feeAndMin', { fee: format.number(v.fee_pct), min: fmtQty(v.min_qty) }) },
        {
            key: 'share', header: t('manual.preview.col.share'), className: 'wrap',
            cell: (v) => (v.excluded ? <span className="mt-excluded">{v.excluded}</span>
                : v.allocated > 0 ? <span className="side-buy">{fmtQty(v.allocated)}</span>
                    : <span className="fee-text">{t('manual.preview.nothingBetter')}</span>),
        },
    ];
    return (
        <DataTable className="mt-table" columns={columns} rows={plan.venues} rowKey={(_, i) => i}
                   rowClassName={(v) => (v.excluded ? 'incomplete' : undefined)} loading={null} empty={{ text: '' }} />
    );
}

function PreviewPlan({ plan, request }: { plan: Plan; request: OrderRequest }) {
    const { t } = useI18n();
    const base = baseAsset(plan.symbol);
    // What each unit actually costs (or yields) once fees are in: the
    // fee-inclusive total over the volume. plan.avg_price is the pre-fee
    // execution price, which stays the value sent back for the slippage check.
    const effectivePrice = plan.total_qty > 0 ? plan.net_quote / plan.total_qty : plan.avg_price;
    const blockers = plan.blockers || [];
    const warnings = plan.warnings || [];

    return (
        <>
            <div className="mt-summary">
                <SummaryFigure label={t('manual.side')}>
                    <strong className={plan.side === 'buy' ? 'side-buy' : 'side-sell'}>{plan.side.toUpperCase()} {plan.symbol}</strong>
                </SummaryFigure>
                <SummaryFigure label={t('manual.volume')}>
                    <strong>{fmtQty(plan.total_qty)} {base}</strong>
                    {plan.shortfall > 0 && (
                        <span className="mt-sub red">{t('manual.preview.shortfall', { short: fmtQty(plan.shortfall), requested: fmtQty(plan.requested_qty) })}</span>
                    )}
                </SummaryFigure>
                <SummaryFigure label={t('manual.preview.averagePrice')}>
                    <strong>{fmtPrice(effectivePrice)}</strong>
                    <span className="mt-sub">{t('manual.preview.beforeFees', { value: fmtPrice(plan.avg_price) })}</span>
                    {plan.reference_mid ? <span className="mt-sub">{t('manual.preview.marketMid', { value: fmtPrice(plan.reference_mid) })}</span> : null}
                </SummaryFigure>
                <SummaryFigure label={t(plan.side === 'buy' ? 'manual.preview.youPay' : 'manual.preview.youReceive')}>
                    <strong>{fmtToman(plan.net_quote)}</strong>
                    <span className="mt-sub">{t('manual.preview.estFees', { value: fmtToman(plan.est_fees) })}</span>
                </SummaryFigure>
            </div>
            {blockers.length > 0 && <ul className="mt-list mt-blockers">{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
            {warnings.length > 0 && <ul className="mt-list mt-warnings">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            {plan.legs.length > 0 && (
                <>
                    <div className="stat-group-label">{t('manual.preview.ordersToSend')}</div>
                    <LegsTable legs={plan.legs} />
                </>
            )}
            <div className="stat-group-label" style={{ marginTop: 16 }}>{t('manual.preview.venuesConsidered')}</div>
            <VenuesTable plan={plan} request={request} />
            <div className="summary-caption">{t('manual.preview.caption', { ceiling: fmtToman(plan.max_notional_toman) })}</div>
        </>
    );
}

function NoteView({ note }: { note: PreviewNote }) {
    const { t, plural, format } = useI18n();
    switch (note.kind) {
        case 'error': return <EmptyState icon="⚠️" text={note.message} />;
        case 'placed': return <EmptyState icon="✅" text={plural('manual.placed', note.legs, { id: note.id, status: note.status, count: format.number(note.legs) })} />;
        default: return <EmptyState icon="🧭" text={<span>{t('manual.preview.prompt')}</span>} />;
    }
}

export function PreviewPanel({ ticket }: { ticket: OrderTicket }) {
    const { t, format } = useI18n();
    const { preview, fresh, changed } = ticket;
    const age = preview
        ? t(fresh ? 'manual.preview.age' : 'manual.preview.ageStale', { seconds: format.number(ticket.previewAge) })
        : changed ? t('manual.preview.changed') : '';
    const stale = preview ? !fresh : changed;

    return (
        <Panel title={t('manual.preview.title')} hint={age}>
            <div className={stale ? 'mt-stale' : undefined}>
                {preview ? <PreviewPlan plan={preview.plan} request={preview.request} /> : <NoteView note={ticket.note} />}
            </div>
        </Panel>
    );
}
