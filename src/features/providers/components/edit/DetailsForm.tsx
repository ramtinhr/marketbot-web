import { useState, type FormEvent } from 'react';

import { msg, useI18n } from '../../../../i18n';
import { escapeHtml } from '../../../../shared/lib';
import { Field, Html } from '../../../../shared/ui';
import { providersApi } from '../../api';
import type { SectionProps } from './types';

/** Display name and the active switch. */
export function DetailsForm({ p, save }: SectionProps) {
    const { t } = useI18n();
    const [name, setName] = useState(p.name);
    // Follows the click at once; the page remounts this form from the
    // server's copy after every write, so a refused toggle springs back.
    const [active, setActive] = useState(p.is_active);

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        void save(() => providersApi.rename(p.code, name.trim()), msg('providerEdit.nameSaved'));
    }

    function onToggle(want: boolean) {
        if (!want && !window.confirm(t('providers.confirmDeactivate', { code: p.code }))) return;
        setActive(want);
        void save(() => providersApi.setActive(p.code, want), msg(want ? 'providerEdit.activated' : 'providerEdit.deactivated'));
    }

    return (
        <form className="mt-form" onSubmit={onSubmit}>
            <div className="mt-row">
                <Field id="nameInput" label={t('providerEdit.displayName')} className="mt-grow">
                    <input id="nameInput" type="text" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <button className="btn" type="submit">{t('providerEdit.saveName')}</button>
            </div>
            <div className="switch-row">
                <label className="switch">
                    <input type="checkbox" checked={active} disabled={!p.known} onChange={(e) => onToggle(e.target.checked)} />
                    <span className="track" />
                    <span>{t(p.is_active ? 'providerEdit.activeOn' : 'providerEdit.activeOff')}</span>
                </label>
            </div>
            {p.is_active && !p.registered && <div className="mt-sub prov-warn">{t('providerEdit.notLoaded')}</div>}
            <Html as="div" className="mt-sub" k="providerEdit.seeded" vars={{ value: escapeHtml(p.seeded_base_url || '—') }} />
        </form>
    );
}
