import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { request } from '../../shared/api/client';
import { DataTable, Notice, Panel } from '../../shared/ui';
import { userPath, type RecordRow } from './api';

const sources=['ledger','orders','trades','payments','deposits','withdrawals','p2p','offers','bank_withdrawals','rial_trades'];
const text=(v:unknown):string=>v===null || v===undefined?'—':typeof v==='object'?JSON.stringify(v):String(v);
export function CustomerHistory({id,audit=false}:{id:string;audit?:boolean}) {
    const {t,format}=useI18n();
    const [type,setType]=useState(audit?'audit':'ledger');
    const [pages,setPages]=useState<number[]>([0]);
    const [asset,setAsset]=useState('');
    const [kind,setKind]=useState('');
    const [selected,setSelected]=useState<RecordRow|null>(null);
    const page=pages[pages.length-1];
    const ledger=type==='ledger';
    const query=useQuery({queryKey:['customer',id,'history',type,page,asset,kind],queryFn:({signal})=>ledger?
        request<{entries:RecordRow[];next_before:number|null}>(`${userPath(id)}/entries`,{params:{before:page||undefined,asset,kind,limit:50},signal}).then(r=>({records:r.entries,next:r.next_before})):
        request<{records:RecordRow[];next_offset:number|null}>(`${userPath(id)}/history`,{params:{type,offset:page,limit:50},signal}).then(r=>({records:r.records,next:r.next_offset}))});
    function reset() {setPages([0]);setSelected(null);}
    const columns=type==='audit'?['created_at','action','actor']:ledger?['created_at','kind','asset','amount','available_after','actor','reason']:type==='orders'?['created_at','symbol','side','quantity','price','status']:type==='trades'?['executed_at','symbol','quantity','price']:['created_at',...(type==='offers'?['side','method']:type==='payments'?['provider']:['p2p','rial_trades'].includes(type)?[]:['asset','network']),'amount','status'];
    const before=selected?.before_record as RecordRow | undefined;
    const after=selected?.after_record as RecordRow | undefined;
    const changed=Array.from(new Set([...Object.keys(before || {}),...Object.keys(after || {})])).filter(k=>text(before?.[k])!==text(after?.[k]));
    return <><Panel title={t(audit?'customers.audit':'customers.activity')} hint={t(audit?'customers.auditHint':'customers.activityHint')}>
        <div className="customer-toolbar">{!audit && <label>{t('customers.activityType')}<select value={type} onChange={e=>{setType(e.target.value);reset();}}>{sources.map(s=><option key={s} value={s}>{t(`customers.${s}`)}</option>)}</select></label>}
            {ledger && <><label>{t('customers.asset')}<input value={asset} maxLength={15} placeholder={t('customers.all')} onChange={e=>{setAsset(e.target.value.toUpperCase());reset();}}/></label><label>{t('customers.kind')}<select value={kind} onChange={e=>{setKind(e.target.value);reset();}}><option value="">{t('customers.all')}</option>{['opening','credit','debit','freeze','unfreeze','lock','unlock','trade'].map(k=><option key={k} value={k}>{t(`customers.${k}`)}</option>)}</select></label></>}
            <button className="btn" disabled={query.isFetching} onClick={()=>void query.refetch()}>{t('customers.refresh')}</button>
            {(type==='withdrawals'||type==='p2p'||type==='bank_withdrawals') && <Link className="btn" to="/withdrawals">{t('customers.openReviews')}</Link>}
        </div>
        {query.error?<Notice tone="red">{query.error.message}</Notice>:<DataTable rows={query.data?.records} rowKey={r=>text(r.id)} loading={t('customers.loading')} empty={{text:t('customers.noActivity')}} columns={[...columns.map(key=>({key,header:t(`customers.${key}`),cell:(r:RecordRow)=><span className={['reason','actor'].includes(key)?'customer-wrap':undefined}>{key.endsWith('_at')?format.dateTime(String(r[key])):<bdi>{text(r[key])}</bdi>}</span>})),{key:'details',header:'',cell:(r:RecordRow)=><button className="btn" onClick={()=>setSelected(r)}>{t('customers.details')}</button>}]}/>}
        <div className="customer-pagination"><span>{t('customers.page')} {pages.length}</span><button className="btn" disabled={pages.length===1 || query.isFetching} onClick={()=>{setPages(p=>p.slice(0,-1));setSelected(null);}}>{t('customers.previous')}</button><button className="btn" disabled={query.data?.next==null || query.isFetching} onClick={()=>{const next=query.data?.next;if(next!=null) setPages(p=>[...p,next]);setSelected(null);}}>{t('customers.next')}</button></div>
    </Panel>{selected && <Panel title={t('customers.recordDetails')} actions={<button className="btn" onClick={()=>setSelected(null)}>{t('customers.close')}</button>}>
        <dl className="customer-record">{Object.entries(selected).filter(([k])=>!['before_record','after_record'].includes(k)).map(([key,value])=><div key={key}><dt>{t(`customers.${key}`)===`customers.${key}`?key.replaceAll('_',' '):t(`customers.${key}`)}</dt><dd><bdi>{text(value)}</bdi></dd></div>)}</dl>
        {type==='audit' && <div className="table-scroll"><table className="data-table"><thead><tr><th>{t('customers.field')}</th><th>{t('customers.before')}</th><th>{t('customers.after')}</th></tr></thead><tbody>{changed.map(k=><tr key={k}><td>{k.replaceAll('_',' ')}</td><td className="customer-wrap"><bdi>{text(before?.[k])}</bdi></td><td className="customer-wrap"><bdi>{text(after?.[k])}</bdi></td></tr>)}</tbody></table></div>}
    </Panel>}</>;
}
