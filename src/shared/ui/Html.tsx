import type { ElementType } from 'react';

import { t, useI18n, type Vars } from '../../i18n';

/**
 * A catalogue string that carries markup (an <a>, a <b>). Only ever fed from
 * the catalogue, which is ours; any value substituted into it must already be
 * escaped by the caller (escapeHtml in shared/lib).
 */
export function Html({ k, vars, as: Tag = 'span', className }: {
    k: string;
    vars?: Vars;
    as?: ElementType;
    className?: string;
}) {
    useI18n();
    return <Tag className={className} dangerouslySetInnerHTML={{ __html: t(k, vars) }} />;
}
