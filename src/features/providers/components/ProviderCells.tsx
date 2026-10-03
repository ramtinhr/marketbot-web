import { Fragment, type ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { StatusBadge } from '../../../shared/ui';
import type { Credential, CreditLine, ProviderSetting } from '../api';
import { useFieldLabels } from '../labels';

/** Badges separated by spaces, as the cells have always read. */
function Spaced({ items }: { items: ReactNode[] }) {
    return <>{items.map((item, i) => <Fragment key={i}>{i > 0 && ' '}{item}</Fragment>)}</>;
}

export function useCreditLabel() {
    const { t, format } = useI18n();
    return (c: CreditLine) => `${c.asset} ${c.amount === 'unlimited' ? t('providers.credit.unlimited') : format.number(c.amount)}`;
}

function CredentialBadge({ c, active }: { c: Credential; active: boolean }) {
    const { t } = useI18n();
    const label = useFieldLabels().credential(c);
    if (c.unreadable) return <StatusBadge tone="failed" title={t('providers.cred.unreadable')}>{label} ⚠</StatusBadge>;
    if (c.stored) return <StatusBadge tone="ok" title={t('providers.cred.stored')}>{label}</StatusBadge>;
    // The bot falls back to its own .env, so "not stored here" is not "the bot
    // has no key" - and saying so wrongly sends someone pasting a key that was
    // never missing.
    if (c.active_source === 'environment') {
        return <StatusBadge tone="simulated" title={t('providers.cred.fromEnv', { env: c.env })}>{t('providers.cred.envBadge', { label })}</StatusBadge>;
    }
    return <StatusBadge tone={active ? 'pending' : ''} title={t('providers.cred.missing')}>{t('providers.cred.missingBadge', { label })}</StatusBadge>;
}

export function CredentialCell({ p }: { p: ProviderSetting }) {
    const { t } = useI18n();
    if (!p.credentials.length) return <span className="muted">{t('common.none')}</span>;
    return <Spaced items={p.credentials.map((c) => <CredentialBadge key={c.field} c={c} active={p.is_active} />)} />;
}

export function HostCell({ p }: { p: ProviderSetting }) {
    const { t } = useI18n();
    const labels = useFieldLabels();
    if (!p.urls.length) return <span className="muted">—</span>;
    return (
        <div className="prov-hosts">
            {p.urls.map((u) => {
                const overridden = Boolean(u.override);
                const title = overridden
                    ? t('providers.host.override', { default: u.default || t('providers.host.unset') })
                    : t('providers.host.default');
                return (
                    <div className="mt-small" title={title} key={u.field}>
                        <bdi className="muted">{labels.host(u)}</bdi> <bdi className="prov-mono" dir="ltr">{u.effective || '—'}</bdi>
                        {overridden && <> <StatusBadge tone="simulated">{t('providers.host.overrideBadge')}</StatusBadge></>}
                    </div>
                );
            })}
        </div>
    );
}

export function StatusCell({ p, botPublishing }: { p: ProviderSetting; botPublishing: boolean }) {
    const { t } = useI18n();
    const creditLabel = useCreditLabel();
    const bits: ReactNode[] = [
        <StatusBadge key="state" tone={p.is_active ? 'online' : 'offline'}>{t(p.is_active ? 'providers.state.active' : 'providers.state.inactive')}</StatusBadge>,
    ];
    // Active in the table and absent from the bot's registry is the state
    // worth shouting about: it means the bot has not re-read the table, or
    // it skipped the row.
    if (p.is_active && botPublishing && !p.registered) {
        bits.push(<StatusBadge key="notLoaded" tone="stale" title={t('providers.state.notLoadedHint')}>{t('providers.state.notLoaded')}</StatusBadge>);
    }
    if (p.circuit_state) {
        const tone = p.circuit_state.toLowerCase().replace('-', '');
        bits.push(<StatusBadge key="circuit" tone={tone} title={t('providers.state.circuitHint')}>{p.circuit_state}</StatusBadge>);
    }
    // What the bot is counting when it says; what is stored here otherwise.
    const credit = p.active_credit?.length ? p.active_credit : p.credit;
    if (credit?.length) {
        const lines = credit.map(creditLabel).join(' · ');
        bits.push(<StatusBadge key="credit" tone="simulated" title={t('providers.credit.hint')}>{t('providers.credit.badge', { lines })}</StatusBadge>);
    }
    if (!p.known) {
        bits.push(<StatusBadge key="unknown" tone="failed" title={t('providers.state.unknownCodeHint')}>{t('providers.state.unknownCode')}</StatusBadge>);
    } else if (!p.registrable) {
        bits.push(<StatusBadge key="needsHost" tone="stale" title={t('providers.state.needsHostHint')}>{t('providers.state.needsHost')}</StatusBadge>);
    }
    return <Spaced items={bits} />;
}
