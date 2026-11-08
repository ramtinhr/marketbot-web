import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../i18n';
import { financialRequest, request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import { confirmDialog, DataTable, Field, Notice, Panel, SelectField, type Column } from '../../shared/ui';
import { STATUSES, type WithdrawalStatus } from './api';
interface CryptoWithdrawal {
    id: string; user_id: string; asset: string; network: string; amount: string;
    destination: string; destination_tag: string | null; status: WithdrawalStatus;
    revision: string; created_at: string; payout_tx_id: string | null;
}
type Action = 'approve' | 'reject' | 'paid';
interface Selection { row: CryptoWithdrawal; action: Action }
const KEY = ['crypto-withdrawals'];
function CryptoReview({ selection: { row, action }, onClose, onDone }: { selection: Selection; onClose: () => void; onDone: () => void }) {
    const { t } = useI18n();
    const client = useQueryClient();
    const [reason, setReason] = useState(''), [txId, setTxId] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const submitting = useRef(false);
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (submitting.current) return;
        submitting.current = true; setBusy(true); setError('');
        try {
            if (!await confirmDialog({ tone: action === 'reject' ? 'danger' : 'warning', title: t(`withdrawals.action.${action}`), message: <><p>{t(`crypto.explain.${action}`)}</p><p dir="ltr">{row.amount} {row.asset} · {row.network}</p><p dir="ltr" className="withdrawal-details">{row.destination}{row.destination_tag !== null && ` · Tag: ${row.destination_tag}`}</p></>, confirmLabel: t(`withdrawals.action.${action}`) })) return;
            await financialRequest(`/crypto/withdrawals/${encodeURIComponent(row.id)}/${action}`, {
                method: 'POST', headers: { 'x-marketbot-intent': 'withdrawal-review' },
                body: { revision: row.revision, reason: reason.trim(), ...(action === 'paid' ? { tx_id: txId.trim() } : {}) },
            });
            void client.invalidateQueries({ queryKey: KEY }); onDone();
        } catch (err) { setError((err as Error).message); }
        finally { submitting.current = false; setBusy(false); }
    }
    return <Panel title={`${t('crypto.title')} · ${t(`withdrawals.action.${action}`)}`} hint={row.id}><form className="mt-form admins-form" onSubmit={submit}>
        <p>{t(`crypto.explain.${action}`)}</p><p dir="ltr">{row.amount} {row.asset} · {row.network}</p><p dir="ltr" className="withdrawal-details">{row.destination}</p>
        <fieldset disabled={busy} className="withdrawal-fields">
            {action === 'paid' && <Field id="crypto-payout-id" label={t('crypto.txId')}><input id="crypto-payout-id" required dir="ltr" autoComplete="off" spellCheck={false} value={txId} onChange={e => setTxId(e.target.value)} /></Field>}
            <Field id="crypto-review-reason" label={t('withdrawals.reason')}><input id="crypto-review-reason" required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></Field>
            <div className="mt-row"><button className="btn primary" disabled={!reason.trim() || (action === 'paid' && !txId.trim())}>{busy ? t('crypto.verifying') : t(`withdrawals.action.${action}`)}</button><button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button></div>
        </fieldset>{error && <Notice tone="red">{error}</Notice>}
    </form></Panel>;
}
export function CryptoWithdrawals() {
    const { t, format } = useI18n();
    const [status, setStatus] = useState('pending'), [selection, setSelection] = useState<Selection | null>(null), [saved, setSaved] = useState(false);
    const query = useLiveQuery({ queryKey: [...KEY, status], queryFn: ({ signal }) => request<{ withdrawals: CryptoWithdrawal[] }>('/crypto/withdrawals', { params: { status }, signal }), errorBanner: 'message' });
    const disabled = !!selection || query.isFetching || query.isError;
    const choose = (row: CryptoWithdrawal, action: Action) => { setSaved(false); setSelection({ row, action }); };
    const columns: Column<CryptoWithdrawal>[] = [
        { key: 'created', header: t('withdrawals.created'), cell: row => <>{format.dateTime(row.created_at)}<div className="prov-code" dir="ltr">{row.id}</div></> },
        { key: 'user', header: t('withdrawals.user'), cell: row => <span dir="ltr">{row.user_id}</span> },
        { key: 'amount', header: t('common.amount'), cell: row => <span dir="ltr">{row.amount} {row.asset} · {row.network}</span> },
        { key: 'destination', header: t('withdrawals.destination'), className: 'withdrawal-destination', cell: row => <><div dir="ltr">{row.destination}</div>{row.destination_tag !== null && <div dir="ltr">Tag: {row.destination_tag}</div>}{row.payout_tx_id && <div dir="ltr">{row.payout_tx_id}</div>}</> },
        { key: 'status', header: t('common.status'), cell: row => t(`withdrawals.status.${row.status}`) },
        { key: 'actions', header: t('withdrawals.actions'), cell: row => <div className="mt-row">{row.status === 'pending' && <><button className="btn mt-small primary" disabled={disabled} onClick={() => choose(row, 'approve')}>{t('withdrawals.action.approve')}</button><button className="btn mt-small mt-danger" disabled={disabled} onClick={() => choose(row, 'reject')}>{t('withdrawals.action.reject')}</button></>}{row.status === 'processing' && <button className="btn mt-small primary" disabled={disabled} onClick={() => choose(row, 'paid')}>{t('withdrawals.action.paid')}</button>}</div> },
    ];
    return <>
        {saved && <Notice tone="green">{t('withdrawals.saved')}</Notice>}
        {selection && <CryptoReview key={`${selection.row.id}:${selection.action}`} selection={selection} onClose={() => setSelection(null)} onDone={() => { setSelection(null); setSaved(true); void query.refetch(); }} />}
        <Panel title={t('crypto.title')} hint={t('crypto.hint')} count={query.data?.withdrawals.length ?? 0}>
            <div className="filters"><SelectField id="crypto-status" label={t('common.status')} value={status} onChange={value => { if (!selection) setStatus(value); }} options={[{ value: '', label: t('common.all') }, ...STATUSES.map(value => ({ value, label: t(`withdrawals.status.${value}`) }))]} /><button className="btn" disabled={!!selection || query.isFetching} onClick={() => void query.refetch()}>{t('common.refresh')}</button></div>
            {query.isError && <Notice tone="red">{query.error.message}</Notice>}
            <DataTable className="withdrawal-table" columns={columns} rows={query.data?.withdrawals ?? (query.isError ? [] : undefined)} rowKey={row => row.id} loading={t('withdrawals.loading')} empty={{ text: t(query.isError ? 'withdrawals.loadFailed' : 'withdrawals.empty') }} />
        </Panel>
    </>;
}
