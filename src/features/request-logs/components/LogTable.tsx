import { Fragment } from 'react';

import { useI18n } from '../../../i18n';
import { useExpanded } from '../../../shared/hooks';
import { cx } from '../../../shared/lib';
import { DetailRow, EmptyState, JsonView, Skeleton, StatusBadge, TableHead, type HeaderSpec } from '../../../shared/ui';
import type { RequestLog } from '../api';

function LogDetail({ log }: { log: RequestLog }) {
    const { t, format } = useI18n();
    const chips: Array<[string, unknown]> = [
        ['logs.meta.provider', log.provider],
        ['logs.meta.operation', log.operation],
        ['logs.meta.symbol', log.symbol],
        ['logs.meta.side', log.side],
        ['logs.meta.orderId', log.order_id],
        ['logs.meta.duration', format.number(log.duration_ms)],
        ['logs.meta.id', log.id],
    ];
    return (
        <div className="detail-wrap">
            <div className="detail-grid">
                <div>
                    <div className="detail-col-label">{t('logs.detail.request')}</div>
                    <JsonView value={log.request} />
                </div>
                <div>
                    <div className="detail-col-label">{t('logs.detail.response')}</div>
                    <JsonView value={log.response} />
                </div>
                <div className="detail-meta">
                    {chips.filter(([, value]) => value).map(([key, value]) => (
                        <span key={key} className="meta-chip">{t(key, { value: String(value) })}</span>
                    ))}
                </div>
                {log.error_message && <div className="error-line">{log.error_message}</div>}
            </div>
        </div>
    );
}

function LogRow({ log, open, onToggle }: { log: RequestLog; open: boolean; onToggle: () => void }) {
    const { t, format } = useI18n();
    const sideClass = log.side === 'buy' ? 'side-buy' : log.side === 'sell' ? 'side-sell' : '';
    return (
        <tr className={cx('log-row', !log.success && 'failed', open && 'expanded')} onClick={onToggle}>
            <td><span className="expand-arrow">▶</span></td>
            <td>{format.dateTime(log.created_at)}</td>
            <td className="provider-tag">{log.provider}</td>
            <td><span className="op-tag">{log.operation}</span></td>
            <td>{log.symbol || <span className="json-null">—</span>}</td>
            <td className={sideClass}>{log.side || '—'}</td>
            <td>{log.order_id || '—'}</td>
            <td>{t('common.milliseconds', { value: format.number(log.duration_ms) })}</td>
            <td>
                <StatusBadge tone={log.success ? 'ok' : 'fail'}>{t(log.success ? 'logs.result.ok' : 'logs.result.failed')}</StatusBadge>
            </td>
        </tr>
    );
}

/** The log list; a row expands in place to show the request and response. */
export function LogTable({ logs }: { logs: RequestLog[] | undefined }) {
    const { t } = useI18n();
    const { isOpen, toggle } = useExpanded<number>();

    if (!logs) return <Skeleton>{t('logs.loading')}</Skeleton>;
    if (logs.length === 0) return <EmptyState icon="🧾" text={t('logs.empty')} />;

    const columns: HeaderSpec[] = [
        { key: 'expand', header: null },
        { key: 'time', header: t('common.time') },
        { key: 'provider', header: t('common.provider') },
        { key: 'operation', header: t('logs.filter.operation') },
        { key: 'symbol', header: t('common.symbol') },
        { key: 'side', header: t('logs.col.side') },
        { key: 'order', header: t('logs.filter.orderId') },
        { key: 'duration', header: t('logs.col.duration') },
        { key: 'result', header: t('logs.filter.result') },
    ];
    return (
        <div className="table-scroll">
            <table className="data-table log-table">
                <TableHead columns={columns} />
                <tbody>
                    {logs.map((log) => (
                        <Fragment key={log.id}>
                            <LogRow log={log} open={isOpen(log.id)} onToggle={() => toggle(log.id)} />
                            <DetailRow open={isOpen(log.id)} span={columns.length}><LogDetail log={log} /></DetailRow>
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
