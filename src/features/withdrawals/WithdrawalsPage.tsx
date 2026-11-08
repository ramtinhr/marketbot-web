import { P2PReviews } from './P2PReviews';
import { CryptoWithdrawals } from './CryptoWithdrawals';
import { useRef, useState, type FormEvent } from 'react';
import { msg, renderMessage, useI18n, type Message } from '../../i18n';
import { useListControls } from '../../shared/hooks';
import { confirmDialog, DataTable, Field, Notice, Pagination, Panel, SelectField, type Column } from '../../shared/ui';
import { STATUSES, useReviewWithdrawal, useWithdrawals, type ReviewAction, type ReviewBody, type Withdrawal } from './api';

interface Selection { row: Withdrawal; action: ReviewAction }

function ReviewForm({ selection: { row, action }, networks, onClose, onDone }: {
    selection: Selection;
    networks: Record<string, string[]>;
    onClose: () => void;
    onDone: (message: Message) => void;
}) {
    const { t } = useI18n();
    const mutation = useReviewWithdrawal();
    const [amount, setAmount] = useState(row.amount);
    const [destination, setDestination] = useState(row.destination);
    const [network, setNetwork] = useState(row.network ?? '');
    const [beneficiary, setBeneficiary] = useState(row.beneficiary_name ?? '');
    const [note, setNote] = useState(row.note ?? '');
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const submitting = useRef(false);
    const edit = action === 'edit';
    async function submit(e: FormEvent) {
        e.preventDefault();
        if (submitting.current) return;
        if (!reason.trim()) { setError(t('withdrawals.reasonRequired')); return; }
        if (edit && (!/^\d{1,15}(\.\d{1,8})?$/.test(amount) || !/[1-9]/.test(amount) || (row.asset === 'IRT' && !/^\d+$/.test(amount)))) {
            setError(t('withdrawals.invalidAmount')); return;
        }
        submitting.current = true;
        setBusy(true);
        setError(null);
        try {
            if (!await confirmDialog({
                tone: action === 'reject' ? 'danger' : 'warning',
                title: t(`withdrawals.action.${action}`),
                message: <><p>{t(`withdrawals.explain.${action}`)}</p><p dir="ltr">{edit ? amount : row.amount} {row.asset} · {edit ? destination : row.destination}</p></>,
                confirmLabel: t(`withdrawals.action.${action}`),
            })) return;
            const body: ReviewBody = { revision: row.revision, reason: reason.trim() };
            if (edit) Object.assign(body, { amount, destination: destination.trim(), network, beneficiary_name: beneficiary.trim(), note: note.trim() });
            await mutation.mutateAsync({ row, action, body });
            onDone(msg('withdrawals.saved'));
        } catch (err) { setError((err as Error).message); }
        finally { submitting.current = false; setBusy(false); }
    }
    return (
        <Panel title={t(`withdrawals.action.${action}`)} hint={row.id}>
            <form className="mt-form admins-form" onSubmit={submit}>
                <p>{t(`withdrawals.explain.${action}`)}</p>
                <fieldset disabled={busy} className="withdrawal-fields">
                    {edit ? <>
                        <Field id="wd-amount" label={`${t('common.amount')} (${row.asset})`}>
                            <input id="wd-amount" dir="ltr" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} />
                        </Field>
                        {row.asset !== 'IRT' && <SelectField id="wd-network" label={t('withdrawals.network')} value={network}
                            options={(networks[row.asset] ?? [network]).map(value => ({ value, label: value }))} onChange={setNetwork} />}
                        <Field id="wd-destination" label={t('withdrawals.destination')}>
                            <input id="wd-destination" dir="ltr" required maxLength={128} value={destination} onChange={e => setDestination(e.target.value)} />
                        </Field>
                        <Field id="wd-beneficiary" label={t('withdrawals.beneficiary')}>
                            <input id="wd-beneficiary" required={row.asset === 'IRT'} maxLength={120} value={beneficiary} onChange={e => setBeneficiary(e.target.value)} />
                        </Field>
                        <Field id="wd-note" label={t('withdrawals.note')}>
                            <input id="wd-note" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
                        </Field>
                    </> : <div className="withdrawal-details">
                        <strong dir="ltr">{row.amount} {row.asset} · {row.network ?? 'IRT'}</strong>
                        <div dir="ltr">{row.destination}</div>
                        {row.beneficiary_name && <div>{row.beneficiary_name}</div>}
                    </div>}
                    <Field id="wd-reason" label={t(action === 'paid' ? 'withdrawals.paymentReference' : 'withdrawals.reason')}>
                        <input id="wd-reason" autoFocus required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
                    </Field>
                    <div className="mt-row">
                        <button className="btn primary" type="submit">{t(`withdrawals.action.${action}`)}</button>
                        <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
                    </div>
                </fieldset>
                {error && <Notice tone="red">{error}</Notice>}
            </form>
        </Panel>
    );
}

