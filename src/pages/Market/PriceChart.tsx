// The market page's chart: TradingView Lightweight Charts candles of the market
// price with traded volume beneath, and a depth chart of the book.
//
// Lightweight Charts rather than TradingView's hosted widget: the widget only
// charts TradingView's own symbols - these Toman pairs are not among them - and
// loads its code from tradingview.com, which this dashboard's users cannot
// count on reaching. This is the same renderer, bundled, drawing our data.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineStyle, TickMarkType, createChart,
    type CandlestickData, type HistogramData, type IChartApi, type IPriceLine, type ISeriesApi,
    type MouseEventParams, type Time, type UTCTimestamp,
} from 'lightweight-charts';

import { format, useI18n } from '../../i18n';
import { EChart, baseOption, tokens, type ChartTokens } from '../../lib/charts';
import { useTheme } from '../../lib/theme';
import {
    CANDLE_INTERVALS, baseOf, fmtAsset, num, quoteLabel, sideWord,
    type Candle, type CandleInterval, type MarketController,
} from './controller';

const INTERVALS = Object.keys(CANDLE_INTERVALS) as CandleInterval[];

/**
 * The page's colours as the stylesheet has them. Read off <body>, not <html>:
 * the market page takes its buy and sell colours there (body.page-market), and
 * a canvas can only be given them as values.
 */
interface Palette extends ChartTokens { up: string; down: string; upSoft: string; downSoft: string }
function palette(): Palette {
    const css = getComputedStyle(document.body);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const tk = tokens();
    return {
        ...tk,
        text: v('--text', tk.text), textDim: v('--text-dim', tk.textDim), textFaint: v('--text-faint', tk.textFaint),
        surface: v('--surface', tk.surface), surface2: v('--surface-2', tk.surface2),
        border: v('--border', tk.border), borderSoft: v('--border-soft', tk.borderSoft),
        up: v('--green', tk.green), down: v('--red', tk.red),
        upSoft: v('--green-soft', 'rgba(14, 203, 129, 0.14)'), downSoft: v('--red-soft', 'rgba(246, 70, 93, 0.14)'),
    };
}

function usePalette(): Palette {
    const { theme } = useTheme();
    const { locale } = useI18n();
    return useMemo(() => palette(), [theme, locale]);
}

