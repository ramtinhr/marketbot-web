import { useState, type FormEvent } from 'react';

import { msg, useI18n } from '../../../../i18n';
import { Field } from '../../../../shared/ui';
import { providersApi, type CreditLine } from '../../api';
import { useCreditLabel } from '../ProviderCells';
import type { SectionProps } from './types';

interface CreditRow {
    asset: string;
    amount: string;
    unlimited: boolean;
}

const toRow = (c: CreditLine): CreditRow => ({
    asset: c.asset,
    amount: c.amount === 'unlimited' ? '' : String(c.amount),
    unlimited: c.amount === 'unlimited',
});

/** The rows as the API takes them: asset → amount or "unlimited"; null for none. */
function toBody(rows: CreditRow[]): Record<string, string> | null {
    const credit: Record<string, string> = {};
    for (const r of rows) {
        const asset = r.asset.trim().toUpperCase();
        if (asset) credit[asset] = r.unlimited ? 'unlimited' : r.amount.trim();
    }
    return Object.keys(credit).length ? credit : null;
}

// What the venue lends beyond the account's own funds. Every balance check
// in the bot (pre-trade, both fill legs, manual orders) counts free + this,
// so an account trading on a loan is not refused for lacking cash it does
// not need. Not a secret - stored in the clear, no CREDENTIALS_KEY needed.
export function CreditForm({ p, save }: SectionProps) {
    const { t } = useI18n();
    const creditLabel = useCreditLabel();
    const [rows, setRows] = useState<CreditRow[]>(() => p.credit.map(toRow));

    const update = (i: number, patch: Partial<CreditRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const addRow = () => setRows([...rows, { asset: rows.length ? '' : 'IRT', amount: '', unlimited: false }]);
    const removeRow = (i: number) => setRows(rows.filter((_, j) => j !== i));

    function onSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        void save(() => providersApi.putSettings(p.code, { credit: toBody(rows) }), msg('providerEdit.credit.saved'));
    }

    function onClear() {
        if (!window.confirm(t('providerEdit.credit.confirmClear', { code: p.code }))) return;
        void save(() => providersApi.clearSetting(p.code, 'credit'), msg('providerEdit.credit.cleared'));
    }

    const stored = p.credit.map(creditLabel).join(' · ');
    const live = p.active_credit === null
        ? t('providerEdit.credit.liveUnknown')
        : p.active_credit.length
            ? t('providerEdit.credit.live', { lines: p.active_credit.map(creditLabel).join(' · ') })
            : t('providerEdit.credit.liveNone');
    // A line the bot counts that is not stored here came from its .env.
    const fromEnv = p.active_credit?.some((a) => !p.credit.some((c) => c.asset === a.asset));

    return (
        <form className="mt-form" onSubmit={onSubmit}>
            {rows.length ? rows.map((r, i) => (
                <div className="mt-row credit-row" key={i}>
                    <Field id={`credit-asset-${i}`} label={t('providerEdit.credit.asset')}>
                        <input id={`credit-asset-${i}`} type="text" maxLength={12} spellCheck={false}
                               className="credit-asset" value={r.asset} placeholder="IRT"
                               onChange={(e) => update(i, { asset: e.target.value })} />
                    </Field>
                    <Field id={`credit-amount-${i}`} label={t('providerEdit.credit.amount')} className="mt-grow">
                        <input id={`credit-amount-${i}`} type="text" inputMode="decimal" spellCheck={false}
                               value={r.amount} placeholder={t('providerEdit.credit.amountPlaceholder')} disabled={r.unlimited}
                               onChange={(e) => update(i, { amount: e.target.value })} />
                    </Field>
                    <label className="credit-unlimited">
                        <input type="checkbox" checked={r.unlimited} onChange={(e) => update(i, { unlimited: e.target.checked })} />
                        <span>{t('providers.credit.unlimited')}</span>
                    </label>
                    <button className="btn mt-small" type="button" aria-label={t('providerEdit.credit.remove')} onClick={() => removeRow(i)}>✕</button>
                </div>
            )) : <div className="mt-sub">{t('providerEdit.credit.empty')}</div>}
            <div className="mt-row">
                <button className="btn mt-small" type="button" onClick={addRow}>{t('providerEdit.credit.add')}</button>
                <span className="toolbar-spacer" />
                <button className="btn primary" type="submit">{t('common.save')}</button>
                {p.credit.length > 0 && <button className="btn mt-danger" type="button" onClick={onClear}>{t('common.clear')}</button>}
            </div>
            <div className="mt-sub">{stored ? t('providerEdit.credit.stored', { lines: stored }) : t('providerEdit.credit.storedNone')} {live}</div>
            {fromEnv && <div className="mt-sub">{t('providerEdit.credit.fromEnv', { env: `${p.code.toUpperCase()}_CREDIT_<ASSET>` })}</div>}
            <div className="mt-sub">{t('providerEdit.credit.rule')}</div>
        </form>
    );
}
