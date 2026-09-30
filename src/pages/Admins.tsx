import { useState, type FormEvent } from 'react';

import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { fetchJSON, sendJSON } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePolling } from '../lib/hooks';

const PASSWORD_MIN = 12;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

interface AdminRow {
    id: number;
    username: string;
    created_at: string;
    created_by: string | null;
    last_login_at: string | null;
    active_sessions: number;
}

async function send(method: string, path: string, body?: unknown): Promise<any> {
    const { ok, data } = await sendJSON(path, method, body);
    if (!ok) throw new Error((data && data.error) || `${method} ${path} failed`);
    return data;
}

/** 20 characters from an alphabet without look-alikes: about 115 bits. */
function generatePassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_!@#%';
    const bytes = crypto.getRandomValues(new Uint32Array(20));
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function passwordError(t: ReturnType<typeof useI18n>['t'], password: string, confirm: string): string | null {
    if (password.length < PASSWORD_MIN) return t('admins.error.passwordShort', { min: PASSWORD_MIN });
    if (password !== confirm) return t('admins.error.mismatch');
    return null;
}

export default function Admins() {
    const { t, format } = useI18n();
    const status = usePageStatus();
    const { admin: me } = useAuth();

    const [admins, setAdmins] = useState<AdminRow[]>([]);
    const [loaded, setLoaded] = useState(false);
    // Kept as a function so a translated notice follows a language switch.
    const [notice, setNotice] = useState<{ text: () => string; red?: boolean } | null>(null);

    async function load() {
        try {
            const { ok, data } = await fetchJSON<{ admins: AdminRow[]; error?: string }>('/admins');
            if (!ok) throw new Error(data.error || t('error.requestFailed'));
            setAdmins(data.admins);
            setLoaded(true);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            status.setStatus(false, t('status.connectionLost'));
            status.showError((error as Error).message);
        }
    }
    // Not polled: the page holds password forms, and the list only changes when
    // someone acts on it.
    usePolling(load, null);

    const [resetFor, setResetFor] = useState<AdminRow | null>(null);

    async function remove(row: AdminRow) {
        if (!window.confirm(t('admins.confirmRemove', { username: row.username }))) return;
        try {
            await send('DELETE', `/admins/${row.id}`);
            if (resetFor?.id === row.id) setResetFor(null);
            setNotice({ text: () => t('admins.removed', { username: row.username }) });
            await load();
        } catch (error) {
            const message = (error as Error).message;
            setNotice({ text: () => message, red: true });
        }
    }

    const when = (iso: string | null) => (iso ? format.dateTime(iso) : t('admins.never'));

    return (
        <>
            {notice && <div className={`mt-notice${notice.red ? ' red' : ' green'}`} role="status">{notice.text()}</div>}

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('admins.panel.title')}</span> <span className="count">{admins.length}</span></h2>
                    <span className="panel-hint">{t('admins.panel.hint')}</span>
                </div>
                {!loaded ? (
                    <div className="skeleton">{t('status.loading')}</div>
                ) : (
                    <div className="table-scroll">
                        <table className="data-table admins-table">
                            <thead>
                                <tr>
                                    <th>{t('admins.col.username')}</th>
                                    <th>{t('admins.col.lastLogin')}</th>
                                    <th>{t('admins.col.sessions')}</th>
                                    <th>{t('admins.col.created')}</th>
                                    <th>{t('admins.col.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {admins.map((row) => {
                                    const self = row.id === me?.id;
                                    return (
                                        <tr key={row.id}>
                                            <td>
                                                <div className="admins-user">
                                                    <span className="admins-avatar" aria-hidden="true">{row.username.slice(0, 1).toUpperCase()}</span>
                                                    <span className="admins-name">{row.username}</span>
                                                    {self && <span className="status-badge simulated">{t('admins.you')}</span>}
                                                </div>
                                            </td>
                                            <td className="muted">{when(row.last_login_at)}</td>
                                            <td>{row.active_sessions > 0
                                                ? <span className="status-badge online">{format.number(row.active_sessions)}</span>
                                                : <span className="muted">—</span>}</td>
                                            <td className="muted">
                                                {format.dateTime(row.created_at)}
                                                {row.created_by && <div className="admins-by">{t('admins.createdBy', { username: row.created_by })}</div>}
                                            </td>
                                            <td className="mt-actions">
                                                {!self && (
                                                    <>
                                                        <button className="btn mt-small" type="button" onClick={() => { setResetFor(row); setNotice(null); }}>
                                                            {t('admins.resetPassword')}
                                                        </button>
                                                        {' '}
                                                        <button className="btn mt-small mt-danger" type="button" onClick={() => void remove(row)}>
                                                            {t('admins.remove')}
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {resetFor && (
                <ResetPassword key={resetFor.id} row={resetFor} onDone={(text) => { setResetFor(null); setNotice({ text }); void load(); }}
                               onCancel={() => setResetFor(null)} />
            )}

            <div className="admins-grid">
                <AddAdmin onAdded={(text) => { setNotice({ text }); void load(); }} />
                <ChangeOwnPassword onChanged={(text) => { setNotice({ text }); void load(); }} />
            </div>

            <footer className="page-footer">{t('admins.footer')}</footer>
        </>
    );
}

/** Password and confirmation, with a generator that shows what it made so it can be handed over. */
function PasswordPair({ idPrefix, password, confirm, setPassword, setConfirm, generator, newLabel }: {
    idPrefix: string; password: string; confirm: string;
    setPassword: (v: string) => void; setConfirm: (v: string) => void;
    generator?: boolean; newLabel?: string;
}) {
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);
    return (
        <>
            <div className="filter-field">
                <label htmlFor={`${idPrefix}-password`}>{newLabel || t('admins.password')}</label>
                <div className="admins-password">
                    <input id={`${idPrefix}-password`} type={visible ? 'text' : 'password'} autoComplete="new-password" dir="ltr"
                           minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)} />
                    <button type="button" className="btn mt-small" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
                        {t(visible ? 'login.hidePassword' : 'login.showPassword')}
                    </button>
                    {generator && (
                        <button type="button" className="btn mt-small" onClick={() => {
                            const p = generatePassword();
                            setPassword(p);
                            setConfirm(p);
                            setVisible(true);
                        }}>{t('admins.generate')}</button>
                    )}
                </div>
                <span className="mt-sub">{t('admins.passwordRule', { min: PASSWORD_MIN })}</span>
            </div>
            <div className="filter-field">
                <label htmlFor={`${idPrefix}-confirm`}>{t('admins.confirmPassword')}</label>
                <input id={`${idPrefix}-confirm`} type={visible ? 'text' : 'password'} autoComplete="new-password" dir="ltr"
                       value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
        </>
    );
}

function AddAdmin({ onAdded }: { onAdded: (text: () => string) => void }) {
    const { t } = useI18n();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const name = username.trim().toLowerCase();
        const problem = !USERNAME_RE.test(name) ? t('admins.error.username') : passwordError(t, password, confirm);
        if (problem) return setError(problem);
        setBusy(true);
        setError(null);
        try {
            await send('POST', '/admins', { username: name, password });
            setUsername('');
            setPassword('');
            setConfirm('');
            onAdded(() => t('admins.added', { username: name }));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="panel">
            <div className="panel-header">
                <h2>{t('admins.add.title')}</h2>
                <span className="panel-hint">{t('admins.add.hint')}</span>
            </div>
            <form className="mt-form admins-form" onSubmit={onSubmit} noValidate autoComplete="off">
                <div className="filter-field">
                    <label htmlFor="add-username">{t('admins.username')}</label>
                    <input id="add-username" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr"
                           maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} />
                    <span className="mt-sub">{t('admins.usernameRule')}</span>
                </div>
                <PasswordPair idPrefix="add" password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm} generator />
                {error && <div className="mt-notice red" role="alert">{error}</div>}
                <div><button className="btn primary" type="submit" disabled={busy}>{t('admins.add.submit')}</button></div>
            </form>
        </section>
    );
}

function ResetPassword({ row, onDone, onCancel }: { row: AdminRow; onDone: (text: () => string) => void; onCancel: () => void }) {
    const { t } = useI18n();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const problem = passwordError(t, password, confirm);
        if (problem) return setError(problem);
        setBusy(true);
        setError(null);
        try {
            await send('POST', `/admins/${row.id}/password`, { password });
            onDone(() => t('admins.reset.done', { username: row.username }));
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    }

    return (
        <section className="panel">
            <div className="panel-header">
                <h2>{t('admins.reset.title', { username: row.username })}</h2>
                <span className="panel-hint">{t('admins.reset.hint')}</span>
            </div>
            <form className="mt-form admins-form" onSubmit={onSubmit} noValidate autoComplete="off">
                <PasswordPair idPrefix="reset" password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm}
                              generator newLabel={t('admins.newPassword')} />
                {error && <div className="mt-notice red" role="alert">{error}</div>}
                <div className="mt-row">
                    <button className="btn primary" type="submit" disabled={busy}>{t('admins.reset.submit')}</button>
                    <button className="btn" type="button" onClick={onCancel}>{t('common.cancel')}</button>
                </div>
            </form>
        </section>
    );
}

