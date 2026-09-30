import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { useI18n } from '../i18n';
import { safeNext, useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

export default function Login() {
    const { t, locale, available, setLocale } = useI18n();
    const { theme, setTheme } = useTheme();
    const { state, login } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = safeNext(params.get('next'));

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const [busy, setBusy] = useState(false);
    // A key rather than text, so the message follows a language switch.
    const [error, setError] = useState<{ key: string; vars?: Record<string, number> } | { text: string } | null>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    useEffect(() => { document.title = t('login.docTitle'); }, [t, locale]);

    if (state.status === 'signedIn') return <Navigate to={next} replace />;

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy) return;
        if (!username.trim() || !password) {
            setError({ key: 'login.error.required' });
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
        if (result.reason === 'invalid') setError({ key: 'login.error.invalid' });
        else if (result.reason === 'throttled') {
            setError({ key: 'login.error.throttled', vars: { minutes: Math.max(1, Math.ceil((result.retryAfter || 60) / 60)) } });
        } else if (result.reason === 'unreachable') setError({ key: 'login.error.unreachable' });
        else setError(result.message ? { text: result.message } : { key: 'error.requestFailed' });
    }
    const errorText = !error ? null : 'text' in error ? error.text : t(error.key, error.vars);

    const trackCaps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState('CapsLock'));
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
                {errorText && <div className="auth-alert" role="alert">{errorText}</div>}

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
                        <div className="auth-password">
                            <input id="login-password" name="password" ref={passwordRef}
                                   type={showPassword ? 'text' : 'password'} autoComplete="current-password" dir="ltr"
                                   value={password} onChange={(e) => setPassword(e.target.value)}
                                   onKeyDown={trackCaps} onKeyUp={trackCaps}
                                   aria-invalid={error ? true : undefined} aria-describedby={capsLock ? 'login-caps' : undefined}
                                   disabled={busy} />
                            <button type="button" className="auth-reveal" onClick={() => setShowPassword((v) => !v)}
                                    aria-label={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
                                    aria-pressed={showPassword} title={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}>
                                {showPassword ? (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                )}
                            </button>
                        </div>
                        {capsLock && <div id="login-caps" className="auth-hint warn">{t('login.capsLock')}</div>}
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
                    {available().length >= 2 && (
                        <div className="lang-toggle" role="group" aria-label={t('shell.languageLabel')}>
                            {available().map((lang) => (
                                <button key={lang.code} type="button" lang={lang.code} dir={lang.dir}
                                        className={lang.code === locale ? 'active' : ''} onClick={() => setLocale(lang.code)}>{lang.name}</button>
                            ))}
                        </div>
                    )}
                    <div className="theme-toggle" role="group" aria-label={t('shell.themeLabel')}>
                        <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>{t('shell.theme.dark')}</button>
                        <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>{t('shell.theme.light')}</button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
