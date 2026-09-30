// MarketBot chart primitives: the shared styling layer every chart is built from.
//
// Three charts have to read as one system, and the thing that drifts first is
// chrome - a grid line a shade darker here, a tooltip that formats Toman
// differently there, an axis that forgot the theme changed. Everything visual
// is decided once here; each chart supplies only its data and axis meaning.
//
// Colour is not decided here. It comes from providerColor (lib/ui), the single
// validated provider mapping shared with the rest of the dashboard.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as echarts from 'echarts';

import { format, t, useI18n } from '../i18n';
import { useTheme } from './theme';
import { escapeHtml, providerColor, providerColorSoft, providerLabel } from './ui';

// ---- Theme tokens -------------------------------------------------------
// Read from the stylesheet rather than restated. A canvas can't inherit a CSS
// variable, so these are resolved at build time and the whole option is
// rebuilt on a theme or language change (see useChartTokens).
export interface ChartTokens {
    text: string; textDim: string; textFaint: string;
    surface: string; surface2: string; border: string; borderSoft: string;
    accent: string; green: string; red: string; amber: string;
    mono: string; sans: string;
}

export function tokens(): ChartTokens {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => (css.getPropertyValue(name) || '').trim() || fallback;
    return {
        text: v('--text', '#eaecef'),
        textDim: v('--text-dim', '#848e9c'),
        textFaint: v('--text-faint', '#5e6673'),
        surface: v('--surface', '#181a20'),
        surface2: v('--surface-2', '#1e2329'),
        border: v('--border', '#2b3139'),
        borderSoft: v('--border-soft', '#1e2329'),
        accent: v('--accent', '#4d6bfe'),
        green: v('--green', '#2fd66c'),
        red: v('--red', '#ff5c5c'),
        amber: v('--amber', '#f5a623'),
        mono: v('--mono', 'monospace'),
        sans: v('--sans', 'sans-serif'),
    };
}

/**
 * Tokens for the current theme and language. Use the returned object as a
 * dependency of the option builder's useMemo: it changes identity exactly when
 * the chart has to be rebuilt (axis titles, legends and tooltips are painted
 * into the canvas, so no DOM re-render can reach them).
 */
export function useChartTokens(): ChartTokens {
    const { theme } = useTheme();
    const { locale } = useI18n();
    // The OS theme can change while the page is open.
    return useMemo(() => tokens(), [theme, locale]);
}

// ---- Formatters ---------------------------------------------------------
// All of them go through the i18n runtime: a chart axis and the table beside
// it showing the same number two ways is the drift this file exists to prevent.
export const fmtInt = { format: (n: number) => format.number(n, { maximumFractionDigits: 0 }) };
export const fmt2 = { format: (n: number) => format.decimal(n, 2) };

