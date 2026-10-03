import { Fragment, type ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { cx, providerColor, providerLabel } from '../../../shared/lib';
import { Segmented } from '../../../shared/ui';
import type { Range } from '../model';
import type { SetControls, StatsControls } from '../useStatsControls';
import type { ProviderToggles } from '../useProviderToggles';

const RANGES: Range[] = ['1h', '6h', '24h', '7d', 'all'];

function Group({ label, className, children }: { label?: ReactNode; className?: string; children: ReactNode }) {
    return (
        <div className={cx('toolbar-group', className)}>
            {label && <span className="toolbar-label">{label}</span>}
            {children}
        </div>
    );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
    return (
        <label className="switch">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="track"></span>
            <span>{label}</span>
        </label>
    );
}

function ProviderChips({ toggles }: { toggles: ProviderToggles }) {
    const { t } = useI18n();
    const { known, isEnabled, toggle } = toggles;
    if (known === null) return <span className="panel-hint">{t('status.loading')}</span>;
    if (!known.length) return <span className="panel-hint">{t('stats.noProviders')}</span>;
    return (
        <>
            {known.map((code) => (
                <label key={code} className={cx('series-chip', !isEnabled(code) && 'off')}>
                    <input type="checkbox" checked={isEnabled(code)} onChange={(e) => toggle(code, e.target.checked)} />
                    <span className="series-swatch" style={{ background: providerColor(code) }}></span>
                    <span>{providerLabel(code)}</span>
                </label>
            ))}
        </>
    );
}

/**
 * One toolbar, above everything it scopes. Every chart below re-renders
 * against the same slice, so the numbers agree.
 */
export function StatsToolbar({ controls, set, symbols, toggles, sideLabels, onRefresh }: {
    controls: StatsControls;
    set: SetControls;
    symbols: string[];
    toggles: ProviderToggles;
    sideLabels: { strong: string; soft: string };
    onRefresh: () => void;
}) {
    const { t } = useI18n();
    // The pair list comes from the server, so a pair it does not poll can
    // never be selected here and charted as empty.
    const pairs = symbols.includes(controls.symbol) ? symbols : [...symbols, controls.symbol];

    const groups: ReactNode[] = [
        <Group key="pair" label={<label htmlFor="symbolControl">{t('stats.toolbar.pair')}</label>}>
            <select id="symbolControl" className="toolbar-select" aria-label={t('stats.toolbar.tradingPair')}
                    value={controls.symbol} onChange={(e) => set({ symbol: e.target.value })}>
                {pairs.map((sym) => <option key={sym} value={sym}>{sym}</option>)}
            </select>
        </Group>,
        <Group key="range" label={t('stats.toolbar.range')}>
            <Segmented role="tablist" value={controls.range} onPick={(range) => set({ range })}
                       options={RANGES.map((r) => ({ value: r, label: t(`stats.range.${r}`) }))} />
        </Group>,
        <Group key="providers" label={t('stats.toolbar.providers')}>
            <div className="series-toggles"><ProviderChips toggles={toggles} /></div>
        </Group>,
        <Group key="prices" label={t('stats.toolbar.prices')}>
            <Segmented value={controls.priceMode} onPick={(priceMode) => set({ priceMode })} options={[
                { value: 'effective', label: t('stats.toolbar.inclFees') },
                { value: 'raw', label: t('stats.toolbar.rawQuote') },
            ]} />
        </Group>,
        <Group key="sides" className="switch-row">
            <Switch checked={controls.showBid} onChange={(showBid) => set({ showBid })} label={sideLabels.strong} />
            <Switch checked={controls.showAsk} onChange={(showAsk) => set({ showAsk })} label={sideLabels.soft} />
        </Group>,
    ];

    return (
        <div className="chart-toolbar" role="group" aria-label={t('stats.toolbar.filters')}>
            {groups.map((g, i) => (
                <Fragment key={i}>
                    {i > 0 && <div className="toolbar-divider" aria-hidden="true"></div>}
                    {g}
                </Fragment>
            ))}
            <div className="toolbar-spacer"></div>
            <button className="btn" onClick={onRefresh}>{t('stats.toolbar.refresh')}</button>
        </div>
    );
}
