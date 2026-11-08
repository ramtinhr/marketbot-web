import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../i18n';
import { request } from '../../shared/api/client';
import { confirmDialog, DataTable, Notice, Panel } from '../../shared/ui';
import { customerApi, userPath, type Customer, type Wallet, type Bank } from './api';

type Actions = {busy:boolean; run:(action:()=>Promise<unknown>)=>Promise<void>};
const profileFields = ['display_name','first_name','last_name','email','phone','national_id','birth_date','note'] as const;
export function ProfileForm({user,busy,run}:Actions & {user:Customer}) {
    const {t}=useI18n();
    const [values,setValues]=useState(()=>Object.fromEntries(profileFields.map(f=>[f,user[f] || ''])));
    const [kyc,setKyc]=useState(user.kyc_level);
    const changes:Record<string,string|number|null>=Object.fromEntries(profileFields.filter(f=>values[f] !== (user[f] || '')).map(f=>[f,values[f] || null]));
    if(kyc!==user.kyc_level) changes.kyc_level=kyc;
    async function save(e:FormEvent) {
        e.preventDefault();
        if(await confirmDialog({title:t('customers.saveProfile'),message:<><p>{user.display_name}</p>{Object.entries(changes).map(([key,value])=><p key={key}>{t(`customers.${key}`)}: <bdi>{String(user[key as keyof Customer] ?? '—')}</bdi> → <bdi>{String(value ?? '—')}</bdi></p>)}</>,confirmLabel:t('customers.confirm')})) await run(()=>request(userPath(user.id),{method:'PATCH',body:changes}));
    }
    return <form className="customer-form" onSubmit={save}><fieldset disabled={busy || user.status==='closed'} className="customer-field-grid">{profileFields.map(f=><label key={f} className={f==='note'?'customer-span':''}>{t(`customers.${f}`)}{f==='note'?<textarea value={values[f]} maxLength={2000} onChange={e=>setValues({...values,[f]:e.target.value})}/>:<input type={f==='email'?'email':f==='birth_date'?'date':'text'} dir={['phone','national_id','email'].includes(f)?'ltr':undefined} required={f==='display_name'} maxLength={f==='email'?254:f==='phone'||f==='national_id'?32:100} value={values[f]} onChange={e=>setValues({...values,[f]:e.target.value})}/>}</label>)}<label>{t('customers.kyc')}<select value={kyc} onChange={e=>setKyc(Number(e.target.value))}>{[0,1,2,3].map(n=><option key={n}>{n}</option>)}</select></label><div className="customer-span"><button className="btn primary" disabled={!Object.keys(changes).length}>{t(busy?'customers.saving':'customers.saveProfile')}</button></div></fieldset></form>;
}

export function WalletTools({id,user,wallets,busy,run}:Actions & {id:string;user:Customer;wallets:Wallet[]}) {
    const {t}=useI18n();
    const [asset,setAsset]=useState(wallets[0]?.asset || 'IRT');
    const [kind,setKind]=useState('credit');
    const [amount,setAmount]=useState('');
    const [reason,setReason]=useState('');
    const [reference,setReference]=useState('');
    const [reservation,setReservation]=useState('');
    const holds=useQuery({queryKey:['customer',id,'reservations',asset],queryFn:({signal})=>request<{reservations:{id:string;purpose:string;remaining_amount:string}[]}>(`${userPath(id)}/wallets/${encodeURIComponent(asset)}/reservations`,{signal}),enabled:kind==='unfreeze' && !!asset});
    const ownHolds=holds.data?.reservations.filter(h=>h.purpose==='admin_hold' && /[1-9]/.test(h.remaining_amount));
    async function move(e:FormEvent) {
        e.preventDefault();
        if(await confirmDialog({title:t(`customers.${kind}`),tone:'warning',confirmLabel:t('customers.confirmMovement'),message:<><p><strong>{user.display_name}</strong> · <bdi>{user.phone}</bdi></p><p>{t(`customers.${kind}`)}: <strong dir="ltr">{amount} {asset}</strong></p><p>{t('customers.reason')}: {reason}</p><p>{t('customers.moneyHint')}</p></>})) await run(async()=>{await customerApi.move(id,asset,kind,{amount,reason,reference_type:'adjustment',...(reference?{reference_id:reference}:{}),...(kind==='unfreeze'?{reservation_id:reservation}:{})});setAmount('');setReason('');setReference('');setReservation('');});
    }
    return <><Panel title={t('customers.wallets')} hint={t('customers.walletHint')}><DataTable rows={wallets} rowKey={w=>w.asset} loading="" empty={{text:t('customers.noWallets')}} columns={['asset','available','frozen','locked','total','status'].map(key=>({key,header:t(`customers.${key}`),cell:(w:Wallet)=><bdi>{key==='status'?t(`customers.${w.status}`):w[key as keyof Wallet]}</bdi>}))}/></Panel>
        <div className="customer-detail-grid"><Panel title={t('customers.adjustBalance')} hint={t('customers.adjustHint')}><form className="customer-form" onSubmit={move}><fieldset disabled={busy || user.status==='closed'} className="customer-field-grid"><label>{t('customers.operation')}<select value={kind} onChange={e=>{setKind(e.target.value);setReservation('');}}>{['credit','debit','freeze','unfreeze'].map(k=><option key={k} value={k}>{t(`customers.${k}`)}</option>)}</select></label><label>{t('customers.asset')}<input required pattern="[A-Z0-9]{2,15}" maxLength={15} value={asset} onChange={e=>{setAsset(e.target.value.toUpperCase());setReservation('');}} list="customer-assets"/><datalist id="customer-assets">{wallets.map(w=><option key={w.asset}>{w.asset}</option>)}</datalist></label><label>{t('customers.amount')}<input required inputMode="decimal" dir="ltr" pattern="[0-9]+(\.[0-9]{1,8})?" value={amount} onChange={e=>setAmount(e.target.value)} /></label><label>{t('customers.reference')}<input maxLength={128} value={reference} onChange={e=>setReference(e.target.value)}/></label>{kind==='unfreeze' && <label className="customer-span">{t('customers.reservation')}<select required value={reservation} onChange={e=>setReservation(e.target.value)}><option value="">{t('customers.chooseHold')}</option>{ownHolds?.map(h=><option key={h.id} value={h.id}>{h.remaining_amount} {asset} · {h.id}</option>)}</select>{holds.error && <Notice tone="red">{holds.error.message}</Notice>}</label>}<label className="customer-span">{t('customers.reason')}<textarea required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="customer-span"><button className="btn primary" disabled={!/[1-9]/.test(amount) || (kind==='unfreeze'&&!reservation)}>{t(busy?'customers.saving':'customers.reviewMovement')}</button></div></fieldset></form></Panel><div><Notice>{t('customers.moneyHint')}</Notice><Notice>{t('customers.holdsHint')}</Notice></div></div>
    </>;
}