/** Toman has no sub-unit, so fractions of one are noise on a chart axis. */
export function fmtToman(n: number): string {
    return format.number(n, { maximumFractionDigits: 0 });
}
export function fmtPrice(n: number): string {
    return format.number(n, { maximumFractionDigits: 0 });
}
export function fmtPct(n: number, decimals = 3): string {
    return format.percent(n, decimals);
}
/** Trailing zeros dropped so a column of quantities reads at a glance. */
export function fmtQty(n: number | null | undefined, decimals = 4): string {
    if (n === null || n === undefined || !isFinite(n)) return t('common.na');
    return format.number(n, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        .replace(/[.,٫]?0+$/, '');
}
export function fmtClock(ts: unknown): string {
    return format.time(ts, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function fmtDateTime(ts: unknown): string {
    return format.dateTime(ts, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---- Base option --------------------------------------------------------
// The chrome every chart shares: hairline solid axes and gridlines one shade
// off the surface (never dashed - a dashed grid reads as a threshold), thin
// marks, generous padding, and a legend that is always present.
export function baseOption(tk: ChartTokens, opts: { xType?: string; legend?: boolean; legendTop?: number } = {}): any {
    const o = Object.assign({ xType: 'time', legend: true, legendTop: 0 }, opts);
    return {
        animationDuration: 220,
        backgroundColor: 'transparent',
        textStyle: { fontFamily: tk.sans, fontSize: 11.5, color: tk.textDim },
        grid: { left: 8, right: 18, top: o.legend ? 44 : 14, bottom: 8, containLabel: true },
        legend: o.legend ? {
            type: 'scroll',
            top: o.legendTop,
            left: 0,
            itemGap: 14,
            itemWidth: 22,
            itemHeight: 10,
            // No icon override: each series draws its own mark in the legend,
            // so identity is never colour-only.
            lineStyle: { width: 2 },
            textStyle: { color: tk.textDim, fontSize: 11.5 },
            inactiveColor: tk.textFaint,
            pageIconColor: tk.textDim,
            pageIconInactiveColor: tk.borderSoft,
            pageTextStyle: { color: tk.textFaint },
        } : { show: false },
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'line',
                // The crosshair finds the X so the reader aims at a time, never at a 2px line.
                lineStyle: { color: tk.textFaint, width: 1 },
                snap: true,
            },
            backgroundColor: tk.surface,
            borderColor: tk.border,
            borderWidth: 1,
            padding: [9, 11],
            extraCssText: 'border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,0.28);',
            textStyle: { color: tk.text, fontSize: 12 },
            confine: true,
        },
        xAxis: {
            type: o.xType,
            axisLine: { lineStyle: { color: tk.border, width: 1, type: 'solid' } },
            axisTick: { show: false },
            axisLabel: { color: tk.textFaint, fontSize: 10.5, hideOverlap: true },
            splitLine: { show: false },
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: tk.textFaint, fontSize: 10.5, fontFamily: tk.mono },
            splitLine: { lineStyle: { color: tk.borderSoft, width: 1, type: 'solid' } },
        },
        series: [],
    };
}

// ---- Axis titles --------------------------------------------------------
// Named axes rather than a caption above the chart: a unit stated anywhere but
// on the axis is a unit the reader has to go looking for.
//
// Call this LAST in a builder: it reserves its own bands, and anything that
// sets grid.top/grid.bottom afterwards clips the titles. The y title sits
// horizontally above the axis, left-aligned from the axis line, rather than
// rotated down the side - a rotated title's nameGap depends on tick-label
// width this code cannot know, and overshoot is silently off-canvas.
const Y_TITLE_BAND = 24;
const X_TITLE_BAND = 20;

export function axisTitles(option: any, tk: ChartTokens, opts: { x?: string; y?: string; xGap?: number } = {}): any {
    const style = { color: tk.textDim, fontSize: 11, fontWeight: 600 };
    if (opts.y) {
        Object.assign(option.yAxis, {
            name: opts.y,
            nameLocation: 'end',
            nameGap: 13,
            nameTextStyle: Object.assign({ align: 'left' }, style),
        });
        option.grid.top = (option.grid.top || 0) + Y_TITLE_BAND;
    }
    if (opts.x) {
        Object.assign(option.xAxis, {
            name: opts.x,
            nameLocation: 'middle',
            nameGap: opts.xGap || 30,
            nameTextStyle: style,
        });
        option.grid.bottom = (option.grid.bottom || 0) + X_TITLE_BAND;
    }
    return option;
}

// ---- Tooltip rendering --------------------------------------------------
// Series names come from the API - provider codes, route names - so every one
// is escaped on the way into the tooltip's markup.
export interface TooltipRow { label: string; value: string; color?: string; muted?: boolean }

export function tooltipShell(tk: ChartTokens, title: string, rows: TooltipRow[]): string {
    const head = `<div style="color:${tk.textDim};font-size:11px;margin-bottom:6px">${escapeHtml(title)}</div>`;
    const body = rows.map(r => {
        const key = r.color
            ? `<span style="display:inline-block;width:14px;height:2px;background:${r.color};vertical-align:middle;margin-right:7px;border-radius:1px"></span>`
            : '<span style="display:inline-block;width:14px;margin-right:7px"></span>';
        const dim = r.muted ? tk.textFaint : tk.textDim;
        // Value leads: it is the high-contrast element, the name is secondary.
        return `<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;line-height:1.75">`
            + `<span style="color:${dim};font-size:11.5px;white-space:nowrap">${key}${escapeHtml(r.label)}</span>`
            + `<span style="color:${tk.text};font-family:${tk.mono};font-weight:600;white-space:nowrap">${escapeHtml(r.value)}</span>`
            + `</div>`;
    }).join('');
    return head + body;
}

// ---- Series primitives --------------------------------------------------
// The bid/ask pair: one hue per venue, the bid sharp and solid at full
// strength, the ask softer and dashed. Colour carries the venue; weight and
// dash carry the side. The legend names both halves.
export function bidLine(code: string, data: unknown[], tk: ChartTokens, opts: { side?: string; endLabel?: boolean } = {}): any {
    const color = providerColor(code);
    // The same solid line means "bid" on raw prices and "sell net" once fees
    // are priced in, so the side name is passed in.
    const side = opts.side || t('stats.side.bid');
    return {
        id: `${code}:${side}`,
        name: `${providerLabel(code)} · ${side}`,
        type: 'line',
        data,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 8,
        connectNulls: false,
        sampling: 'lttb',
        z: 3,
        lineStyle: { color, width: 2, type: 'solid', opacity: 1 },
        itemStyle: { color, borderColor: tk.surface, borderWidth: 2 },
        emphasis: { focus: 'series', lineStyle: { width: 2.6 } },
        // Venues sit within a fraction of a percent of each other, so shift
        // endpoint labels apart rather than hiding them.
        labelLayout: { moveOverlap: 'shiftY' },
        endLabel: opts.endLabel ? {
            show: true,
            color,
            fontFamily: tk.mono,
            fontSize: 10.5,
            distance: 6,
            formatter: () => providerLabel(code),
        } : { show: false },
    };
}

export function askLine(code: string, data: unknown[], tk: ChartTokens, opts: { side?: string } = {}): any {
    const soft = providerColorSoft(code, 0.6);
    const side = opts.side || t('stats.side.ask');
    return {
        id: `${code}:${side}`,
        name: `${providerLabel(code)} · ${side}`,
        type: 'line',
        data,
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 8,
        connectNulls: false,
        sampling: 'lttb',
        z: 2,
        lineStyle: { color: soft, width: 1.5, type: [5, 4] },
        itemStyle: { color: soft, borderColor: tk.surface, borderWidth: 2 },
        emphasis: { focus: 'series', lineStyle: { width: 2.2 } },
    };
}

// ---- Mounting -----------------------------------------------------------

export interface ChartEmpty { message: string; hint?: string }

/**
 * A chart that owns its container: it resizes with it, swaps between the
 * canvas and an empty state, and is held at reduced opacity while `loading`
 * (the frame stays, so there is no skeleton flash and no layout jump).
 *
 * `option` null means "show the empty state". Build the option in a useMemo
 * that depends on useChartTokens(), so theme and language changes rebuild it.
 * The option is applied with notMerge: series counts change as providers are
 * toggled, and a merge would leave the removed ones painted.
 */
export function EChart({ option, empty, loading, className = 'chart-box', onInit }: {
    option: any | null;
    empty?: ChartEmpty | null;
    loading?: boolean;
    className?: string;
    onInit?: (chart: echarts.ECharts) => void;
}) {
    const boxRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<echarts.ECharts | null>(null);
    const show = Boolean(option);

    useEffect(() => {
        if (!show || !hostRef.current) return;
        if (!chartRef.current) {
            chartRef.current = echarts.init(hostRef.current, null, { renderer: 'canvas' });
            onInit?.(chartRef.current);
        }
        chartRef.current.setOption(option, { notMerge: true });
        chartRef.current.resize();
    }, [option, show, onInit]);

    useEffect(() => {
        const box = boxRef.current;
        if (!box) return undefined;
        const ro = new ResizeObserver(() => { if (chartRef.current && show) chartRef.current.resize(); });
        ro.observe(box);
        return () => ro.disconnect();
    }, [show]);

    useEffect(() => () => {
        chartRef.current?.dispose();
        chartRef.current = null;
    }, []);

    return (
        <div ref={boxRef} className={`${className}${loading ? ' chart-loading' : ''}`}>
            <div ref={hostRef} className="chart-canvas" hidden={!show} />
            <div className="chart-empty" hidden={show}>
                {empty && (
                    <>
                        <span className="big">⌁</span>
                        <div>{empty.message}</div>
                        {empty.hint && <div className="chart-empty-hint">{empty.hint}</div>}
                    </>
                )}
            </div>
        </div>
    );
}

// ---- Table view ---------------------------------------------------------
// Every chart ships one: the accessibility path, the relief for the light-mode
// contrast warning on two provider hues, and the answer to "what was the
// actual number" that a tooltip can only give one hover at a time.
export interface Column<R> {
    label: string;
    key?: keyof R & string;
    render?: (row: R) => ReactNode;
    className?: (row: R) => string | undefined;
}

export function DataTable<R>({ columns, rows, limit = 500, emptyText }: {
    columns: Column<R>[];
    rows: R[];
    limit?: number;
    emptyText?: string;
}) {
    const { t: tr, format: fmt } = useI18n();
    if (!rows.length) return <div className="empty-state">{emptyText || tr('charts.tableEmpty')}</div>;
    return (
        <>
            <div className="table-scroll">
                <table className="data-table">
                    <thead>
                        <tr>{columns.map((col, i) => <th key={i}>{col.label}</th>)}</tr>
                    </thead>
                    <tbody>
                        {rows.slice(0, limit).map((row, ri) => (
                            <tr key={ri}>
                                {columns.map((col, ci) => {
                                    const cell = col.render ? col.render(row) : (col.key ? (row as any)[col.key] : null);
                                    return (
                                        <td key={ci} className={col.className ? col.className(row) || undefined : undefined}>
                                            {cell === null || cell === undefined ? '—' : cell}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length > limit && (
                <div className="summary-caption">
                    {tr('charts.tableTruncated', { limit: fmt.number(limit), total: fmt.number(rows.length) })}
                </div>
            )}
        </>
    );
}

/** A legend swatch matching the chart's marks, for use in tables and toggles. */
export function Swatch({ code, kind = 'bid' }: { code: string; kind?: 'bid' | 'ask' }) {
    useTheme();
    return (
        <span className={`series-swatch${kind === 'ask' ? ' dashed' : ''}`}
              style={{ background: kind === 'ask' ? providerColorSoft(code, 0.6) : providerColor(code) }} />
    );
}
