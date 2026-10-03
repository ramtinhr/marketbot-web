import { useState, type FormEvent } from 'react';

import { msg, useI18n } from '../../../../i18n';
import { escapeHtml } from '../../../../shared/lib';
import { Html } from '../../../../shared/ui';
import { providersApi, type HostUrl } from '../../api';
import { useFieldLabels } from '../../labels';
import type { Save, SectionProps } from './types';

function HostField({ code, u, save }: { code: string; u: HostUrl; save: Save }) {
    const { t } = useI18n();
    const label = useFieldLabels().host(u);
    const [value, setValue] = useState(u.override || '');
    const fallback = u.default || (u.env ? t('providerEdit.hosts.noDefaultEnv', { env: u.env }) : t('providerEdit.hosts.noDefault'));

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        void save(() => providersApi.putSettings(code, { [u.field]: value.trim() || null }), msg('providerEdit.hosts.saved', { field: label }));
    }

    const onReset = () => void save(() => providersApi.clearSetting(code, u.field), msg('providerEdit.hosts.reset', { field: label }));

    const id = `host-${u.field}`;
    return (
        <form className="mt-form prov-field" onSubmit={onSubmit}>
            <div className="mt-row">
                <div className="filter-field mt-grow">
                    <label htmlFor={id}>
                        {label}
                        {u.required && <> <span className="mt-label-note">{t('providerEdit.hosts.required')}</span></>}
                        {u.note && <> <span className="mt-label-note">— {u.note}</span></>}
                    </label>
                    <input id={id} type="url" inputMode="url" spellCheck={false} placeholder={fallback}
                           value={value} onChange={(e) => setValue(e.target.value)} />
                </div>
                <button className="btn primary" type="submit">{t('common.save')}</button>
                {/* A required host with no default cannot fall back to anything. */}
                {u.override && !(u.required && !u.default) && (
                    <button className="btn mt-danger" type="button" onClick={onReset}>{t('providerEdit.hosts.useDefault')}</button>
                )}
            </div>
            <div className="mt-sub">
                <Html k={u.override ? 'providerEdit.hosts.overridden' : 'providerEdit.hosts.usingDefault'} vars={{ default: escapeHtml(fallback) }} />
                {' '}{t('providerEdit.hosts.rule')}
            </div>
            {u.active && u.active !== u.effective && (
                <Html as="div" className="mt-sub prov-warn" k="providerEdit.hosts.liveDiffers" vars={{ active: escapeHtml(u.active) }} />
            )}
        </form>
    );
}

/** Per-venue API host overrides. */
export function HostsForm({ p, save }: SectionProps) {
    return <>{p.urls.map((u) => <HostField key={u.field} code={p.code} u={u} save={save} />)}</>;
}
