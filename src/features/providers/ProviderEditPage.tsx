import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { msg, renderMessage, useI18n, type Message } from '../../i18n';
import { usePageStatus } from '../../shared/stores/pageStatus';
import { EmptyState, Notice, PageFooter, Panel, Skeleton } from '../../shared/ui';
import { useProviderDetail, useProviderMutation, type MutationResult, type ProviderSetting, type ReloadResult } from './api';
import { CredentialsForm } from './components/edit/CredentialsForm';
import { CreditForm } from './components/edit/CreditForm';
import { DetailsForm } from './components/edit/DetailsForm';
import { HostsForm } from './components/edit/HostsForm';
import type { Save } from './components/edit/types';

interface SaveNotice {
    label: Message;
    reload: ReloadResult | null | undefined;
}

/** What was saved, and whether the bot picked it up. */
function SaveNoticeView({ notice }: { notice: SaveNotice }) {
    const { t } = useI18n();
    const prefix = renderMessage(notice.label);
    const { reload } = notice;
    if (!reload) return <Notice>{t('providerEdit.reload.plain', { prefix })}</Notice>;
    if (reload.ok) return <Notice>{t('providerEdit.reload.ok', { prefix })}</Notice>;
    return <Notice tone="red">{t('providerEdit.reload.failed', { prefix, error: reload.error || t('providers.noAnswer') })}</Notice>;
}

/** The topbar and tab carry the venue's name once it is known. */
function useProviderTitles(provider: ProviderSetting | undefined) {
    const { t } = useI18n();
    const { setTitles } = usePageStatus();
    useEffect(() => {
        if (!provider) return undefined;
        setTitles({
            title: provider.name,
            subtitle: t('providerEdit.subtitle', { code: provider.code }),
            docTitle: t('providerEdit.docTitleNamed', { name: provider.name }),
        });
        return () => setTitles(null);
    }, [provider, t, setTitles]);
}

export default function ProviderEditPage() {
    const { t } = useI18n();
    const status = usePageStatus();
    const [searchParams] = useSearchParams();
    const code = searchParams.get('code') || '';

    const { data, error, dataUpdatedAt } = useProviderDetail(code);
    const p = data?.provider;
    const [notice, setNotice] = useState<SaveNotice | null>(null);
    const write = useProviderMutation((run: () => Promise<MutationResult>) => run());

    useProviderTitles(p);
    useEffect(() => { if (!code) status.showError(msg('providerEdit.noCode')); }, [code, status]);

    const save: Save = async (run, label) => {
        if (write.isPending) return false;
        status.hideError();
        try {
            const result = await write.mutateAsync(run);
            setNotice({ label, reload: result.reload });
            return true;
        } catch (err) {
            status.showError((err as Error).message);
            return false;
        }
    };

    // Every refresh from the server remounts the forms, so typed values (and
    // any pasted key) never outlive the copy they were typed against.
    const formKey = dataUpdatedAt;
    const hint = !p ? ''
        : p.known ? t('providerEdit.hint', { catalog: p.catalog_name ?? '', code: p.code })
            : t('providerEdit.hintUnknown', { code: p.code });

    return (
        <>
            <div>{notice && <SaveNoticeView notice={notice} />}</div>

            <Panel title={p ? p.name : t('providerEdit.heading')} hint={hint}>
                {!code ? <EmptyState text={t('providerEdit.nothingToEdit')} />
                    : error && !p ? <EmptyState text={error.message} />
                        : !p ? <Skeleton>{t('providerEdit.loading')}</Skeleton>
                            : <DetailsForm key={formKey} p={p} save={save} />}
            </Panel>

            <Panel title={t('providerEdit.credentials.title')} hint={t('providerEdit.credentials.hint')} hidden={!p?.credentials.length}>
                {p && p.credentials.length > 0 && (
                    <CredentialsForm key={formKey} p={p} save={save} credentialsAvailable={Boolean(data?.credentials_available)} />
                )}
            </Panel>

            <Panel title={t('providerEdit.credit.title')} hint={t('providerEdit.credit.hint')} hidden={!p?.known}>
                {/* Keyed on the stored lines only: a draft survives saves made elsewhere on the page. */}
                {p?.known && <CreditForm key={JSON.stringify(p.credit)} p={p} save={save} />}
            </Panel>

            <Panel title={t('providerEdit.hosts.title')} hint={t('providerEdit.hosts.hint')} hidden={!p?.urls.length}>
                {p && p.urls.length > 0 && <HostsForm key={formKey} p={p} save={save} />}
            </Panel>

            <PageFooter>{t('providerEdit.footer')}</PageFooter>
        </>
    );
}
