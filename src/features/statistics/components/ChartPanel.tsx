import { useState, type ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { Html, Panel } from '../../../shared/ui';

export type View = 'chart' | 'table';

export function ViewToggle({ value, onPick }: { value: View; onPick: (v: View) => void }) {
    const { t } = useI18n();
    return (
        <div className="view-toggle">
            {(['chart', 'table'] as const).map((v) => (
                <button key={v} className={value === v ? 'active' : undefined} onClick={() => onPick(v)}>{t(`stats.view.${v}`)}</button>
            ))}
        </div>
    );
}

/** A labelled control in a panel header. */
export function Control({ label, children }: { label: string; children: ReactNode }) {
    return <><span className="toolbar-label">{label}</span>{children}</>;
}

/**
 * One statistics section: title and meta, its own controls plus the
 * chart/table toggle, the reading note, the body and the caption. The body is
 * given the current view.
 */
export function ChartPanel({ id, title, meta, controls, note, caption, children }: {
    id: string;
    title: string;
    meta: string;
    controls?: ReactNode;
    /** Catalogue key of the note, which carries markup. */
    note: string;
    caption: string;
    children: (view: View) => ReactNode;
}) {
    const [view, setView] = useState<View>('chart');
    return (
        <Panel id={id} title={title} count={meta}
               actions={<div className="toolbar-group">{controls}<ViewToggle value={view} onPick={setView} /></div>}>
            <div className="metric-note">
                <span className="icon">⌁</span>
                <Html k={note} />
            </div>
            {children(view)}
            <div className="chart-caption">{caption}</div>
        </Panel>
    );
}

/** A chart, or the same data as a table; the table is only built once there is data. */
export function ChartOrTable({ view, unit, chart, table }: { view: View; unit: string; chart: ReactNode; table: ReactNode | false }) {
    return (
        <>
            <div className="stack-label">{unit}</div>
            <div hidden={view === 'table'}>{chart}</div>
            <div className="chart-table" hidden={view !== 'table'}>{table}</div>
        </>
    );
}
