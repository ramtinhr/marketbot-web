import type { ReactNode } from 'react';

import { format, t } from '../../i18n';
import type { AuditField, AuditLeg, AuditTrade } from './api';

export type FieldState = 'missing' | 'bad' | 'ok' | 'open' | 'near';

const isBlank = (v: unknown): v is null | undefined => v === null || v === undefined;

// Prices run to the whole Toman and amounts to 8 decimals, and the entire
// point of the page is spotting a small divergence between two columns - so
// values are shown at full precision rather than rounded to a
// thousands-separated summary the way the other pages show them.
export function fmtValText(v: number | null | undefined, unit: string): string {
    if (isBlank(v)) return t('audit.notReported');
    return format.number(v, { minimumFractionDigits: 0, maximumFractionDigits: unit === 'USDT' ? 8 : 2 });
}

export function AuditValue({ v, unit }: { v: number | null | undefined; unit: string }) {
    if (isBlank(v)) return <span className="audit-missing">{t('audit.notReported')}</span>;
    return <>{fmtValText(v, unit)}</>;
}

// A row is judged by the audit's own verdict, never by the sign of its
// difference: an exchange reporting more than we recorded is no better news
// than one reporting less, so direction gets no colour of its own.
// Differences that only exist past the display precision count as equal.
export function fieldState(field: AuditField, leg: AuditLeg): FieldState {
    if (isBlank(field.exchange) || isBlank(field.diff)) return 'missing';
    if (field.mismatch) return 'bad';
    const pct = isBlank(field.diff_pct) ? null : Math.abs(field.diff_pct);
    if (field.diff === 0 || (pct !== null && pct < 0.0001)) return 'ok';
    if (!leg.terminal && (field.field === 'executed_amount' || field.field === 'quote_total')) return 'open';
    return 'near';
}

function fmtDiffPct(pct: number | null | undefined): string {
    if (isBlank(pct)) return '';
    if (pct !== 0 && Math.abs(pct) < 0.01) return `${pct > 0 ? '+' : '−'}<${format.percent(0.01, 2)}`;
    return (pct > 0 ? '+' : '') + format.percent(pct, 2);
}

export const MARK_OK = <span className="audit-mark ok">✓</span>;
export const MARK_NEAR = <span className="audit-mark near">≈</span>;
export const MARK_BAD = <span className="audit-mark bad">✕</span>;
export const MISSING = <span className="audit-missing">—</span>;

export function FieldCheck({ field, state }: { field: AuditField; state: FieldState }): ReactNode {
    if (state === 'missing') return MISSING;
    if (state === 'ok') return MARK_OK;
    const diff = <>{(field.diff ?? 0) > 0 ? '+' : ''}<AuditValue v={field.diff} unit={field.unit} /> <span className="audit-pct">{fmtDiffPct(field.diff_pct)}</span></>;
    if (state === 'bad') return <>{MARK_BAD} <span className="audit-diff bad">{diff}</span></>;
    if (state === 'open') return <span className="audit-diff dim" title={t('audit.openExpected')}>{diff}</span>;
    return <>{MARK_NEAR} <span className="audit-diff dim">{diff}</span></>;
}

/** The catalogue's name for a field, or the field's own name made readable. */
export function fieldLabel(name: string): string {
    const key = `audit.field.${name}`;
    const label = t(key);
    return label === key ? name.replace(/_/g, ' ') : label;
}

export function needsAttention(trade: AuditTrade): boolean {
    return trade.mismatch_count > 0 || !trade.buy?.verified || !trade.sell?.verified;
}
