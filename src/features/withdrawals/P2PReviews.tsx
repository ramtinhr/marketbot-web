import { useState } from 'react';
import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';
import { confirmDialog, Notice, Panel } from '../../shared/ui';
interface Payment {
    id: string; amount: string; payer_id: string; receiver_id: string; description: string;
    receipt: string; receipt_reference: string; status: string; revision: string; review_reason: string | null;
}
export function P2PReviews() {
    const [status, setStatus] = useState('admin_review');
    const [reasons, setReasons] = useState<Record<string,string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const query = useLiveQuery({ queryKey: ['p2p-reviews', status], queryFn: ({signal}) => request<{payments: Payment[]}>('/p2p/payments',{params:{status},signal}), errorBanner:'message' });
    async function review(p: Payment, decision: 'settled' | 'rejected') {
        if (busy) return;
        setBusy(true); setError('');
        try {
            if (!await confirmDialog({title: 'بررسی پرداخت همتا به همتا', tone:'warning', message: decision === 'settled' ? 'واریز بانکی بررسی شده است؟ مبلغ مسدودشده به ولت پرداخت‌کننده منتقل خواهد شد.' : 'پرداخت رد و موجودی مسدودشده به درخواست‌کننده برگردانده شود؟', confirmLabel:'تأیید تصمیم'})) return;
            await request(`/p2p/payments/${encodeURIComponent(p.id)}/review`, {method:'POST',headers:{'x-marketbot-intent':'p2p-review'},body:{decision,reason:reasons[p.id],revision:p.revision}});
            await query.refetch();
        } catch(e) { setError((e as Error).message); }
        finally { setBusy(false); }
    }
    return <Panel title="بررسی همتا به همتا" hint="فیش‌های تأییدنشده پس از ۳۰ دقیقه و موارد اختلاف" count={query.data?.payments.length ?? 0}>
        <div className="filters"><label>وضعیت <select value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}>
            <option value="admin_review">نیازمند بررسی ادمین</option><option value="awaiting_confirmation">در انتظار دریافت‌کننده</option><option value="settled">تسویه‌شده</option><option value="rejected">ردشده</option>
        </select></label><button className="btn" disabled={busy} onClick={()=>void query.refetch()}>بازخوانی</button></div>
        {(error || query.isError) && <Notice tone="red">{error || query.error?.message}</Notice>}
        {query.data?.payments.map(p=><article key={p.id} className="ab-quote" dir="rtl" style={{padding:16,borderBottom:'1px solid var(--border)'}}>
            <strong>{Number(p.amount).toLocaleString('fa-IR')} تومان</strong>
            <p dir="ltr">{p.id}</p><p>پرداخت‌کننده: <span dir="ltr">{p.payer_id}</span></p><p>دریافت‌کننده: <span dir="ltr">{p.receiver_id}</span></p>
            <p>{p.description}</p><p>شماره پیگیری: {p.receipt_reference}</p>
            <details><summary>مشاهده فیش</summary><a href={p.receipt} target="_blank" rel="noreferrer"><img src={p.receipt} alt="فیش واریز" style={{maxWidth:'100%',maxHeight:400}} /></a></details>
            {p.review_reason && <p>{p.review_reason}</p>}
            {p.status==='admin_review' && <fieldset disabled={busy} style={{border:0,padding:0}}>
                <label>دلیل تصمیم<input maxLength={1000} value={reasons[p.id] || ''} onChange={e=>setReasons({...reasons,[p.id]:e.target.value})} /></label>
                <div className="mt-row"><button className="btn primary" disabled={!reasons[p.id]?.trim()} onClick={()=>void review(p,'settled')}>تأیید و شارژ ولت پرداخت‌کننده</button>
                <button className="btn mt-danger" disabled={!reasons[p.id]?.trim()} onClick={()=>void review(p,'rejected')}>رد و بازگشت موجودی درخواست‌کننده</button></div>
            </fieldset>}
        </article>)}
    </Panel>;
}
