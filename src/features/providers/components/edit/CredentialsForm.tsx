import { useState, type FormEvent } from 'react';

import { msg, useI18n } from '../../../../i18n';
import { escapeHtml } from '../../../../shared/lib';
import { usePageStatus } from '../../../../shared/stores/pageStatus';
import { Html } from '../../../../shared/ui';
import { providersApi, type Credential } from '../../api';
import { useFieldLabels } from '../../labels';
import type { Save, SectionProps } from './types';

/** Where the key the bot uses comes from. */
function SourceLine({ c }: { c: Credential }) {
    const { t, format } = useI18n();
    if (c.unreadable) return <span className="prov-bad">{t('providerEdit.source.unreadable')}</span>;
    if (c.stored) {
        const live = c.active_source === 'database'
            ? escapeHtml(t('providerEdit.source.liveDatabase'))
            : c.active_source === null
                ? escapeHtml(t('providerEdit.source.liveUnknown'))
                : t('providerEdit.source.liveEnv', { env: escapeHtml(c.env) });
        return <Html k="providerEdit.source.stored" vars={{ mask: escapeHtml(c.mask ?? ''), length: format.number(c.length ?? 0), live }} />;
    }
    if (c.active_source === 'environment') return <Html k="providerEdit.source.environment" vars={{ env: escapeHtml(c.env) }} />;
    if (c.active_source === null) return <Html k="providerEdit.source.maybeEnv" vars={{ env: escapeHtml(c.env) }} />;
    return <span className="prov-warn">{t('providerEdit.source.nowhere')}</span>;
}

function CredentialField({ code, c, disabled, save }: { code: string; c: Credential; disabled: boolean; save: Save }) {
    const { t } = useI18n();
    const labels = useFieldLabels();
    const { showError } = usePageStatus();
    const [value, setValue] = useState('');
    const label = labels.credential(c);
    const hint = labels.credentialHint(c);

    async function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!value.trim()) { showError(msg('providerEdit.credentials.needValue')); return; }
        await save(() => providersApi.putSettings(code, { [c.field]: value }), msg('providerEdit.credentials.saved', { field: label }));
        // Cleared whatever happened: a key left sitting in a form field is a
        // key in the page's memory for as long as the tab is open.
        setValue('');
    }

    function onClear() {
        if (!window.confirm(t('providerEdit.credentials.confirmClear', { field: label, code }))) return;
        void save(() => providersApi.clearSetting(code, c.field), msg('providerEdit.credentials.cleared', { field: label }));
    }

    const id = `cred-${c.field}`;
    return (
        <form className="mt-form prov-field" onSubmit={onSubmit}>
            <div className="mt-row">
                <div className="filter-field mt-grow">
                    <label htmlFor={id}>
                        {label}
                        {c.required && <> <span className="mt-label-note">{t('providerEdit.credentials.required')}</span></>}
                        {hint && <> <span className="mt-label-note">— {hint}</span></>}
                    </label>
                    <input id={id} type="password" autoComplete="new-password" spellCheck={false} disabled={disabled}
                           placeholder={t(c.stored ? 'providerEdit.credentials.replace' : 'providerEdit.credentials.paste')}
                           value={value} onChange={(e) => setValue(e.target.value)} />
                </div>
                <button className="btn primary" type="submit" disabled={disabled}>{t('common.save')}</button>
                {c.stored && <button className="btn mt-danger" type="button" onClick={onClear}>{t('common.clear')}</button>}
            </div>
            <div className="mt-sub"><SourceLine c={c} /></div>
        </form>
    );
}

/** API keys. Written only when the API holds an encryption key to store them under. */
export function CredentialsForm({ p, save, credentialsAvailable }: SectionProps & { credentialsAvailable: boolean }) {
    return (
        <>
            {!credentialsAvailable && <Html as="div" className="mt-notice red" k="providerEdit.credentials.blocked" />}
            {p.credentials.map((c) => <CredentialField key={c.field} code={p.code} c={c} disabled={!credentialsAvailable} save={save} />)}
        </>
    );
}
