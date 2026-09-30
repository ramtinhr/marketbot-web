import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import Html from '../components/Html';
import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { fetchJSON, sendJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { escapeHtml } from '../lib/ui';

const INTENT = { 'x-marketbot-intent': 'provider-settings' };

async function send(method: string, path: string, body?: unknown): Promise<any> {
    const { ok, data } = await sendJSON(path, method, body, INTENT);
    if (!ok) throw new Error((data && data.error) || `${method} ${path} failed`);
    return data;
}

interface CreditRow {
    asset: string;
    amount: string;
    unlimited: boolean;
}

type Mutate = (fn: () => Promise<any>, label: string) => Promise<boolean>;

function useProviderTitles(provider: any) {
    const { t, locale } = useI18n();
    const { setTitles } = usePageStatus();
    useEffect(() => {
        if (!provider) return undefined;
        const name = String(provider.name);
        setTitles({
            title: name,
            subtitle: t('providerEdit.subtitle', { code: provider.code }),
            docTitle: t('providerEdit.docTitleNamed', { name }),
        });
        return () => setTitles(null);
    }, [provider, locale, t, setTitles]);
}

export default function ProviderEdit() {
    const { t, format } = useI18n();
    const status = usePageStatus();
    const [searchParams] = useSearchParams();
    const code = searchParams.get('code') || '';

    const [provider, setProvider] = useState<any>(null);
    const [credentialsAvailable, setCredentialsAvailable] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ text: string; kind: string } | null>(null);
    // Bumped on every repaint from the server's copy: the forms remount, so
    // typed values (and any pasted key) are dropped as the old page's
    // innerHTML repaint dropped them.
    const [seq, setSeq] = useState(0);
    const busy = useRef(false);

    useProviderTitles(provider);

    function showProvider(p: any) {
        setProvider(p);
        setLoadError(null);
        setSeq(s => s + 1);
    }

    async function load() {
        if (!code) {
            status.showError(t('providerEdit.noCode'));
            return;
        }
        try {
            const { ok, data } = await fetchJSON(`/providers/settings/${encodeURIComponent(code)}`);
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            setCredentialsAvailable(Boolean(data.credentials_available));
            showProvider(data.provider);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error loading provider:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError((error as Error).message);
            setLoadError((error as Error).message);
        }
    }

    usePolling(load, null, [code]);

    function noteReload(reload: any, prefix: string) {
        if (!reload) { setNotice({ text: t('providerEdit.reload.plain', { prefix }), kind: '' }); return; }
        if (reload.ok) setNotice({ text: t('providerEdit.reload.ok', { prefix }), kind: '' });
        else setNotice({
            text: t('providerEdit.reload.failed', { prefix, error: reload.error || t('providers.noAnswer') }),
            kind: 'red',
        });
    }

    const mutate: Mutate = async (fn, label) => {
        if (busy.current) return false;
        busy.current = true;
        status.hideError();
        try {
            const data = await fn();
            if (data.provider) showProvider(data.provider);
            else setSeq(s => s + 1);
            noteReload(data.reload, label);
            return true;
        } catch (error) {
            status.showError((error as Error).message);
            // The form is repainted from the server's copy either way, so a
            // rejected toggle does not leave the switch showing a state the
            // database never took.
            await load();
            return false;
        } finally {
            busy.current = false;
        }
    };

    const p = provider;
    const hint = p
        ? (p.known ? t('providerEdit.hint', { catalog: p.catalog_name, code: p.code }) : t('providerEdit.hintUnknown', { code: p.code }))
        : '';

    let details;
    if (!code) details = <div className="empty-state">{t('providerEdit.nothingToEdit')}</div>;
    else if (loadError) details = <div className="empty-state">{loadError}</div>;
    else if (!p) details = <div className="skeleton">{t('providerEdit.loading')}</div>;
    else details = <Details key={seq} p={p} mutate={mutate} />;

    return (
        <>
            <div>
                {notice && <div className={`mt-notice ${notice.kind}`}>{notice.text}</div>}
            </div>

            <section className="panel">
                <div className="panel-header">
                    <h2>{p ? p.name : t('providerEdit.heading')}</h2>
                    <span className="panel-hint">{hint}</span>
                </div>
                <div>{details}</div>
            </section>

            <section className="panel" hidden={!p || !p.credentials.length}>
                <div className="panel-header">
                    <h2>{t('providerEdit.credentials.title')}</h2>
                    <span className="panel-hint">{t('providerEdit.credentials.hint')}</span>
                </div>
                <div>
                    {p && p.credentials.length > 0 && (
                        <Credentials key={seq} p={p} credentialsAvailable={credentialsAvailable} mutate={mutate} showError={status.showError} />
                    )}
                </div>
            </section>

            <section className="panel" hidden={!p || !p.known}>
                <div className="panel-header">
                    <h2>{t('providerEdit.credit.title')}</h2>
                    <span className="panel-hint">{t('providerEdit.credit.hint')}</span>
                </div>
                <div>
                    {p && p.known && <Credit p={p} mutate={mutate} />}
                </div>
            </section>

            <section className="panel" hidden={!p || !p.urls.length}>
                <div className="panel-header">
                    <h2>{t('providerEdit.hosts.title')}</h2>
                    <span className="panel-hint">{t('providerEdit.hosts.hint')}</span>
                </div>
                <div>
                    {p && p.urls.length > 0 && <Hosts key={seq} p={p} mutate={mutate} />}
                </div>
            </section>

            <footer className="page-footer">{t('providerEdit.footer')}</footer>
        </>
    );
}