function ChangeOwnPassword({ onChanged }: { onChanged: (text: () => string) => void }) {
    const { t } = useI18n();
    const [current, setCurrent] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const problem = !current ? t('admins.error.current') : passwordError(t, password, confirm);
        if (problem) return setError(problem);
        setBusy(true);
        setError(null);
        try {
            await send('POST', '/auth/password', { current_password: current, new_password: password });
            setCurrent('');
            setPassword('');
            setConfirm('');
            onChanged(() => t('admins.own.done'));
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="panel">
            <div className="panel-header">
                <h2>{t('admins.own.title')}</h2>
                <span className="panel-hint">{t('admins.own.hint')}</span>
            </div>
            <form className="mt-form admins-form" onSubmit={onSubmit} noValidate>
                <div className="filter-field">
                    <label htmlFor="own-current">{t('admins.currentPassword')}</label>
                    <input id="own-current" type="password" autoComplete="current-password" dir="ltr"
                           value={current} onChange={(e) => setCurrent(e.target.value)} />
                </div>
                <PasswordPair idPrefix="own" password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm}
                              newLabel={t('admins.newPassword')} />
                {error && <div className="mt-notice red" role="alert">{error}</div>}
                <div><button className="btn primary" type="submit" disabled={busy}>{t('admins.own.submit')}</button></div>
            </form>
        </section>
    );
}
