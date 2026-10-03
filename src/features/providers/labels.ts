import { has, useI18n } from '../../i18n';
import type { Credential, HostUrl } from './api';

/**
 * Names for the fields the bot's catalogue declares. A credential is named by
 * what it does (its kind), not by the config field it lands in - every secret
 * is stored as api_secret, but a signing secret and a login secret are
 * different things to paste. A kind or host field this build has no words for
 * (the bot added one since) falls back to the API's English label.
 */
export function useFieldLabels() {
    const { t } = useI18n();
    const maybe = (key: string) => (has(key) ? t(key) : null);
    return {
        credential: (c: Credential) => maybe(`providers.kind.${c.kind}`) ?? c.label,
        credentialHint: (c: Credential) => maybe(`providers.kind.${c.kind}.hint`),
        host: (u: HostUrl) => maybe(`providers.hostField.${u.field}`) ?? u.label,
    };
}
