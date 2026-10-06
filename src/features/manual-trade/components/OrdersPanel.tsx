import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { cx } from '../../../shared/lib';
import { usePageStatus } from '../../../shared/stores/pageStatus';
import { confirmDialog, DataTable, EmptyState, Segmented, type Column } from '../../../shared/ui';
import { isLive, LIVE_STATUSES, useCancelOrder, useManualOrders, type ManualLeg, type ManualOrder } from '../api';
import { baseAsset, fmtPrice, fmtQty, VenueTag } from '../format';

const ORDER_FILTERS: Array<[string, string]> = [
    ['', 'manual.orders.filter.all'],
    ['open', 'manual.orders.filter.open'],
    ['filled', 'manual.orders.filter.filled'],
    ['refused', 'manual.orders.filter.refused'],
];

const STATUS_CLASS: Record<string, string> = {
    filled: 'completed', partial: 'stale', open: 'pending', placing: 'pending', cancel_requested: 'pending',
    cancelled: 'offline', failed: 'failed', simulated: 'simulated', refused: 'failed',
};

// Leg statuses are the bot's own recorded values and double as the badge
// class, so they are shown as recorded rather than translated away from
// what its logs say.
function Badge({ status }: { status: string }) {
    return <span className={`status-badge ${STATUS_CLASS[status] || 'pending'}`}>{String(status).replace('_', ' ')}</span>;
}

type Cancel = (orderId: string, legId?: string) => void;

/** Cancels with a confirm prompt, tracking which order or leg each click is still waiting on. */
function useCancelling() {
    const { t } = useI18n();
    const status = usePageStatus();
    const cancel = useCancelOrder();
    const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

    const keyOf = (orderId: string, legId?: string) => `${orderId}:${legId || ''}`;
    const onCancel: Cancel = async (orderId, legId) => {
        if (!await confirmDialog({
            tone: 'danger',
            title: t(legId ? 'manual.orders.confirmCancelLeg.title' : 'manual.orders.confirmCancelAll.title'),
            message: t('manual.orders.confirmCancelBody'),
            confirmLabel: t(legId ? 'manual.orders.confirmCancelLeg.action' : 'manual.orders.confirmCancelAll.action'),
            cancelLabel: t('common.goBack'),
        })) return;
        const key = keyOf(orderId, legId);
        setPending((prev) => new Set(prev).add(key));
        cancel.mutate({ orderId, legId }, {
            onSuccess: () => status.hideError(),
            onError: (err) => status.showError(err.message),
            onSettled: () => setPending((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            }),
        });
    };
    return { isCancelling: (orderId: string, legId?: string) => pending.has(keyOf(orderId, legId)), onCancel };
}

type Cancelling = ReturnType<typeof useCancelling>;

function CancelButton({ order, legId, className, label, cancelling }: {
    order: ManualOrder; legId?: string; className: string; label: string; cancelling: Cancelling;
}) {
    const { t } = useI18n();
    const busy = cancelling.isCancelling(order.id, legId);
    return (
        <button className={className} disabled={busy} onClick={() => cancelling.onCancel(order.id, legId)}>
            {busy ? t('manual.orders.cancelling') : label}
        </button>
    );
}

function LegsTable({ order, cancelling }: { order: ManualOrder; cancelling: Cancelling }) {
    const { t, format } = useI18n();
    const columns: Column<ManualLeg>[] = [
        { key: 'venue', header: t('manual.preview.col.venue'), cell: (l) => <VenueTag code={l.provider} /> },
        { key: 'status', header: t('manual.orders.col.status'), cell: (l) => <Badge status={l.status} /> },
        {
            key: 'filled', header: t('manual.orders.col.filledSent'),
            cell: (l) => <>{fmtQty(l.executed_qty)} / {fmtQty(l.qty)}{l.rest_qty > 0 && <> <span className="fee-text">{t('manual.orders.rests')}</span></>}</>,
        },
        { key: 'limit', header: t('manual.preview.col.limit'), cell: (l) => fmtPrice(l.limit_price) },
        {
            key: 'avg', header: t('manual.orders.col.avgFill'),
            cell: (l) => (l.executed_qty > 0 && l.executed_quote > 0 ? fmtPrice(l.executed_quote / l.executed_qty) : '—'),
        },
        {
            key: 'order', header: t('manual.orders.col.order'), className: 'fee-text wrap',
            cell: (l) => <>
                {l.order_id || '—'}
                {l.cancel_at && LIVE_STATUSES.has(l.status) ? t('manual.orders.autoCancel', { time: format.dateTime(l.cancel_at) }) : ''}
                {l.last_error && <div className="mt-excluded">{l.last_error}</div>}
            </>,
        },
        {
            key: 'cancel', header: '',
            cell: (l) => LIVE_STATUSES.has(l.status) && !order.simulated
                && <CancelButton order={order} legId={l.id} className="btn mt-small" label={t('manual.orders.cancel')} cancelling={cancelling} />,
        },
    ];
    return <DataTable className="mt-table" columns={columns} rows={order.legs} rowKey={(l) => l.id} loading={null} empty={{ text: '' }} />;
}

