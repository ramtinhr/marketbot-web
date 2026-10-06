import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../../i18n';
import { usePageStatus } from '../../shared/stores/pageStatus';
import { escapeHtml } from '../../shared/lib';
import { confirmDialog, EmptyState, Html, Notice, PageFooter, Panel, ProviderName, Skeleton } from '../../shared/ui';
import { providersApi, useProviderMutation, useProviderSettings, type ProviderSetting, type ReloadResult } from './api';
import { AddProviderForm } from './components/AddProviderForm';
import { CredentialCell, HostCell, StatusCell } from './components/ProviderCells';

type Note = { kind: 'reload'; reload: ReloadResult } | { kind: 'added'; code: string };

// A change is only half done when it is written: the bot builds its registry
// from this table once, at startup, so until it re-reads the table an
// "active" row is not a trading venue. Whether that reload landed is the
// thing an operator needs told, so it is said in full rather than implied.
function NoteView({ note }: { note: Note }) {
    const { t, plural } = useI18n();
    if (note.kind === 'added') {
        return <Html as="div" className="mt-notice" k="providers.add.done"
                     vars={{ code: escapeHtml(note.code), encoded: encodeURIComponent(note.code) }} />;
    }
    const { reload } = note;
    if (!reload.ok) return <Notice tone="red">{t('providers.reloadFailed', { error: reload.error || t('providers.noAnswer') })}</Notice>;
    const detail = typeof reload.registered === 'number' ? plural('providers.reloadedCount', reload.registered) : '';
    return <Notice tone="green">{t('providers.reloaded', { detail })}</Notice>;
}

function ProviderRow({ p, botPublishing, onToggle }: { p: ProviderSetting; botPublishing: boolean; onToggle: () => void }) {
    const { t } = useI18n();
    return (
        <tr>
            <td>
                <ProviderName code={p.code} label={p.name} />
                <div className="prov-code">{p.code}</div>
            </td>
            <td><StatusCell p={p} botPublishing={botPublishing} /></td>
            <td><CredentialCell p={p} /></td>
            <td><HostCell p={p} /></td>
            <td className="mt-actions">
                <Link className="btn mt-small" to={`/provider-edit?code=${encodeURIComponent(p.code)}`}>{t('common.edit')}</Link>
                {' '}
                <button className={`btn mt-small ${p.is_active ? 'mt-danger' : 'primary'}`} onClick={onToggle}>
                    {t(p.is_active ? 'providers.deactivate' : 'providers.activate')}
                </button>
            </td>
        </tr>
    );
}

export default function ProvidersPage() {
    const { t } = useI18n();
    const status = usePageStatus();
    const { data } = useProviderSettings();
    const [notes, setNotes] = useState<Note[]>([]);

    const fail = (error: Error) => status.showError(error.message);
    const onReloaded = (result: { reload?: ReloadResult | null }) => {
        if (result.reload) setNotes((prev) => [{ kind: 'reload', reload: result.reload! }, ...prev]);
    };

    const setActive = useProviderMutation(({ code, active }: { code: string; active: boolean }) => providersApi.setActive(code, active));
    const reload = useProviderMutation(() => providersApi.reloadBot());
    const busy = setActive.isPending || reload.isPending;

    // Deactivating is how a venue is taken out of trading, and there is no undo
    // beyond switching it back - but it is also the thing an operator reaches
    // for when a venue is misbehaving at 3am, so it asks once and does it.
    async function toggle(p: ProviderSetting) {
        const active = !p.is_active;
        if (busy) return;
        if (!active && !await confirmDialog({
            tone: 'danger',
            title: t('providers.confirmDeactivate.title', { code: p.code }),
            message: t('providers.confirmDeactivate.body'),
            confirmLabel: t('providers.confirmDeactivate.action'),
        })) return;
        status.hideError();
        setNotes([]);
        setActive.mutate({ code: p.code, active }, { onSuccess: onReloaded, onError: fail });
    }

    function reloadBot() {
        if (busy) return;
        setNotes([]);
        reload.mutate(undefined, { onSuccess: onReloaded, onError: fail });
    }

    const providers = data?.providers ?? [];

    return (
        <>
            <div>
                {notes.map((note, i) => <NoteView key={notes.length - i} note={note} />)}
                {data && !data.credentials_available && <Html as="div" className="mt-notice red" k="providers.noCredentialsKey" />}
                {data && !data.bot_publishing && <div className="mt-notice">{t('providers.notPublishing')}</div>}
                {data && data.bot_publishing && data.catalog_source === 'builtin' && <div className="mt-notice">{t('providers.catalogBuiltin')}</div>}
            </div>

            <Panel title={t('providers.panel.title')} count={providers.length} hint={t('providers.panel.hint')}>
                {!data ? (
                    <Skeleton>{t('providers.loading')}</Skeleton>
                ) : !providers.length ? (
                    <EmptyState icon="🔌" text={<Html k="providers.empty" />} />
                ) : (
                    <>
                        <div className="table-scroll">
                            <table className="data-table prov-table">
                                <thead>
                                    <tr>
                                        <th>{t('common.provider')}</th>
                                        <th>{t('common.status')}</th>
                                        <th>{t('providers.col.credentials')}</th>
                                        <th>{t('providers.col.hosts')}</th>
                                        <th>{t('providers.col.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {providers.map((p) => (
                                        <ProviderRow key={p.code} p={p} botPublishing={data.bot_publishing} onToggle={() => toggle(p)} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-row prov-reload">
                            <button className="btn mt-small" onClick={reloadBot}>{t('providers.reload')}</button>
                            <span className="mt-sub">{t('providers.reloadHint')}</span>
                        </div>
                    </>
                )}
            </Panel>

            <AddProviderForm available={data?.available_codes ?? []} onError={fail}
                             onAdded={(code) => setNotes([{ kind: 'added', code }])} />

            <PageFooter>{t('providers.footer')}</PageFooter>
        </>
    );
}