function Details({ p, mutate }: { p: any; mutate: Mutate }) {
    const { t } = useI18n();

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const input = e.currentTarget.querySelector<HTMLInputElement>('#nameInput');
        const name = (input ? input.value : '').trim();
        await mutate(() => send('PATCH', `/providers/settings/${encodeURIComponent(p.code)}`, { name }), t('providerEdit.nameSaved'));
    }

    async function onToggle(e: ChangeEvent<HTMLInputElement>) {
        const box = e.currentTarget;
        const want = box.checked;
        if (!want && !window.confirm(t('providers.confirmDeactivate', { code: p.code }))) {
            box.checked = true;
            return;
        }
        await mutate(
            () => send('POST', `/providers/settings/${encodeURIComponent(p.code)}/${want ? 'activate' : 'deactivate'}`),
            t(want ? 'providerEdit.activated' : 'providerEdit.deactivated'),
        );
    }

    return (
        <form className="mt-form" onSubmit={onSubmit}>
            <div className="mt-row">
                <div className="filter-field mt-grow">
                    <label htmlFor="nameInput">{t('providerEdit.displayName')}</label>
                    <input id="nameInput" type="text" maxLength={100} defaultValue={p.name} />
                </div>
                <button className="btn" type="submit">{t('providerEdit.saveName')}</button>
            </div>
            <div className="switch-row">
                <label className="switch">
                    <input type="checkbox" defaultChecked={Boolean(p.is_active)} disabled={!p.known} onChange={onToggle} />
                    <span className="track" />
                    <span>{t(p.is_active ? 'providerEdit.activeOn' : 'providerEdit.activeOff')}</span>
                </label>
            </div>
            {p.is_active && !p.registered && <div className="mt-sub prov-warn">{t('providerEdit.notLoaded')}</div>}
            <Html as="div" className="mt-sub" k="providerEdit.seeded" vars={{ value: escapeHtml(p.seeded_base_url || '—') }} />
        </form>
    );
}

function SourceLine({ c }: { c: any }) {
    const { t, format } = useI18n();
    if (c.unreadable) return <span className="prov-bad">{t('providerEdit.source.unreadable')}</span>;
    if (c.stored) {
        const live = c.active_source === 'database'
            ? escapeHtml(t('providerEdit.source.liveDatabase'))
            : c.active_source === null
                ? escapeHtml(t('providerEdit.source.liveUnknown'))
                : t('providerEdit.source.liveEnv', { env: escapeHtml(c.env) });
        return <Html k="providerEdit.source.stored" vars={{ mask: escapeHtml(c.mask), length: format.number(c.length), live }} />;
    }
    if (c.active_source === 'environment') return <Html k="providerEdit.source.environment" vars={{ env: escapeHtml(c.env) }} />;
    if (c.active_source === null) return <Html k="providerEdit.source.maybeEnv" vars={{ env: escapeHtml(c.env) }} />;
    return <span className="prov-warn">{t('providerEdit.source.nowhere')}</span>;
}