/** Why a refused order sent nothing: each venue the live re-plan left out. */
function RefusedDetail({ order }: { order: ManualOrder }) {
    const { t } = useI18n();
    const reasons = order.venue_reasons || [];
    return (
        <>
            <div className="mt-sub">{t('manual.orders.nothingSent')}</div>
            {reasons.length > 0 && (
                <ul className="mt-reasons">
                    {reasons.map((r, i) => <li key={i}><VenueTag code={r.provider} /> — {r.reason}</li>)}
                </ul>
            )}
        </>
    );
}

function OrderCard({ order: o, cancelling }: { order: ManualOrder; cancelling: Cancelling }) {
    const { t, format } = useI18n();
    const base = baseAsset(o.symbol);
    const planned = o.planned_qty || 0;
    const filledPct = planned > 0 ? Math.min(100, (o.filled_qty / planned) * 100) : 0;
    const live = isLive(o);
    const asked = [
        o.limit_price > 0 ? t('manual.orders.atPrice', { price: fmtPrice(o.limit_price) }) : t('manual.orders.bestPrice'),
        o.requested_qty > 0 ? t('manual.orders.quantityAsset', { qty: fmtQty(o.requested_qty), asset: base }) : t('manual.orders.allAtPrice'),
    ].join(' · ');

    return (
        <div className={cx('mt-order', live && 'live')}>
            <div className="mt-order-head">
                <span className="audit-time">{format.dateTime(o.created_at)}</span>
                <span className={o.side === 'buy' ? 'side-buy' : 'side-sell'}>{o.side.toUpperCase()}</span>
                <strong>{o.symbol}</strong>
                <span className="fee-text">{asked}</span>
                <Badge status={o.status} />
                {o.simulated && <span className="status-badge simulated">{t('common.simulated')}</span>}
                <span className="spacer" />
                <span className="fee-text">{t('manual.orders.filled')}</span> <strong>{fmtQty(o.filled_qty)}</strong>
                <span className="fee-text">{t('manual.orders.of', { qty: fmtQty(planned), asset: base })}</span>
                {o.avg_fill_price > 0 && <><span className="fee-text">{t('manual.orders.avg')}</span> <strong>{fmtPrice(o.avg_fill_price)}</strong></>}
                {live && !o.simulated && (
                    <CancelButton order={o} className="btn mt-small mt-danger" label={t('manual.orders.cancelAll')} cancelling={cancelling} />
                )}
            </div>
            <div className="mt-progress"><span style={{ width: `${filledPct.toFixed(1)}%` }} /></div>
            {o.error_message && <div className="audit-leg-error">{o.error_message}</div>}
            {o.legs.length ? <LegsTable order={o} cancelling={cancelling} /> : <RefusedDetail order={o} />}
        </div>
    );
}

export function OrdersPanel() {
    const { t } = useI18n();
    const [filter, setFilter] = useState('');
    const orders = useManualOrders(filter);
    const cancelling = useCancelling();
    const list = orders.data;

    let body;
    if (orders.error) body = <EmptyState icon="⚠️" text={orders.error.message} />;
    else if (!list) body = <div className="skeleton">{t('manual.orders.loading')}</div>;
    else if (list.length === 0) body = <EmptyState icon="🗒️" text={t('manual.orders.empty')} />;
    else body = list.map((o) => <OrderCard key={o.id} order={o} cancelling={cancelling} />);

    return (
        <section className="panel">
            <div className="panel-header">
                <h2><span>{t('manual.orders.title')}</span> <span className="count">{list ? list.length : 0}</span></h2>
                <div className="toolbar-group">
                    <Segmented value={filter} dataKey="status"
                               options={ORDER_FILTERS.map(([value, key]) => ({ value, label: t(key) }))}
                               onPick={(value) => { if (value === filter) void orders.refetch(); else setFilter(value); }} />
                </div>
            </div>
            <div>{body}</div>
        </section>
    );
}
