import { useState, type FormEvent } from 'react';

import { useI18n } from '../../../i18n';
import { Field, Panel } from '../../../shared/ui';
import { providersApi, useProviderMutation, type AvailableProvider } from '../api';

/** Adds a venue the bot knows but the table does not list yet. */
export function AddProviderForm({ available, onAdded, onError }: {
    available: AvailableProvider[];
    onAdded: (code: string) => void;
    onError: (error: Error) => void;
}) {
    const { t } = useI18n();
    const [picked, setPicked] = useState('');
    const [name, setName] = useState('');
    const add = useProviderMutation(({ code, name }: { code: string; name: string }) => providersApi.add(code, name));

    // The pick follows the list: a venue just added drops out of it.
    const code = available.some((a) => a.code === picked) ? picked : available[0]?.code ?? '';
    const suggested = available.find((a) => a.code === code);

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (add.isPending) return;
        add.mutate({ code, name: name.trim() }, {
            onSuccess: () => { setName(''); onAdded(code); },
            onError,
        });
    }

    return (
        <Panel title={t('providers.add.title')} hint={t('providers.add.hint')} hidden={available.length === 0}>
            <form className="mt-form" onSubmit={onSubmit}>
                <div className="mt-row">
                    <Field id="addCode" label={t('providers.add.venue')}>
                        <select id="addCode" value={code} onChange={(e) => setPicked(e.target.value)}>
                            {available.map((a) => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
                        </select>
                    </Field>
                    <Field id="addName" label={t('providers.add.name')} className="mt-grow">
                        <input id="addName" type="text" maxLength={100} value={name} onChange={(e) => setName(e.target.value)}
                               placeholder={suggested ? suggested.name : t('providers.add.namePlaceholder')} />
                    </Field>
                    <button className="btn primary" type="submit">{t('providers.add.submit')}</button>
                </div>
                <div className="mt-sub">{t('providers.add.note')}</div>
            </form>
        </Panel>
    );
}
