import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { Field, Panel, SelectField } from '../../../shared/ui';
import { DEFAULT_SCOPE, type AuditScope } from '../api';

/** What to audit and how strictly; nothing runs until the button is pressed. */
export function AuditScopeForm({ running, onRun }: { running: boolean; onRun: (scope: AuditScope) => void }) {
    const { t } = useI18n();
    const [scope, setScope] = useState<AuditScope>(DEFAULT_SCOPE);
    const set = (key: keyof AuditScope) => (value: string) => setScope((s) => ({ ...s, [key]: value }));
    const includeOptions = [{ value: 'false', label: t('audit.scope.exclude') }, { value: 'true', label: t('audit.scope.include') }];

    const number = (id: string, key: keyof AuditScope, label: string, attrs: { min: string; max?: string; step?: string }) => (
        <Field id={id} label={label}>
            <input type="number" id={id} {...attrs} value={scope[key]} onChange={(e) => set(key)(e.target.value)} />
        </Field>
    );

    return (
        <Panel title={t('audit.scope.title')} hint={t('audit.scope.hint')}>
            <div className="filters">
                {number('limitInput', 'limit', t('audit.scope.limit'), { min: '1', max: '200' })}
                {number('priceTolInput', 'priceTol', t('audit.scope.priceTolerance'), { min: '0', step: '0.01' })}
                {number('qtyTolInput', 'qtyTol', t('audit.scope.qtyTolerance'), { min: '0', step: '0.01' })}
                <SelectField id="simulatedSelect" label={t('audit.scope.simulated')} value={scope.simulated} options={includeOptions} onChange={set('simulated')} />
                <SelectField id="unplacedSelect" label={t('audit.scope.unplaced')} value={scope.unplaced} options={includeOptions} onChange={set('unplaced')} />
                <Field label={'\u00a0'}>
                    <button className="btn primary" disabled={running} onClick={() => onRun(scope)}>
                        {running ? t('audit.scope.running') : t('audit.scope.run')}
                    </button>
                </Field>
            </div>
        </Panel>
    );
}
