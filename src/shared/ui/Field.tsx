import type { KeyboardEvent, ReactNode } from 'react';

import { cx } from '../lib/cx';

/** A labelled control in a filter bar or form. */
export function Field({ id, label, title, className, children }: {
    id?: string;
    label: ReactNode;
    title?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cx('filter-field', className)}>
            <label htmlFor={id} title={title}>{label}</label>
            {children}
        </div>
    );
}

export interface Option { value: string; label: ReactNode }

export function SelectField({ id, label, title, value, options, onChange, onKeyDown }: {
    id: string;
    label: ReactNode;
    title?: string;
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    onKeyDown?: (e: KeyboardEvent) => void;
}) {
    return (
        <Field id={id} label={label} title={title}>
            <select id={id} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </Field>
    );
}

/** Plain options whose label is the value itself (venue codes, page sizes). */
export const valueOptions = (values: string[], format: (v: string) => ReactNode = (v) => v): Option[] =>
    values.map((value) => ({ value, label: format(value) }));

/** A row of mutually exclusive buttons. */
export function Segmented<V extends string>({ value, options, onPick, role, className, dataKey }: {
    value: V;
    options: Array<{ value: V; label: ReactNode }>;
    onPick: (v: V) => void;
    role?: 'tablist';
    className?: string;
    /** Stamps each button with `data-<dataKey>="<value>"`, for styles keyed on the value. */
    dataKey?: string;
}) {
    return (
        <div className={cx('segmented', className)} role={role}>
            {options.map((o) => (
                <button key={o.value} type="button" className={o.value === value ? 'active' : undefined}
                        {...(dataKey ? { [`data-${dataKey}`]: o.value } : {})}
                        role={role === 'tablist' ? 'tab' : undefined} onClick={() => onPick(o.value)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}
