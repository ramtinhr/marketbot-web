import { Fragment, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import Html from '../components/Html';
import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { fetchJSON, sendJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { escapeHtml, providerColor, registerProviders } from '../lib/ui';

const INTENT = { 'x-marketbot-intent': 'provider-settings' };

async function send(method: string, path: string, body?: unknown): Promise<any> {
    const { ok, data } = await sendJSON(path, method, body, INTENT);
    if (!ok) throw new Error((data && data.error) || `${method} ${path} failed`);
    return data;
}

interface State {
    providers: any[];
    available: any[];
    credentialsAvailable: boolean;
    botPublishing: boolean;
}

export default function Providers() {
    const { t, plural, format } = useI18n();
    const status = usePageStatus();

    // Deliberately not polled. Every other page in this dashboard refreshes on a
    // timer, but this one holds a form an operator is typing into, and a list
    // that repaints under a half-clicked toggle is how the wrong venue gets
    // switched off. It reloads when a change is made, and not otherwise.
    const [state, setState] = useState<State>({ providers: [], available: [], credentialsAvailable: false, botPublishing: false });
    const [loaded, setLoaded] = useState(false);
    const [notes, setNotes] = useState<Array<() => ReactNode>>([]);
    const [addCode, setAddCode] = useState('');
    const [addName, setAddName] = useState('');
    const busy = useRef(false);

    async function load() {
        try {
            const { ok, data } = await fetchJSON('/providers/settings');
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            const next: State = {
                providers: data.providers || [],
                available: data.available_codes || [],
                credentialsAvailable: Boolean(data.credentials_available),
                botPublishing: Boolean(data.bot_publishing),
            };
            registerProviders(next.providers.map(p => p.code));
            setState(next);
            setLoaded(true);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error loading providers:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError((error as Error).message);
        }
    }

    usePolling(load, null);

    const prependNote = (note: () => ReactNode) => setNotes(prev => [note, ...prev]);

    // A change is only half done when it is written: the bot builds its registry
    // from this table once, at startup, so until it re-reads the table an
    // "active" row is not a trading venue. Whether that reload landed is the
    // thing an operator needs told, so it is said in full rather than implied.
    function noteReload(reload: any) {
        if (!reload) return;
        if (reload.ok) {
            prependNote(() => {
                const detail = typeof reload.registered === 'number'
                    ? plural('providers.reloadedCount', reload.registered)
                    : '';
                return <div className="mt-notice green">{t('providers.reloaded', { detail })}</div>;
            });
        } else {
            prependNote(() => (
                <div className="mt-notice red">{t('providers.reloadFailed', { error: reload.error || t('providers.noAnswer') })}</div>
            ));
        }
    }

    // Deactivating is how a venue is taken out of trading, and there is no undo
    // beyond switching it back - but it is also the thing an operator reaches
    // for when a venue is misbehaving at 3am, so it asks once and does it.
    async function toggle(code: string, activate: boolean) {
        if (busy.current) return;
        if (!activate && !window.confirm(t('providers.confirmDeactivate', { code }))) return;
        busy.current = true;
        status.hideError();
        setNotes([]);
        try {
            const data = await send('POST', `/providers/settings/${encodeURIComponent(code)}/${activate ? 'activate' : 'deactivate'}`);
            await load();
            noteReload(data.reload);
        } catch (error) {
            status.showError((error as Error).message);
        } finally {
            busy.current = false;
        }
    }

    async function reloadBot() {
        if (busy.current) return;
        busy.current = true;
        setNotes([]);
        try {
            const data = await send('POST', '/providers/settings/reload');
            await load();
            noteReload(data.reload);
        } catch (error) {
            status.showError((error as Error).message);
        } finally {
            busy.current = false;
        }
    }

    const selectedCode = state.available.some(a => a.code === addCode)
        ? addCode
        : (state.available[0] ? state.available[0].code : '');
    const suggested = state.available.find(a => a.code === selectedCode);

    async function onAdd(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy.current) return;
        busy.current = true;
        status.hideError();
        setNotes([]);
        const code = selectedCode;
        const name = addName.trim();
        try {
            await send('POST', '/providers/settings', name ? { code, name } : { code });
            setAddName('');
            await load();
            prependNote(() => (
                <Html as="div" className="mt-notice" k="providers.add.done"
                      vars={{ code: escapeHtml(code), encoded: encodeURIComponent(code) }} />
            ));
        } catch (error) {
            status.showError((error as Error).message);
        } finally {
            busy.current = false;
        }
    }

    return (
        <>
            <div>
                {notes.map((note, i) => <NoteSlot key={`${notes.length - i}`} render={note} />)}
                {loaded && !state.credentialsAvailable && (
                    <Html as="div" className="mt-notice red" k="providers.noCredentialsKey" />
                )}
                {loaded && !state.botPublishing && (
                    <div className="mt-notice">{t('providers.notPublishing')}</div>
                )}
            </div>

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('providers.panel.title')}</span> <span className="count">{state.providers.length}</span></h2>
                    <span className="panel-hint">{t('providers.panel.hint')}</span>
                </div>
                <div>
                    {!loaded ? (
                        <div className="skeleton">{t('providers.loading')}</div>
                    ) : !state.providers.length ? (
                        <div className="empty-state"><span className="big">🔌</span><Html k="providers.empty" /></div>
                    ) : (
                        <>
                            <div className="table-scroll">
                                <table className="data-table prov-table">
                                    <thead>
                                        <tr>
                                            <th>{t('common.provider')}</th>
                                            <th>{t('common.status')}</th>
                                            <th>{t('providers.col.credentials')}</th>
                                            <th>{t('providers.col.hosts')}</th>
                                            <th>{t('providers.col.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {state.providers.map(p => (
                                            <tr key={p.code}>
                                                <td>
                                                    <div className="provider-name"><span className="provider-dot" style={{ background: providerColor(p.code) }} />{p.name}</div>
                                                    <div className="prov-code">{p.code}</div>
                                                </td>
                                                <td><StatusCell p={p} botPublishing={state.botPublishing} /></td>
                                                <td><CredentialCell p={p} /></td>
                                                <td><HostCell p={p} /></td>
                                                <td className="mt-actions">
                                                    <Link className="btn mt-small" to={`/provider-edit?code=${encodeURIComponent(p.code)}`}>{t('common.edit')}</Link>
                                                    {' '}
                                                    <button className={`btn mt-small ${p.is_active ? 'mt-danger' : 'primary'}`}
                                                            onClick={() => toggle(p.code, !p.is_active)}>
                                                        {t(p.is_active ? 'providers.deactivate' : 'providers.activate')}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-row prov-reload">
                                <button className="btn mt-small" onClick={reloadBot}>{t('providers.reload')}</button>
                                <span className="mt-sub">{t('providers.reloadHint')}</span>
                            </div>
                        </>
                    )}
                </div>
            </section>

            <section className="panel" hidden={state.available.length === 0}>
                <div className="panel-header">
                    <h2>{t('providers.add.title')}</h2>
                    <span className="panel-hint">{t('providers.add.hint')}</span>
                </div>
                <form className="mt-form" onSubmit={onAdd}>
                    <div className="mt-row">
                        <div className="filter-field">
                            <label htmlFor="addCode">{t('providers.add.venue')}</label>
                            <select id="addCode" value={selectedCode} onChange={e => setAddCode(e.target.value)}>
                                {state.available.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
                            </select>
                        </div>
                        <div className="filter-field mt-grow">
                            <label htmlFor="addName">{t('providers.add.name')}</label>
                            <input id="addName" type="text" maxLength={100} value={addName} onChange={e => setAddName(e.target.value)}
                                   placeholder={suggested ? suggested.name : t('providers.add.namePlaceholder')} />
                        </div>
                        <button className="btn primary" type="submit">{t('providers.add.submit')}</button>
                    </div>
                    <div className="mt-sub">{t('providers.add.note')}</div>
                </form>
            </section>

            <footer className="page-footer">{t('providers.footer')}</footer>
        </>
    );
}

function NoteSlot({ render }: { render: () => ReactNode }) {
    useI18n();
    return <>{render()}</>;
}

function CredentialCell({ p }: { p: any }) {
    const { t } = useI18n();
    if (!p.credentials.length) return <span className="muted">{t('common.none')}</span>;
    return (
        <>
            {p.credentials.map((c: any, i: number) => {
                const sep = i > 0 ? ' ' : null;
                if (c.unreadable) return <Fragment key={c.field ?? i}>{sep}<span className="status-badge failed" title={t('providers.cred.unreadable')}>{c.label} ⚠</span></Fragment>;
                if (c.stored) return <Fragment key={c.field ?? i}>{sep}<span className="status-badge ok" title={t('providers.cred.stored')}>{c.label}</span></Fragment>;
                // The bot falls back to its own .env, so "not stored here" is not
                // "the bot has no key" - and saying so wrongly sends someone
                // pasting a key that was never missing.
                if (c.active_source === 'environment') {
                    return <Fragment key={c.field ?? i}>{sep}<span className="status-badge simulated" title={t('providers.cred.fromEnv', { env: c.env })}>{t('providers.cred.envBadge', { label: c.label })}</span></Fragment>;
                }
                return <Fragment key={c.field ?? i}>{sep}<span className={`status-badge ${p.is_active ? 'pending' : ''}`} title={t('providers.cred.missing')}>{t('providers.cred.missingBadge', { label: c.label })}</span></Fragment>;
            })}
        </>
    );
}

function HostCell({ p }: { p: any }) {
    const { t } = useI18n();
    if (!p.urls.length) return <span className="muted">—</span>;
    return (
        <div className="prov-hosts">
            {p.urls.map((u: any, i: number) => {
                const overridden = Boolean(u.override);
                const title = overridden
                    ? t('providers.host.override', { default: u.default || t('providers.host.unset') })
                    : t('providers.host.default');
                return (
                    <div className="mt-small" title={title} key={u.field ?? i}>
                        <span className="muted">{u.label}</span> <span className="prov-mono">{u.effective || '—'}</span>
                        {overridden && <> <span className="status-badge simulated">{t('providers.host.overrideBadge')}</span></>}
                    </div>
                );
            })}
        </div>
    );
}

function StatusCell({ p, botPublishing }: { p: any; botPublishing: boolean }) {
    const { t, format } = useI18n();
    const bits: ReactNode[] = [
        <span key="state" className={`status-badge ${p.is_active ? 'online' : 'offline'}`}>{t(p.is_active ? 'providers.state.active' : 'providers.state.inactive')}</span>,
    ];
    // Active in the table and absent from the bot's registry is the state
    // worth shouting about: it means the bot has not re-read the table, or
    // it skipped the row.
    if (p.is_active && botPublishing && !p.registered) {
        bits.push(<span key="notLoaded" className="status-badge stale" title={t('providers.state.notLoadedHint')}>{t('providers.state.notLoaded')}</span>);
    }
    if (p.circuit_state) {
        const cls = String(p.circuit_state).toLowerCase().replace('-', '');
        bits.push(<span key="circuit" className={`status-badge ${cls}`} title={t('providers.state.circuitHint')}>{p.circuit_state}</span>);
    }
    // What the bot is counting when it says; what is stored here otherwise.
    const credit = (p.active_credit && p.active_credit.length) ? p.active_credit : p.credit;
    if (credit && credit.length) {
        const lines = credit.map((c: any) => `${c.asset} ${c.amount === 'unlimited' ? t('providers.credit.unlimited') : format.number(c.amount)}`).join(' · ');
        bits.push(<span key="credit" className="status-badge simulated" title={t('providers.credit.hint')}>{t('providers.credit.badge', { lines })}</span>);
    }
    if (!p.known) bits.push(<span key="unknown" className="status-badge failed" title={t('providers.state.unknownCodeHint')}>{t('providers.state.unknownCode')}</span>);
    if (p.known && !p.registrable) bits.push(<span key="needsHost" className="status-badge stale" title={t('providers.state.needsHostHint')}>{t('providers.state.needsHost')}</span>);
    return <>{bits.map((b, i) => <Fragment key={i}>{i > 0 && ' '}{b}</Fragment>)}</>;
}
