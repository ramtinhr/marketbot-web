import { useEffect, useState } from 'react';
import { useLiveQuery } from '../../shared/hooks/useLiveQuery';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { DataTable, Notice, Panel } from '../../shared/ui';
import { customerApi } from './api';
import { CustomerDetail } from './CustomerDetail';
import './customers.css';

export default function CustomersPage() {
    const {t,format} = useI18n();
    const [params,setParams] = useSearchParams();
    const id = params.get('id');
    const [search,setSearch] = useState(params.get('q') || '');
    const q = params.get('q') || '';
    const status = params.get('status') || '';
    const demo = params.get('demo') || 'false';
    const offset = Math.max(0, Number(params.get('offset')) || 0);
    function filter(key:string,value:string) { setParams(p => { p.set(key,value); p.delete('offset'); return p; },{replace:true}); }
    useEffect(() => { const timer = setTimeout(() => { if(search!==q) filter('q',search); },350); return () => clearTimeout(timer); },[search,q]);
    const list = useLiveQuery({errorBanner:'none',queryKey:['customers',q,status,demo,offset],queryFn:({signal}) => customerApi.list(q,status,demo,offset,signal),enabled:!id});
    if(id) return <CustomerDetail key={id} id={id} />;
    return <div className="customers-workspace">
        <Panel title={t('customers.directory')} count={list.data?.total} hint={t('customers.directoryHint')}>
            <div className="customer-toolbar">
                <label className="customer-search">{t('customers.search')}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('customers.searchHint')} /></label>
                <label>{t('customers.status')}<select value={status} onChange={e=>filter('status',e.target.value)}><option value="">{t('customers.all')}</option>{['pending','active','suspended','closed'].map(s=><option key={s} value={s}>{t(`customers.${s}`)}</option>)}</select></label>
                <label>{t('customers.accountType')}<select value={demo} onChange={e=>filter('demo',e.target.value)}><option value="false">{t('customers.real')}</option><option value="true">{t('customers.demo')}</option></select></label>
                <button type="button" className="btn" disabled={list.isFetching} onClick={()=>void list.refetch()}>{t('customers.refresh')}</button>
            </div>
            {list.error && <Notice tone="red">{list.error.message}</Notice>}
            <DataTable rows={list.data?.users} rowKey={u=>u.id} loading={t('customers.loading')} empty={{text:t('customers.empty')}} columns={[
                {key:'name',header:t('customers.customer'),cell:u=><Link className="customer-name" to={`/customers?${new URLSearchParams({...Object.fromEntries(params),id:u.id})}`}><strong>{u.display_name}</strong><small dir="ltr">@{u.username}</small></Link>},
                {key:'phone',header:t('customers.phone'),cell:u=><span dir="ltr">{u.phone || '—'}</span>},
                {key:'status',header:t('customers.status'),cell:u=><span className={`customer-status ${u.status}`}>{t(`customers.${u.status}`)}</span>},
                {key:'kyc',header:t('customers.kyc'),cell:u=>u.kyc_level},
                {key:'created',header:t('customers.joined'),cell:u=>format.date(u.created_at)},
                {key:'open',header:'',cell:u=><Link className="btn" to={`/customers?${new URLSearchParams({...Object.fromEntries(params),id:u.id})}`}>{t('customers.view')}</Link>},
            ]}/>
            <div className="customer-pagination"><span>{offset+1}–{offset+(list.data?.users.length||0)} / {list.data?.total ?? '—'}</span><button className="btn" disabled={!offset || list.isFetching} onClick={()=>setParams(p=>{p.set('offset',String(Math.max(0,offset-25)));return p;})}>{t('customers.previous')}</button><button className="btn" disabled={!list.data || offset+25>=list.data.total || list.isFetching} onClick={()=>setParams(p=>{p.set('offset',String(offset+25));return p;})}>{t('customers.next')}</button></div>
        </Panel>
    </div>;
}