function Credentials({ p, credentialsAvailable, mutate, showError }: {
    p: any;
    credentialsAvailable: boolean;
    mutate: Mutate;
    showError: (msg: string) => void;
}) {
    const { t } = useI18n();
    const disabled = !credentialsAvailable;

    async function onSubmit(e: FormEvent<HTMLFormElement>, field: string) {
        e.preventDefault();
        const input = e.currentTarget.querySelector('input') as HTMLInputElement;
        const value = input.value;
        if (!value.trim()) { showError(t('providerEdit.credentials.needValue')); return; }
        await mutate(
            () => send('PUT', `/providers/settings/${encodeURIComponent(p.code)}/credentials`, { [field]: value }),
            t('providerEdit.credentials.saved', { field }));
        // Cleared whatever happened: a key left sitting in a form field
        // is a key in the page's DOM and in the browser's memory for as
        // long as the tab is open.
        input.value = '';
    }

    async function onClear(field: string) {
        if (!window.confirm(t('providerEdit.credentials.confirmClear', { field, code: p.code }))) return;
        await mutate(
            () => send('DELETE', `/providers/settings/${encodeURIComponent(p.code)}/credentials/${encodeURIComponent(field)}`),
            t('providerEdit.credentials.cleared', { field }));
    }

    return (
        <>
            {!credentialsAvailable && <Html as="div" className="mt-notice red" k="providerEdit.credentials.blocked" />}
            {p.credentials.map((c: any) => (
                <form className="mt-form prov-field" key={c.field} onSubmit={e => onSubmit(e, c.field)}>
                    <div className="mt-row">
                        <div className="filter-field mt-grow">
                            <label htmlFor={`cred-${c.field}`}>
                                {c.label}{c.hint && <> <span className="mt-label-note">— {c.hint}</span></>}
                            </label>
                            <input id={`cred-${c.field}`} type="password" autoComplete="new-password" spellCheck={false}
                                   placeholder={t(c.stored ? 'providerEdit.credentials.replace' : 'providerEdit.credentials.paste')}
                                   disabled={disabled} />
                        </div>
                        <button className="btn primary" type="submit" disabled={disabled}>{t('common.save')}</button>
                        {c.stored && <button className="btn mt-danger" type="button" onClick={() => onClear(c.field)}>{t('common.clear')}</button>}
                    </div>
                    <div className="mt-sub"><SourceLine c={c} /></div>
                </form>
            ))}
        </>
    );
}

// ---- Credit line ----
//
// What the venue lends beyond the account's own funds. Every balance check
// in the bot (pre-trade, both fill legs, manual orders) counts free + this,
// so an account trading on a loan is not refused for lacking cash it does
// not need. Not a secret - stored in the clear, no CREDENTIALS_KEY needed.
function Credit({ p, mutate }: { p: any; mutate: Mutate }) {
    const { t, format } = useI18n();
    // Null means "follow the server's copy"; the draft follows every keystroke,
    // so adding or removing a row never throws away what was typed in the others.
    const [creditDraft, setCreditDraft] = useState<CreditRow[] | null>(null);
    const draft: CreditRow[] = creditDraft ?? p.credit.map((c: any) => ({
        asset: c.asset,
        amount: c.amount === 'unlimited' ? '' : String(c.amount),
        unlimited: c.amount === 'unlimited',
    }));

    const creditLabel = (c: any) => (c.amount === 'unlimited'
        ? `${c.asset} ${t('providers.credit.unlimited')}`
        : `${c.asset} ${format.number(c.amount)}`);

    const stored = p.credit.map(creditLabel).join(' · ');
    const active = p.active_credit === null
        ? t('providerEdit.credit.liveUnknown')
        : p.active_credit.length
            ? t('providerEdit.credit.live', { lines: p.active_credit.map(creditLabel).join(' · ') })
            : t('providerEdit.credit.liveNone');
    // A line the bot counts that is not stored here came from its .env.
    const fromEnv = p.active_credit && p.active_credit.some((a: any) => !p.credit.some((c: any) => c.asset === a.asset));

    const update = (i: number, patch: Partial<CreditRow>) =>
        setCreditDraft(draft.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const credit: Record<string, string> = {};
        for (const r of draft) {
            const asset = r.asset.trim().toUpperCase();
            if (!asset) continue;
            credit[asset] = r.unlimited ? 'unlimited' : r.amount.trim();
        }
        const body = { credit: Object.keys(credit).length ? credit : null };
        const ok = await mutate(() => send('PUT', `/providers/settings/${encodeURIComponent(p.code)}/credentials`, body),
            t('providerEdit.credit.saved'));
        if (ok) setCreditDraft(null);
    }

    async function onClear() {
        if (!window.confirm(t('providerEdit.credit.confirmClear', { code: p.code }))) return;
        const ok = await mutate(() => send('DELETE', `/providers/settings/${encodeURIComponent(p.code)}/credentials/credit`),
            t('providerEdit.credit.cleared'));
        if (ok) setCreditDraft(null);
    }

    return (
        <form className="mt-form" onSubmit={onSubmit}>
            {draft.length ? draft.map((r, i) => (
                <div className="mt-row credit-row" key={i}>
                    <div className="filter-field">
                        <label htmlFor={`credit-asset-${i}`}>{t('providerEdit.credit.asset')}</label>
                        <input id={`credit-asset-${i}`} type="text" maxLength={12} spellCheck={false}
                               className="credit-asset" value={r.asset} placeholder="IRT"
                               onChange={e => update(i, { asset: e.target.value })} />
                    </div>
                    <div className="filter-field mt-grow">
                        <label htmlFor={`credit-amount-${i}`}>{t('providerEdit.credit.amount')}</label>
                        <input id={`credit-amount-${i}`} type="text" inputMode="decimal" spellCheck={false}
                               value={r.amount} placeholder={t('providerEdit.credit.amountPlaceholder')} disabled={r.unlimited}
                               onChange={e => update(i, { amount: e.target.value })} />
                    </div>
                    <label className="credit-unlimited">
                        <input type="checkbox" checked={r.unlimited} onChange={e => update(i, { unlimited: e.target.checked })} />
                        <span>{t('providers.credit.unlimited')}</span>
                    </label>
                    <button className="btn mt-small" type="button" aria-label={t('providerEdit.credit.remove')}
                            onClick={() => setCreditDraft(draft.filter((_, j) => j !== i))}>✕</button>
                </div>
            )) : <div className="mt-sub">{t('providerEdit.credit.empty')}</div>}
            <div className="mt-row">
                <button className="btn mt-small" type="button"
                        onClick={() => setCreditDraft([...draft, { asset: draft.length ? '' : 'IRT', amount: '', unlimited: false }])}>
                    {t('providerEdit.credit.add')}
                </button>
                <span className="toolbar-spacer" />
                <button className="btn primary" type="submit">{t('common.save')}</button>
                {p.credit.length > 0 && <button className="btn mt-danger" type="button" onClick={onClear}>{t('common.clear')}</button>}
            </div>
            <div className="mt-sub">{stored ? t('providerEdit.credit.stored', { lines: stored }) : t('providerEdit.credit.storedNone')} {active}</div>
            {fromEnv && <div className="mt-sub">{t('providerEdit.credit.fromEnv', { env: `${p.code.toUpperCase()}_CREDIT_<ASSET>` })}</div>}
            <div className="mt-sub">{t('providerEdit.credit.rule')}</div>
        </form>
    );
}

