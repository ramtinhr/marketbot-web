import type { KeyboardEvent } from 'react';

import { useI18n } from '../../../i18n';
import { Field, SelectField, valueOptions, type Option } from '../../../shared/ui';
import type { ProjectionFilters as Filters } from '../api';
import { LIMIT_CODES, limitOption, OUTCOME_OPTIONS } from '../labels';

const PAGE_SIZES = ['10', '25', '50', '100'];

interface Props {
    draft: Filters;
    providers: string[];
    setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
    onEnter: (e: KeyboardEvent) => void;
}

export function ProjectionFilters({ draft, providers, setFilter, onEnter }: Props) {
    const { t } = useI18n();
    const all = { value: '', label: t('common.all') };
    const venues = [all, ...valueOptions(providers)];

    const select = (id: string, key: keyof Filters, label: string, options: Option[]) => (
        <SelectField id={id} label={label} value={draft[key]} options={options} onChange={(v) => setFilter(key, v)} onKeyDown={onEnter} />
    );
    const input = (id: string, key: keyof Filters, label: string, type: 'date' | 'number', placeholder?: string) => (
        <Field id={id} label={label}>
            <input type={type} id={id} placeholder={placeholder} step={type === 'number' ? 'any' : undefined}
                   value={draft[key]} onChange={(e) => setFilter(key, e.target.value)} onKeyDown={onEnter} />
        </Field>
    );

    return (
        <>
            {input('fFrom', 'from', t('opps.filter.from'), 'date')}
            {input('fTo', 'to', t('opps.filter.to'), 'date')}
            {select('fBuy', 'buy', t('opps.filter.buyVenue'), venues)}
            {select('fSell', 'sell', t('opps.filter.sellVenue'), venues)}
            {select('fOutcome', 'outcome', t('opps.filter.outcome'), [all, ...OUTCOME_OPTIONS.map(([value, key]) => ({ value, label: t(key) }))])}
            {select('fLimitedBy', 'limitedBy', t('opps.filter.limitedBy'), [all, ...LIMIT_CODES.map((value) => ({ value, label: limitOption(value) }))])}
            {input('fMinProfit', 'minProfit', t('opps.filter.minProfit'), 'number', t('opps.filter.minProfitPlaceholder'))}
            {input('fMaxProfit', 'maxProfit', t('opps.filter.maxProfit'), 'number', t('opps.filter.maxProfitPlaceholder'))}
            {input('fMinPct', 'minPct', t('opps.filter.minPct'), 'number', t('opps.filter.minPctPlaceholder'))}
            {select('fPlaceable', 'placeable', t('opps.filter.placeable'), [
                all, { value: 'true', label: t('opps.filter.placeableOnly') }, { value: 'false', label: t('opps.filter.belowMinimum') },
            ])}
            {select('fSimulated', 'simulated', t('opps.filter.mode'), [
                all, { value: 'false', label: t('opps.filter.realTrading') }, { value: 'true', label: t('opps.filter.simulation') },
            ])}
            {select('fPageSize', 'pageSize', t('common.pageSize'), valueOptions(PAGE_SIZES))}
        </>
    );
}
