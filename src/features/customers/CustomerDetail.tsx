import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from '../../shared/hooks/useLiveQuery';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { request } from '../../shared/api/client';
import { confirmDialog, Notice, Panel } from '../../shared/ui';
import { customerApi, userPath } from './api';
import { ProfileForm, WalletTools, BankAccounts } from './CustomerForms';
import { CustomerHistory } from './CustomerHistory';

export function CustomerDetail({id}:{id:string}) {
    const {t,format} = useI18n();
    const [params] = useSearchParams();
    const back = new URLSearchParams(params); back.delete('id');
    const [tab,setTab] = useState('overview');
    const [notice,setNotice] = useState<{text:string;error:boolean}|null>(null);
    const [busy,setBusy] = useState(false);
    const cache = useQueryClient();
    const detail = useLiveQuery({errorBanner:'none',queryKey:['customer',id],queryFn:({signal})=>customerApi.detail(id,signal)});
    async function run(action:()=>Promise<unknown>) {
        if(busy) return;
        setBusy(true); setNotice(null);
        try { await action(); await Promise.all([cache.invalidateQueries({queryKey:['customer',id]}),cache.invalidateQueries({queryKey:['customers']})]); setNotice({text:t('customers.saved'),error:false}); }
        catch(e) { setNotice({text:(e as Error).message,error:true}); }
        finally { setBusy(false); }
    }
    const u = detail.data?.user;
    const [status,setStatus] = useState('');
    const [reason,setReason] = useState('');
    if(detail.error) return <><Link to={`/customers?${back}`}>{t('customers.back')}</Link><Notice tone="red">{detail.error.message}</Notice><button className="btn" onClick={()=>void detail.refetch()}>{t('customers.retry')}</button></>;
    if(!u || !detail.data) return <Notice>{t('customers.loading')}</Notice>;
    const transitions:Record<string,string[]> = {pending:['active','suspended','closed'],active:['suspended','closed'],suspended:['active','closed'],closed:[]};
    return <div className="customers-workspace">
        <Link className="customer-back" to={`/customers?${back}`}>← {t('customers.back')}</Link>
        <section className="customer-hero">
            <div className="customer-avatar" aria-hidden="true">{u.display_name.slice(0,1)}</div>
            <div className="customer-identity"><h2>{u.display_name} <span className={`customer-status ${u.status}`}>{t(`customers.${u.status}`)}</span></h2><p dir="ltr">@{u.username} · {u.phone || u.email || '—'}</p><small dir="ltr">{u.id}</small></div>
            <div className="customer-hero-meta"><span>{t(u.is_demo?'customers.demo':'customers.real')}</span><strong>{t('customers.kyc')} {u.kyc_level}</strong><small>{t('customers.joined')} {format.date(u.created_at)}</small></div>
            <button className="btn" disabled={busy || detail.isFetching} onClick={()=>void cache.invalidateQueries({queryKey:['customer',id]})}>{t('customers.refresh')}</button>
        </section>
        {notice && <Notice tone={notice.error?'red':'green'}>{notice.text}</Notice>}
        <nav className="customer-tabs" aria-label={t('customers.sections')}>{['overview','wallets','banks','activity','audit'].map(s=><button key={s} className={tab===s?'active':''} aria-current={tab===s?'page':undefined} onClick={()=>{setTab(s);setNotice(null);}}>{t(`customers.${s}`)}</button>)}</nav>
        {tab==='overview' && <div className="customer-detail-grid">
            <Panel title={t('customers.profile')} hint={t('customers.profileHint')}><ProfileForm key={u.updated_at} user={u} busy={busy} run={run}/></Panel>
            <div><Panel title={t('customers.accountControl')}>
                <dl className="customer-facts"><dt>{t('customers.createdBy')}</dt><dd>{u.created_by || '—'}</dd><dt>{t('customers.updated')}</dt><dd>{format.dateTime(u.updated_at)}</dd><dt>{t('customers.statusReason')}</dt><dd>{u.status_reason || '—'}</dd></dl>
                {u.status==='closed'?<Notice>{t('customers.closedHint')}</Notice>:<form className="customer-form" onSubmit={async e=>{
                    e.preventDefault();
                    const next=status || transitions[u.status][0];
                    if(await confirmDialog({title:t('customers.changeStatus'),message:`${u.display_name} → ${t(`customers.${next}`)}. ${t(next==='suspended'?'customers.suspendHint':next==='closed'?'customers.closeHint':'customers.activateHint')}`,confirmLabel:t('customers.confirm'),tone:next==='active'?'default':'danger'})) void run(async()=>{await request(`${userPath(id)}/status`,{method:'POST',body:{status:next,reason}});setReason('');setStatus('');});
                }}><label>{t('customers.changeStatus')}<select value={status || transitions[u.status][0]} disabled={busy} onChange={e=>setStatus(e.target.value)}>{transitions[u.status].map(s=><option key={s} value={s}>{t(`customers.${s}`)}</option>)}</select></label><label>{t('customers.reason')}<textarea value={reason} required maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button className="btn" disabled={busy}>{t('customers.reviewChange')}</button></form>}
            </Panel><Notice>{t('customers.integrityHint')}</Notice></div>
        </div>}
        {tab==='wallets' && <WalletTools id={id} user={u} wallets={detail.data.wallets} busy={busy} run={run}/>}
        {tab==='banks' && <BankAccounts id={id} closed={u.status==='closed'} busy={busy} run={run}/>}
        {tab==='activity' && <CustomerHistory key="activity" id={id}/>}
        {tab==='audit' && <CustomerHistory key="audit" id={id} audit/>}
    </div>;
}
