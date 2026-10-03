import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { msg, rawMsg, renderMessage, useI18n, type Message } from '../../i18n';
import { EyeIcon, EyeOffIcon, LanguageToggle, ThemeToggle } from '../../shared/ui';
import { safeNext } from './RequireAuth';
import { useAuthStore, type LoginResult } from './store';

function failureMessage(result: Extract<LoginResult, { ok: false }>): Message {
    switch (result.reason) {
        case 'invalid': return msg('login.error.invalid');
        case 'throttled': return msg('login.error.throttled', { minutes: Math.max(1, Math.ceil((result.retryAfter || 60) / 60)) });
        case 'unreachable': return msg('login.error.unreachable');
        default: return result.message ? rawMsg(result.message) : msg('error.requestFailed');
    }
}

export default function LoginPage() {
    const { t, locale } = useI18n();
    const session = useAuthStore((s) => s.session);
    const login = useAuthStore((s) => s.login);
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = safeNext(params.get('next'));

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<Message | null>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    useEffect(() => { document.title = t('login.docTitle'); }, [t, locale]);

    if (session.status === 'signedIn') return <Navigate to={next} replace />;

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy) return;
        if (!username.trim() || !password) {
            setError(msg('login.error.required'));
            return;
        }
        setBusy(true);
        setError(null);
        const result = await login(username.trim(), password);
        setBusy(false);
        if (result.ok) {
            navigate(next, { replace: true });
            return;
        }
        // Clear only the password: retyping a username is not what went wrong.
        setPassword('');
        passwordRef.current?.focus();
        setError(failureMessage(result));
    }

    const expired = params.get('expired') === '1' && !error;

    return (
        <div className="auth-page">
            <main className="auth-card">
                <div className="auth-brand">
                    <div className="brand-mark" aria-hidden="true">M</div>
                    <div>
                        <div className="auth-brand-name">MarketBot</div>
                        <div className="auth-brand-sub">{t('login.brandSub')}</div>
                    </div>
                </div>

                <h1 className="auth-title">{t('login.title')}</h1>
                <p className="auth-subtitle">{t('login.subtitle')}</p>

                {expired && <div className="auth-alert info" role="status">{t('login.expired')}</div>}
                {error && <div className="auth-alert" role="alert">{renderMessage(error)}</div>}

                <form className="auth-form" onSubmit={onSubmit} noValidate>
                    <div className="auth-field">
                        <label htmlFor="login-username">{t('login.username')}</label>
                        <input id="login-username" name="username" type="text" autoComplete="username"
                               autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus dir="ltr"
                               value={username} onChange={(e) => setUsername(e.target.value)}
                               aria-invalid={error ? true : undefined} disabled={busy} />
                    </div>
                    <div className="auth-field">
                        <label htmlFor="login-password">{t('login.password')}</label>
                        <RevealablePassword inputRef={passwordRef} value={password} onChange={setPassword}
                                            invalid={!!error} disabled={busy} />
                    </div>

                    <button type="submit" className="auth-submit" disabled={busy}>
                        {busy && <span className="auth-spinner" aria-hidden="true" />}
                        {t(busy ? 'login.submitting' : 'login.submit')}
                    </button>
                </form>

                <p className="auth-help">{t('login.forgot')}</p>
            </main>

            <footer className="auth-footer">
                <span>{t('login.notice')}</span>
                <div className="auth-prefs">
                    <LanguageToggle />
                    <ThemeToggle icons={false} />
                </div>
            </footer>
        </div>
    );
}

/** The password box with its show/hide eye and a Caps Lock warning. */
function RevealablePassword({ inputRef, value, onChange, invalid, disabled }: {
    inputRef: RefObject<HTMLInputElement | null>;
    value: string;
    onChange: (v: string) => void;
    invalid: boolean;
    disabled: boolean;
}) {
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));
    const label = t(visible ? 'login.hidePassword' : 'login.showPassword');

    return (
        <>
            <div className="auth-password">
                <input id="login-password" name="password" ref={inputRef}
                       type={visible ? 'text' : 'password'} autoComplete="current-password" dir="ltr"
                       value={value} onChange={(e) => onChange(e.target.value)}
                       onKeyDown={trackCaps} onKeyUp={trackCaps}
                       aria-invalid={invalid || undefined} aria-describedby={capsLock ? 'login-caps' : undefined}
                       disabled={disabled} />
                <button type="button" className="auth-reveal" onClick={() => setVisible((v) => !v)}
                        aria-label={label} aria-pressed={visible} title={label}>
                    {visible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            </div>
            {capsLock && <div id="login-caps" className="auth-hint warn">{t('login.capsLock')}</div>}
        </>
    );
}
