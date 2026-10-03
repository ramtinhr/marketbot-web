import { useI18n } from '../../../i18n';
import { initial } from '../../../shared/lib';
import { DataTable, StatusBadge, type Column } from '../../../shared/ui';
import type { AdminRow } from '../api';

export function AdminsTable({ rows, selfId, onReset, onRemove }: {
    rows: AdminRow[] | undefined;
    selfId: number | undefined;
    onReset: (row: AdminRow) => void;
    onRemove: (row: AdminRow) => void;
}) {
    const { t, format } = useI18n();
    const when = (iso: string | null) => (iso ? format.dateTime(iso) : t('admins.never'));

    const columns: Column<AdminRow>[] = [
        {
            key: 'user',
            header: t('admins.col.username'),
            cell: (row) => (
                <div className="admins-user">
                    <span className="admins-avatar" aria-hidden="true">{initial(row.username)}</span>
                    <span className="admins-name">{row.username}</span>
                    {row.id === selfId && <StatusBadge tone="simulated">{t('admins.you')}</StatusBadge>}
                </div>
            ),
        },
        { key: 'lastLogin', header: t('admins.col.lastLogin'), className: 'muted', cell: (row) => when(row.last_login_at) },
        {
            key: 'sessions',
            header: t('admins.col.sessions'),
            cell: (row) => (row.active_sessions > 0
                ? <StatusBadge tone="online">{format.number(row.active_sessions)}</StatusBadge>
                : <span className="muted">—</span>),
        },
        {
            key: 'created',
            header: t('admins.col.created'),
            className: 'muted',
            cell: (row) => <>
                {format.dateTime(row.created_at)}
                {row.created_by && <div className="admins-by">{t('admins.createdBy', { username: row.created_by })}</div>}
            </>,
        },
        {
            key: 'actions',
            header: t('admins.col.actions'),
            className: 'mt-actions',
            // Nobody resets or removes themselves here: that is what "Your password" is for.
            cell: (row) => row.id !== selfId && <>
                <button className="btn mt-small" type="button" onClick={() => onReset(row)}>{t('admins.resetPassword')}</button>
                {' '}
                <button className="btn mt-small mt-danger" type="button" onClick={() => onRemove(row)}>{t('admins.remove')}</button>
            </>,
        },
    ];

    return (
        <DataTable className="admins-table" columns={columns} rows={rows} rowKey={(row) => row.id}
                   loading={t('status.loading')} empty={{ icon: '👤', text: t('admins.empty') }} />
    );
}
