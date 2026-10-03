import { useState } from 'react';

import { msg, rawMsg, renderMessage, useI18n, type Message } from '../../i18n';
import { Notice, PageFooter, Panel } from '../../shared/ui';
import { useCurrentAdmin } from '../auth/store';
import { useAdmins, useRemoveAdmin, type AdminRow } from './api';
import { AddAdminForm, ChangeOwnPasswordForm, ResetPasswordForm } from './components/AdminForms';
import { AdminsTable } from './components/AdminsTable';

type PageNotice = { message: Message; tone: 'green' | 'red' };

export default function AdminsPage() {
    const { t } = useI18n();
    const me = useCurrentAdmin();
    const { data: admins } = useAdmins();
    const removeAdmin = useRemoveAdmin();
    const [notice, setNotice] = useState<PageNotice | null>(null);
    const [resetFor, setResetFor] = useState<AdminRow | null>(null);

    const done = (message: Message) => setNotice({ message, tone: 'green' });

    function remove(row: AdminRow) {
        if (!window.confirm(t('admins.confirmRemove', { username: row.username }))) return;
        removeAdmin.mutate(row, {
            onSuccess: () => {
                if (resetFor?.id === row.id) setResetFor(null);
                done(msg('admins.removed', { username: row.username }));
            },
            onError: (error) => setNotice({ message: rawMsg(error.message), tone: 'red' }),
        });
    }

    return (
        <>
            {notice && <Notice tone={notice.tone}>{renderMessage(notice.message)}</Notice>}

            <Panel title={t('admins.panel.title')} count={admins?.length ?? 0} hint={t('admins.panel.hint')}>
                <AdminsTable rows={admins} selfId={me?.id} onRemove={remove}
                             onReset={(row) => { setResetFor(row); setNotice(null); }} />
            </Panel>

            {resetFor && (
                <ResetPasswordForm key={resetFor.id} row={resetFor} onCancel={() => setResetFor(null)}
                                   onDone={(message) => { setResetFor(null); done(message); }} />
            )}

            <div className="admins-grid">
                <AddAdminForm onDone={done} />
                <ChangeOwnPasswordForm onDone={done} />
            </div>

            <PageFooter>{t('admins.footer')}</PageFooter>
        </>
    );
}