const fixed = (n: number, digits: number) => format.number(n, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function PriceChart({ m }: { m: MarketController }) {
    const { t } = useI18n();
    const s = m.s;
    return (
        <section className="panel mk-chart">
            <div className="mk-chart-head">
                <div className="mk-tabs" role="tablist">
                    {(['price', 'depth'] as const).map((tab) => (
                        <button key={tab} type="button" role="tab" aria-selected={s.chartTab === tab}
                                className={s.chartTab === tab ? 'active' : ''} onClick={() => m.setChartTab(tab)}>
                            {t(tab === 'price' ? 'market.chart.tab.price' : 'market.chart.tab.depth')}
                        </button>
                    ))}
                </div>
                {s.chartTab === 'price' && (
                    <div className="mk-intervals" role="group" aria-label={t('market.chart.interval')}>
                        {INTERVALS.map((iv) => (
                            <button key={iv} type="button" className={s.interval === iv ? 'active' : ''}
                                    aria-pressed={s.interval === iv} onClick={() => m.setCandleInterval(iv)}>
                                {t(`market.chart.interval.${iv}`)}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="mk-chart-body">
                {s.chartTab === 'price' ? <Candles m={m} /> : <Depth m={m} />}
            </div>
        </section>
    );
}

// ---- Candles ----

function Candles({ m }: { m: MarketController }) {
    const { t } = useI18n();
    const s = m.s;
    const colors = usePalette();
    const digits = m.pairDigits();
    const base = baseOf(s.symbol);

    const hostRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const linesRef = useRef<IPriceLine[]>([]);
    const lastRef = useRef<Candle | null>(null);
    const colorsRef = useRef(colors);
    colorsRef.current = colors;
    const [hover, setHover] = useState<Candle | null>(null);

    const bar = (c: Candle): CandlestickData<UTCTimestamp> => ({
        time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
    });
    const volumeBar = (c: Candle): HistogramData<UTCTimestamp> => ({
        time: c.time as UTCTimestamp, value: c.volume,
        color: c.close >= c.open ? colorsRef.current.upSoft : colorsRef.current.downSoft,
    });

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        const chart = createChart(host, {
            autoSize: true,
            crosshair: { mode: CrosshairMode.Normal },
            timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 8 },
        });
        const candles = chart.addSeries(CandlestickSeries, { borderVisible: false });
        const volume = chart.addSeries(HistogramSeries, {
            priceScaleId: 'volume', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false,
        });
        chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        candles.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.24 } });

        const onMove = (param: MouseEventParams<Time>) => {
            const c = param.time === undefined ? undefined : param.seriesData.get(candles) as CandlestickData | undefined;
            if (!c || c.open === undefined) { setHover(null); return; }
            const v = param.seriesData.get(volume) as HistogramData | undefined;
            setHover({ time: Number(c.time), open: c.open, high: c.high, low: c.low, close: c.close, volume: v ? v.value : 0 });
        };
        chart.subscribeCrosshairMove(onMove);

        chartRef.current = chart;
        candleRef.current = candles;
        volumeRef.current = volume;
        return () => {
            chart.unsubscribeCrosshairMove(onMove);
            chart.remove();
            chartRef.current = null;
            candleRef.current = null;
            volumeRef.current = null;
            linesRef.current = [];
            lastRef.current = null;
        };
    }, []);

    // Theme, language and the pair's precision: everything painted into the canvas.
    useEffect(() => {
        const chart = chartRef.current;
        if (!chart || !candleRef.current) return;
        const when = (time: Time, opts: Intl.DateTimeFormatOptions) => format.dateTime(Number(time) * 1000, opts);
        chart.applyOptions({
            layout: {
                background: { type: ColorType.Solid, color: colors.surface },
                textColor: colors.textDim,
                fontFamily: colors.mono,
                fontSize: 11,
                attributionLogo: true,
            },
            grid: { vertLines: { color: colors.borderSoft }, horzLines: { color: colors.borderSoft } },
            crosshair: {
                vertLine: { color: colors.textFaint, labelBackgroundColor: colors.surface2, style: LineStyle.Dashed },
                horzLine: { color: colors.textFaint, labelBackgroundColor: colors.surface2, style: LineStyle.Dashed },
            },
            rightPriceScale: { borderColor: colors.border },
            timeScale: {
                borderColor: colors.border,
                tickMarkFormatter: (time: Time, type: TickMarkType) => {
                    switch (type) {
                        case TickMarkType.Year: return when(time, { year: 'numeric' });
                        case TickMarkType.Month: return when(time, { month: 'short' });
                        case TickMarkType.DayOfMonth: return when(time, { day: 'numeric', month: 'short' });
                        default: return when(time, { hour: '2-digit', minute: '2-digit' });
                    }
                },
            },
            localization: {
                priceFormatter: (p: number) => fixed(p, digits),
                timeFormatter: (time: Time) => when(time, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
            },
        });
        candleRef.current.applyOptions({
            upColor: colors.up, downColor: colors.down, wickUpColor: colors.up, wickDownColor: colors.down,
            priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits },
        });
        if (volumeRef.current && s.candles.length) volumeRef.current.setData(s.candles.map(volumeBar));
    }, [colors, digits]); // eslint-disable-line react-hooks/exhaustive-deps

    // A new pair or interval replaces the series...
    useEffect(() => {
        if (!candleRef.current || !volumeRef.current) return;
        candleRef.current.setData(s.candles.map(bar));
        volumeRef.current.setData(s.candles.map(volumeBar));
        lastRef.current = s.candles.at(-1) ?? null;
        chartRef.current?.timeScale().scrollToRealTime();
    }, [s.candleSeq]); // eslint-disable-line react-hooks/exhaustive-deps

    // ...and between those, only the newest candle moves.
    const last = s.candles.at(-1) ?? null;
    useEffect(() => {
        if (!last || last === lastRef.current || !candleRef.current || !volumeRef.current) return;
        candleRef.current.update(bar(last));
        volumeRef.current.update(volumeBar(last));
        lastRef.current = last;
    }); // eslint-disable-line react-hooks/exhaustive-deps

    // The user's open orders, as Binance draws them: a dashed line at the price.
    const orders = [...s.open.values()];
    const ordersKey = orders.map((o) => `${o.id}:${o.side}:${o.price}`).join('|');
    useEffect(() => {
        const series = candleRef.current;
        if (!series) return;
        for (const line of linesRef.current) series.removePriceLine(line);
        linesRef.current = orders.map((o) => series.createPriceLine({
            price: num(o.price),
            color: o.side === 'buy' ? colors.up : colors.down,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: sideWord(o.side),
        }));
    }, [ordersKey, colors]); // eslint-disable-line react-hooks/exhaustive-deps

    const shown = hover ?? last;
    const change = shown && shown.open ? ((shown.close - shown.open) / shown.open) * 100 : null;
    const dir = shown ? (shown.close >= shown.open ? 'mk-up' : 'mk-down') : '';

    return (
        <div className="mk-candles">
            <div ref={hostRef} className="mk-candles-host" />
            <div className="mk-ohlc" aria-hidden={!shown}>
                {shown && (
                    <>
                        <span>{format.dateTime(shown.time * 1000, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{t('market.chart.open')} <b className={dir}>{fixed(shown.open, digits)}</b></span>
                        <span>{t('market.chart.high')} <b className={dir}>{fixed(shown.high, digits)}</b></span>
                        <span>{t('market.chart.low')} <b className={dir}>{fixed(shown.low, digits)}</b></span>
                        <span>{t('market.chart.close')} <b className={dir}>{fixed(shown.close, digits)}</b></span>
                        {change !== null && <b className={dir}>{change > 0 ? '+' : ''}{format.percent(change, 2)}</b>}
                        <span>{t('market.chart.volume')} <b>{fmtAsset(shown.volume, base)}</b></span>
                    </>
                )}
            </div>
            {s.candlesLoading && <div className="mk-chart-note">{t('market.chart.loading')}</div>}
            {!s.candlesLoading && s.candlesLoaded && !s.candles.length && (
                <div className="mk-chart-note">{t('market.chart.empty')}</div>
            )}
        </div>
    );
}

// ---- Depth ----

function Depth({ m }: { m: MarketController }) {
    const { t } = useI18n();
    const s = m.s;
    const colors = usePalette();
    const digits = m.pairDigits();
    const base = baseOf(s.symbol);
    const d = s.depth;

    const option = useMemo(() => {
        if (!d || (!d.bids?.length && !d.asks?.length)) return null;
        const cumulative = (levels: any[]) => {
            let total = 0;
            return levels.slice(0, 120).map((l) => [num(l.price), (total += num(l.quantity))]);
        };
        const bids = cumulative(d.bids || []).reverse();
        const asks = cumulative(d.asks || []);
        const o = baseOption(colors, { xType: 'value', legend: false });
        o.animation = false;
        o.grid = { ...o.grid, top: 16, left: 10, right: 10, bottom: 6 };
        o.xAxis = {
            ...o.xAxis, scale: true, min: 'dataMin', max: 'dataMax',
            axisLabel: { ...o.xAxis.axisLabel, fontFamily: colors.mono, formatter: (v: number) => fixed(v, digits) },
        };
        o.yAxis = {
            ...o.yAxis, position: 'right',
            axisLabel: { ...o.yAxis.axisLabel, formatter: (v: number) => format.number(v, { notation: 'compact', maximumFractionDigits: 2 }) },
        };
        o.tooltip = {
            ...o.tooltip,
            formatter: (params: any[]) => {
                const p = params.find((x) => x.value) ?? params[0];
                if (!p) return '';
                const [price, total] = p.value;
                return `${t('market.chart.depth.price')}: <b>${fixed(price, digits)}</b> ${quoteLabel()}<br>`
                    + `${t('market.chart.depth.total')}: <b>${fmtAsset(total, base)}</b> ${base}`;
            },
        };
        const side = (name: string, data: number[][], color: string, soft: string, step: 'start' | 'end') => ({
            name, type: 'line', step, data, showSymbol: false,
            lineStyle: { color, width: 1.5 }, itemStyle: { color }, areaStyle: { color: soft },
        });
        o.series = [
            side(t('market.chart.depth.bids'), bids, colors.up, colors.upSoft, 'start'),
            side(t('market.chart.depth.asks'), asks, colors.down, colors.downSoft, 'end'),
        ];
        return o;
    }, [d, colors, digits, base, t]);

    return (
        <EChart option={option} className="chart-box mk-depth"
                empty={{ message: t(d ? 'market.book.empty' : 'market.book.waiting') }} />
    );
}
