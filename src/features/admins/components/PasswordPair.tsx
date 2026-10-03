import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { generatePassword, PASSWORD_MIN } from '../validation';

export interface PasswordPairValue { password: string; confirm: string }

export const EMPTY_PAIR: PasswordPairValue = { password: '', confirm: '' };

/** Password and confirmation, with a generator that shows what it made so it can be handed over. */
export function PasswordPair({ idPrefix, value, onChange, generator, label }: {
    idPrefix: string;
    value: PasswordPairValue;
    onChange: (value: PasswordPairValue) => void;
    generator?: boolean;
    label?: string;
}) {
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);
    const type = visible ? 'text' : 'password';

    function generate() {
        const password = generatePassword();
        onChange({ password, confirm: password });
        setVisible(true);
    }

    return (
        <>
            <div className="filter-field">
                <label htmlFor={`${idPrefix}-password`}>{label || t('admins.password')}</label>
                <div className="admins-password">
                    <input id={`${idPrefix}-password`} type={type} autoComplete="new-password" dir="ltr" minLength={PASSWORD_MIN}
                           value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} />
                    <button type="button" className="btn mt-small" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
                        {t(visible ? 'login.hidePassword' : 'login.showPassword')}
                    </button>
                    {generator && <button type="button" className="btn mt-small" onClick={generate}>{t('admins.generate')}</button>}
                </div>
                <span className="mt-sub">{t('admins.passwordRule', { min: PASSWORD_MIN })}</span>
            </div>
            <div className="filter-field">
                <label htmlFor={`${idPrefix}-confirm`}>{t('admins.confirmPassword')}</label>
                <input id={`${idPrefix}-confirm`} type={type} autoComplete="new-password" dir="ltr"
                       value={value.confirm} onChange={(e) => onChange({ ...value, confirm: e.target.value })} />
            </div>
        </>
    );
}
