import { useState } from 'react';

import { msg, useI18n, type Message } from '../../../i18n';
import { useChangeOwnPassword, useCreateAdmin, useResetPassword, type AdminRow } from '../api';
import { normalizeUsername, passwordProblem, usernameProblem } from '../validation';
import { FormPanel, useValidatedSubmit } from './FormPanel';
import { EMPTY_PAIR, PasswordPair } from './PasswordPair';

type Done = (notice: Message) => void;

export function AddAdminForm({ onDone }: { onDone: Done }) {
    const { t } = useI18n();
    const [username, setUsername] = useState('');
    const [pair, setPair] = useState(EMPTY_PAIR);
    const name = normalizeUsername(username);

    const { onSubmit, error, busy } = useValidatedSubmit(useCreateAdmin(), {
        validate: () => usernameProblem(name) ?? passwordProblem(pair.password, pair.confirm),
        variables: () => ({ username: name, password: pair.password }),
        onSuccess: () => {
            setUsername('');
            setPair(EMPTY_PAIR);
            onDone(msg('admins.added', { username: name }));
        },
    });

    return (
        <FormPanel title={t('admins.add.title')} hint={t('admins.add.hint')} onSubmit={onSubmit} error={error} autoComplete="off"
                   actions={<button className="btn primary" type="submit" disabled={busy}>{t('admins.add.submit')}</button>}>
            <div className="filter-field">
                <label htmlFor="add-username">{t('admins.username')}</label>
                <input id="add-username" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} dir="ltr"
                       maxLength={32} value={username} onChange={(e) => setUsername(e.target.value)} />
                <span className="mt-sub">{t('admins.usernameRule')}</span>
            </div>
            <PasswordPair idPrefix="add" value={pair} onChange={setPair} generator />
        </FormPanel>
    );
}

export function ResetPasswordForm({ row, onDone, onCancel }: { row: AdminRow; onDone: Done; onCancel: () => void }) {
    const { t } = useI18n();
    const [pair, setPair] = useState(EMPTY_PAIR);

    const { onSubmit, error, busy } = useValidatedSubmit(useResetPassword(), {
        validate: () => passwordProblem(pair.password, pair.confirm),
        variables: () => ({ id: row.id, password: pair.password }),
        onSuccess: () => onDone(msg('admins.reset.done', { username: row.username })),
    });

    return (
        <FormPanel title={t('admins.reset.title', { username: row.username })} hint={t('admins.reset.hint')}
                   onSubmit={onSubmit} error={error} autoComplete="off"
                   actions={<>
                       <button className="btn primary" type="submit" disabled={busy}>{t('admins.reset.submit')}</button>
                       <button className="btn" type="button" onClick={onCancel}>{t('common.cancel')}</button>
                   </>}>
            <PasswordPair idPrefix="reset" value={pair} onChange={setPair} generator label={t('admins.newPassword')} />
        </FormPanel>
    );
}

export function ChangeOwnPasswordForm({ onDone }: { onDone: Done }) {
    const { t } = useI18n();
    const [current, setCurrent] = useState('');
    const [pair, setPair] = useState(EMPTY_PAIR);

    const { onSubmit, error, busy } = useValidatedSubmit(useChangeOwnPassword(), {
        validate: () => (current ? passwordProblem(pair.password, pair.confirm) : msg('admins.error.current')),
        variables: () => ({ current, password: pair.password }),
        onSuccess: () => {
            setCurrent('');
            setPair(EMPTY_PAIR);
            onDone(msg('admins.own.done'));
        },
    });

    return (
        <FormPanel title={t('admins.own.title')} hint={t('admins.own.hint')} onSubmit={onSubmit} error={error}
                   actions={<button className="btn primary" type="submit" disabled={busy}>{t('admins.own.submit')}</button>}>
            <div className="filter-field">
                <label htmlFor="own-current">{t('admins.currentPassword')}</label>
                <input id="own-current" type="password" autoComplete="current-password" dir="ltr"
                       value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <PasswordPair idPrefix="own" value={pair} onChange={setPair} label={t('admins.newPassword')} />
        </FormPanel>
    );
}