function Hosts({ p, mutate }: { p: any; mutate: Mutate }) {
    const { t } = useI18n();

    async function onSubmit(e: FormEvent<HTMLFormElement>, field: string) {
        e.preventDefault();
        const input = e.currentTarget.querySelector('input') as HTMLInputElement;
        const value = input.value.trim();
        await mutate(
            () => send('PUT', `/providers/settings/${encodeURIComponent(p.code)}/credentials`, { [field]: value || null }),
            t('providerEdit.hosts.saved', { field }));
    }

    async function onReset(field: string) {
        await mutate(
            () => send('DELETE', `/providers/settings/${encodeURIComponent(p.code)}/credentials/${encodeURIComponent(field)}`),
            t('providerEdit.hosts.reset', { field }));
    }

    return (
        <>
            {p.urls.map((u: any) => {
                const def: string = u.default
                    || (u.env ? t('providerEdit.hosts.noDefaultEnv', { env: u.env }) : t('providerEdit.hosts.noDefault'));
                return (
                    <form className="mt-form prov-field" key={u.field} onSubmit={e => onSubmit(e, u.field)}>
                        <div className="mt-row">
                            <div className="filter-field mt-grow">
                                <label htmlFor={`host-${u.field}`}>
                                    {u.label}
                                    {u.required && <> <span className="mt-label-note">{t('providerEdit.hosts.required')}</span></>}
                                    {u.hint && <> <span className="mt-label-note">— {u.hint}</span></>}
                                </label>
                                <input id={`host-${u.field}`} type="url" inputMode="url" spellCheck={false}
                                       defaultValue={u.override || ''} placeholder={def} />
                            </div>
                            <button className="btn primary" type="submit">{t('common.save')}</button>
                            {u.override && !(u.required && !u.default) && (
                                <button className="btn mt-danger" type="button" onClick={() => onReset(u.field)}>{t('providerEdit.hosts.useDefault')}</button>
                            )}
                        </div>
                        <div className="mt-sub">
                            <Html k={u.override ? 'providerEdit.hosts.overridden' : 'providerEdit.hosts.usingDefault'} vars={{ default: escapeHtml(def) }} />
                            {' '}{t('providerEdit.hosts.rule')}
                        </div>
                        {u.active && u.active !== u.effective && (
                            <Html as="div" className="mt-sub prov-warn" k="providerEdit.hosts.liveDiffers" vars={{ active: escapeHtml(u.active) }} />
                        )}
                    </form>
                );
            })}
        </>
    );
}