export default function WithdrawalsPage() {
    const { t, format } = useI18n();
    const list = useListControls(() => ({ status: 'pending', q: '' }));
    const query = useWithdrawals(list.applied.status, list.applied.q, list.view.page);
    const [selection, setSelection] = useState<Selection | null>(null);
    const [notice, setNotice] = useState<Message | null>(null);
    const choose = (row: Withdrawal, action: ReviewAction) => { setNotice(null); setSelection({ row, action }); };
    const columns: Column<Withdrawal>[] = [
        { key: 'created', header: t('withdrawals.created'), cell: row => <>{format.dateTime(row.created_at)}<div className="prov-code" dir="ltr">{row.id}</div></> },
        { key: 'user', header: t('withdrawals.user'), cell: row => <><span dir="ltr">{row.user_id}</span><div className="prov-code" dir="ltr">{row.exchange_user_id}</div></> },
        { key: 'amount', header: t('common.amount'), cell: row => <span dir="ltr">{row.amount} {row.asset}</span> },
        { key: 'destination', header: t('withdrawals.destination'), className: 'withdrawal-destination', cell: row => <><div dir="ltr">{row.destination}</div><div className="mt-sub">{row.network ?? t('withdrawals.bank')} · {row.beneficiary_name}</div></> },
        { key: 'status', header: t('common.status'), cell: row => <span className={`status-badge ${row.status === 'paid' ? 'completed' : row.status === 'rejected' ? 'failed' : row.status === 'processing' ? 'simulated' : row.status}`}>{t(`withdrawals.status.${row.status}`)}</span> },
        { key: 'note', header: t('withdrawals.note'), className: 'wrap', cell: row => row.note || '—' },
        { key: 'actions', header: t('withdrawals.actions'), cell: row => <div className="mt-row">
            {row.status === 'pending' && <>
                <button className="btn mt-small primary" disabled={!!selection || query.isFetching || query.isError} onClick={() => choose(row, 'approve')}>{t('withdrawals.action.approve')}</button>
                <button className="btn mt-small" disabled={!!selection || query.isFetching || query.isError} onClick={() => choose(row, 'edit')}>{t('common.edit')}</button>
            </>}
            {row.status === 'processing' && <button className="btn mt-small primary" disabled={!!selection || query.isFetching || query.isError} onClick={() => choose(row, 'paid')}>{t('withdrawals.action.paid')}</button>}
            {['pending', 'processing'].includes(row.status) && <button className="btn mt-small mt-danger" disabled={!!selection || query.isFetching || query.isError} onClick={() => choose(row, 'reject')}>{t('withdrawals.action.reject')}</button>}
        </div> },
    ];
    return <>
        <P2PReviews />
            <CryptoWithdrawals />
        {notice && <Notice tone="green">{renderMessage(notice)}</Notice>}
        {selection && <ReviewForm key={`${selection.row.id}:${selection.action}`} selection={selection} networks={query.data?.networks ?? {}}
            onClose={() => setSelection(null)} onDone={message => { setSelection(null); setNotice(message); list.setPage(1); }} />}
        <Panel title={t('withdrawals.title')} count={query.data?.total ?? 0} hint={t('withdrawals.hint')}>
            <div className="filters">
                <SelectField id="wd-status" label={t('common.status')} value={list.draft.status} onChange={v => list.setFilter('status', v)}
                    options={[{ value: '', label: t('common.all') }, ...STATUSES.map(value => ({ value, label: t(`withdrawals.status.${value}`) }))]} />
                <Field id="wd-search" label={t('withdrawals.search')}>
                    <input id="wd-search" maxLength={128} value={list.draft.q} onChange={e => list.setFilter('q', e.target.value)} onKeyDown={list.applyOnEnter} />
                </Field>
                <button className="btn primary" disabled={!!selection} onClick={() => list.apply()}>{t('common.apply')}</button>
                <button className="btn" disabled={!!selection || query.isFetching} onClick={() => void query.refetch()}>{t('common.refresh')}</button>
            </div>
            {query.isError && <Notice tone="red">{query.error.message}</Notice>}
            <DataTable className="withdrawal-table" columns={columns} rows={query.data?.withdrawals ?? (query.isError ? [] : undefined)} rowKey={row => row.id}
                loading={t('withdrawals.loading')} empty={{ text: t(query.isError ? 'withdrawals.loadFailed' : 'withdrawals.empty') }} />
            {query.data && !selection && <Pagination data={query.data} onPage={list.setPage} />}
        </Panel>
    </>;
}
