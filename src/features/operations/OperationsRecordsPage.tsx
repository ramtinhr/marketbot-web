import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { request } from '../../shared/api';
import { DataTable, Notice, Panel } from '../../shared/ui';
import '../customers/customers.css';

type Row = Record<string, string | null>;
const columns: Record<string, string[]> = {
    'bank-accounts': ['created_at', 'user_id', 'label', 'holder_name', 'iban'],
    deposits: ['created_at', 'user_id', 'asset', 'network', 'amount', 'status', 'tx_id'],
    payments: ['created_at', 'user_id', 'provider', 'amount', 'status', 'provider_ref'],
    ledger: ['created_at', 'user_id', 'asset', 'kind', 'amount', 'available_after', 'actor', 'reason'],
    auctions: ['created_at', 'user_id', 'symbol', 'side', 'price', 'quantity', 'filled_quantity', 'status'],
};
export default function OperationsRecordsPage({ resource }: { resource: string }) {
    const { t, format } = useI18n();
    const [draft, setDraft] = useState({ user_id: '', status: '', asset: '' });
    const [filters, setFilters] = useState(draft);
    const [offset, setOffset] = useState(0);
    const query = useQuery({
        queryKey: ['operations', resource, filters, offset],
        queryFn: ({ signal }) => request<{ records: Row[]; next_offset: number | null }>(`/records/${resource}`, { params: { ...filters, offset, limit: 50 }, signal }),
    });
    const fields = resource === 'bank-accounts' ? ['user_id'] : resource === 'payments' ? ['user_id', 'status'] : ['user_id', 'status', 'asset'];
    return <Panel title={t(`ops.${resource}`)} hint={t('ops.readOnly')}>
        <form className="customer-toolbar" onSubmit={e => { e.preventDefault(); setFilters({ ...draft }); setOffset(0); }}>
            {fields.map(key => <label key={key}>{t(key === 'user_id' ? 'ops.user' : key === 'status' ? 'ops.status' : 'ops.asset')}
                <input value={draft[key as keyof typeof draft]} maxLength={128} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
            </label>)}
            <button className="btn primary" type="submit">{t('common.apply')}</button>
            <button className="btn" type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>{t('common.refresh')}</button>
        </form>
        {query.error ? <Notice tone="red">{query.error.message}</Notice> : <DataTable rows={query.data?.records} rowKey={r => String(r.id)} loading={t('customers.loading')} empty={{ text: t('ops.empty') }} columns={[
            ...columns[resource].map(key => ({ key, header: t(`ops.field.${key}`), cell: (r: Row) => <bdi>{key.endsWith('_at') ? format.dateTime(r[key] || '') : r[key] ?? '—'}</bdi> })),
            { key: 'customer', header: '', cell: (r: Row) => r.user_id && <Link className="btn" to={`/customers?id=${encodeURIComponent(r.user_id)}`}>{t('ops.openCustomer')}</Link> },
        ]} />}
        <div className="customer-pagination">
            <button className="btn" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - 50))}>{t('customers.previous')}</button>
            <button className="btn" disabled={query.data?.next_offset == null || query.isFetching || query.isError} onClick={() => setOffset(query.data!.next_offset!)}>{t('customers.next')}</button>
        </div>
    </Panel>;
}
