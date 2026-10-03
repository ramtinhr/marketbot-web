import type { Message } from '../../../../i18n';
import type { MutationResult, ProviderSetting } from '../../api';

/**
 * Runs one settings write and reports it: `label` names what was done in the
 * page's notice. Resolves true when the write landed.
 */
export type Save = (write: () => Promise<MutationResult>, label: Message) => Promise<boolean>;

export interface SectionProps {
    p: ProviderSetting;
    save: Save;
}