export function BankAccounts({id,closed,busy,run}:Actions & {id:string;closed:boolean}) {
    const {t}=useI18n();
    const banks=useQuery({queryKey:['customer',id,'banks'],queryFn:({signal})=>customerApi.banks(id,signal)});
    const [editing,setEditing]=useState<Bank|null>(null);
    const [values,setValues]=useState({label:'',holder_name:'',iban:''});
    function edit(bank:Bank) {setEditing(bank);setValues({label:bank.label,holder_name:bank.holder_name,iban:bank.iban});}
    return <><Panel title={t('customers.banks')} hint={t('customers.bankHint')}>
        {banks.error && <Notice tone="red">{banks.error.message}</Notice>}
        <DataTable rows={banks.data?.accounts} rowKey={b=>b.id} loading={t('customers.loading')} empty={{text:t('customers.noBanks')}} columns={[
            {key:'label',header:t('customers.bankLabel'),cell:b=>b.label}, {key:'holder',header:t('customers.holder'),cell:b=>b.holder_name}, {key:'iban',header:t('customers.iban'),cell:b=><bdi className="customer-mono">{b.iban}</bdi>},
            {key:'actions',header:'',cell:b=><div className="customer-actions"><button className="btn" disabled={busy || closed} onClick={()=>edit(b)}>{t('customers.edit')}</button><button className="btn" disabled={busy || closed} onClick={async()=>{if(await confirmDialog({title:t('customers.archiveBank'),message:`${b.holder_name} · ${b.iban}`,tone:'danger',confirmLabel:t('customers.archive')})) void run(()=>request(`${userPath(id)}/bank-accounts/${b.id}`,{method:'DELETE'}));}}>{t('customers.archive')}</button></div>},
        ]}/></Panel><Panel title={t(editing?'customers.editBank':'customers.addBank')}><form className="customer-form" onSubmit={async e=>{e.preventDefault();if(await confirmDialog({title:t(editing?'customers.editBank':'customers.addBank'),message:`${values.holder_name} · ${values.iban}`,confirmLabel:t('customers.confirm')})) void run(async()=>{await request(`${userPath(id)}/bank-accounts${editing?`/${editing.id}`:''}`,{method:editing?'PATCH':'POST',body:values});setValues({label:'',holder_name:'',iban:''});setEditing(null);});}}><fieldset disabled={busy || closed} className="customer-field-grid">{(['label','holder_name','iban'] as const).map(f=><label key={f}>{t(`customers.${f==='label'?'bankLabel':f==='holder_name'?'holder':'iban'}`)}<input required maxLength={f==='label'?80:f==='holder_name'?120:40} dir={f==='iban'?'ltr':undefined} value={values[f]} onChange={e=>setValues({...values,[f]:e.target.value})}/></label>)}<div className="customer-span customer-actions"><button className="btn primary">{t(busy?'customers.saving':'customers.save')}</button>{editing && <button type="button" className="btn" onClick={()=>{setEditing(null);setValues({label:'',holder_name:'',iban:''});}}>{t('customers.cancel')}</button>}</div></fieldset></form></Panel></>;
}
