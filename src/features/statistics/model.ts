// Statistics page model: the fee model, the crossing test, the threshold sweep
// and every chart option builder. Each chart owns only its data and its axis
// meaning - chrome, colour and formatting come from lib/charts and lib/ui.
import { format, plural, t } from '../../i18n';
import {
    askLine, axisTitles, baseOption, bidLine, fmtClock, fmtDateTime, fmtInt, fmtPct, fmtPrice, fmtQty, fmtToman,
    tooltipShell, type ChartTokens, type TooltipRow,
} from '../../shared/charts/charts';
import { providerColor, providerLabel, providerSlot, withAlpha } from '../../shared/lib';

export type Range = '1h' | '6h' | '24h' | '7d' | 'all';
export type PriceMode = 'effective' | 'raw';
export type OppMetric = 'pct' | 'net';
export type OppShape = 'points' | 'lines';
export type DeltaMetric = 'cumulative' | 'average' | 'volume' | 'capital';

// How far back each range preset reaches, mirroring the server's own
// historyRanges so the two can't disagree about what "24H" means. Null is
// "all", where the server starts at the oldest row it has.
export const RANGE_MS: Record<Range, number | null> = {
    '1h': 3600e3,
    '6h': 6 * 3600e3,
    '24h': 24 * 3600e3,
    '7d': 7 * 24 * 3600e3,
    'all': null,
};

// Shapes distinguish the sell venue on the opportunities chart. A second
// channel beside hue, so a route is identifiable without relying on colour
// alone - and the reason the chart can show more routes than there are hues.
const SELL_SHAPES = ['circle', 'triangle', 'diamond', 'roundRect', 'pin', 'arrow', 'rect', 'none'];

// Past this many routes the tail folds into one neutral "Other" series rather
// than inventing hues or shapes that can't be told apart.
const MAX_ROUTES = 8;

export interface StatsData {
    loaded: boolean;
    history: any | null;
    projections: any[];
    projectionTotal: number;
    projectionTruncated: boolean;
}

export interface ModelState {
    data: StatsData;
    limits: any | null;
    // null until the provider list arrives; then a Set of enabled codes.
    enabled: Set<string> | null;
    showBid: boolean;
    showAsk: boolean;
    priceMode: PriceMode;
    oppMetric: OppMetric;
    oppShape: OppShape;
    realOnly: boolean;
    deltaMetric: DeltaMetric;
}

export interface SweepPoint {
    threshold: number;
    count: number; placeableCount: number;
    total: number; placeableTotal: number;
    gross: number; placeableGross: number;
    volume: number; placeableVolume: number;
    deployed: number; placeableDeployed: number;
    avg: number; placeableAvg: number;
    avgGross: number; placeableAvgGross: number;
    returnPct: number; placeableReturnPct: number;
    medianSize: number | null;
}

export interface Sweep {
    points: SweepPoint[];
    breakEven: SweepPoint | null;
    knee: SweepPoint | null;
    rowCount: number;
}

interface Cross { edge: number; buy: string; sell: string; cost: number; net: number }

interface Measure {
    label: string;
    key: keyof SweepPoint;
    realKey: keyof SweepPoint;
    grossKey?: keyof SweepPoint;
    realGrossKey?: keyof SweepPoint;
    fmt: (v: number) => string;
    unit: string;
    caption: string;
}

// What the top threshold chart plots. Each measure is one unit on one axis -
// never two - so switching measure changes the axis rather than adding a
// second scale. The secondary line is the "before fees" companion where one
// exists, which is how the chart shows what a threshold *earns* next to what
// it actually *keeps*.
// `label` and `caption` are catalogue keys rather than text, so a measure
// never keeps wording captured before the language changed.
export const DELTA_MEASURES: Record<DeltaMetric, Measure> = {
    cumulative: {
        label: 'stats.threshold.label.cumulative',
        key: 'total', realKey: 'placeableTotal',
        grossKey: 'gross', realGrossKey: 'placeableGross',
        fmt: v => fmtToman(v), unit: 'T',
        caption: 'stats.threshold.caption.cumulative',
    },
    average: {
        label: 'stats.threshold.label.average',
        key: 'avg', realKey: 'placeableAvg',
        grossKey: 'avgGross', realGrossKey: 'placeableAvgGross',
        fmt: v => fmtToman(v), unit: 'T',
        caption: 'stats.threshold.caption.average',
    },
    volume: {
        label: 'stats.threshold.label.volume',
        key: 'volume', realKey: 'placeableVolume',
        fmt: v => fmtQty(v, 2), unit: 'USDT',
        caption: 'stats.threshold.caption.volume',
    },
    capital: {
        label: 'stats.threshold.label.capital',
        key: 'deployed', realKey: 'placeableDeployed',
        fmt: v => fmtToman(v), unit: 'T',
        caption: 'stats.threshold.caption.capital',
    },
};

export function deltaMeasure(metric: DeltaMetric): Measure {
    return DELTA_MEASURES[metric] || DELTA_MEASURES.cumulative;
}

export function rangeBounds(range: Range): { from: Date | null; to: Date | null } {
    const span = RANGE_MS[range];
    if (span === null) return { from: null, to: null };
    const to = new Date();
    return { from: new Date(to.getTime() - span), to };
}

function median(values: number[]): number | null {
    if (!values.length) return null;
    const s = values.slice().sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const nearest = (points: SweepPoint[], x: number) => points.reduce((best, cur) =>
    Math.abs(cur.threshold - x) < Math.abs(best.threshold - x) ? cur : best, points[0]);

export function routeKey(p: any): string { return p.buy_provider + '→' + p.sell_provider; }

// A detection is *real* when it could actually have been traded: the projected
// order cleared both venues' minimum order quantity, and the money left over
// after both commissions was positive.
//
// Both halves are needed. A row's scored edge clearing MinProfitPct does not
// make its net positive - the net is computed at the projected size, where
// walking down the book for the quantity can cost more than the edge was
// worth. And an order no venue would accept is arithmetic, not an
// opportunity, however good its percentage looks.
export function isReal(p: any): boolean {
    return p.placeable === true && p.net_profit > 0;
}

export function makeModel(s: ModelState) {
    const { data, limits } = s;

    function isEnabled(code: unknown): boolean {
        const key = String(code || '').toLowerCase();
        return !s.enabled || s.enabled.has(key);
    }

    // ------------------------------------------------------------- fee model
    //
    // A quoted price is not what a trade costs. Buying lifts the ask and pays a
    // commission on top of it; selling hits the bid and pays a commission out of
    // it. So the price that decides whether anything is worth doing is:
    //
    //     buy cost  = ask * (1 + buyFee%)     what one USDT actually costs
    //     sell net  = bid * (1 - sellFee%)    what one USDT actually returns
    //
    // These are the same two expressions the executor scores routes with
    // (arbitrage.profitPctOf), which is what makes a crossing on the chart mean
    // the same thing as an opportunity in the bot. Fees are a percentage of each
    // leg's traded value, so the per-unit figures above are independent of order
    // size; size decides whether a quote is *reachable*, not what it costs.

    function feeFor(code: unknown): number {
        const key = String(code || '').toLowerCase();
        if (limits && Array.isArray(limits.providers)) {
            const hit = limits.providers.find((p: any) => String(p.provider).toLowerCase() === key);
            if (hit && isFinite(hit.fee_pct)) return hit.fee_pct;
        }
        // The server's own default for an unmapped venue - the highest rate in
        // its table, so an unknown venue is assumed expensive rather than free.
        return (limits && isFinite(limits.default_fee_pct)) ? limits.default_fee_pct : 0.30;
    }

    function minQtyFor(code: unknown): number | null {
        const key = String(code || '').toLowerCase();
        if (limits && Array.isArray(limits.providers)) {
            const hit = limits.providers.find((p: any) => String(p.provider).toLowerCase() === key);
            if (hit && isFinite(hit.min_order_qty)) return hit.min_order_qty;
        }
        return null;
    }

    const buyCost = (ask: number, code: unknown) => (ask > 0 ? ask * (1 + feeFor(code) / 100) : null);
    const sellNet = (bid: number, code: unknown) => (bid > 0 ? bid * (1 - feeFor(code) / 100) : null);

    const effective = s.priceMode === 'effective' && !!limits;

    // The two halves of a venue's quote, in whichever mode is showing. `strong`
    // is the one drawn solid (what you receive), `soft` the dashed one (what you
    // pay) - the sell side stays the sharp line in both modes, so the styling
    // rule doesn't flip meaning when the mode does.
    function quoteOf(point: any, code: unknown): { strong: number | null; soft: number | null } {
        if (effective) {
            return { strong: sellNet(point.bid, code), soft: buyCost(point.ask, code) };
        }
        return { strong: point.bid > 0 ? point.bid : null, soft: point.ask > 0 ? point.ask : null };
    }

    function sideLabels() {
        return effective
            ? { strong: t('stats.side.sellNet'), soft: t('stats.side.buyCost') }
            : { strong: t('stats.side.bid'), soft: t('stats.side.ask') };
    }

    const allSeries: any[] = (data.history && data.history.series) || [];
    const visibleSeries = allSeries.filter(x => isEnabled(x.provider));

    // ------------------------------------------------- 1. bid & ask over time

    // Where a real arbitrage existed, bucket by bucket.
    //
    // Real means fee-inclusive: the best sell-net on one venue above the cheapest
    // buy-cost on another. On raw prices this test is meaningless - venues quoting
    // the same asset cross constantly by less than the ~0.5% round trip costs -
    // which is exactly why the chart defaults to the fee-inclusive view.
    //
    // Reachability is checked too: a level whose resting size is below the venue's
    // own minimum order quantity is a price nobody can trade at, so it cannot open
    // an opportunity. A size of zero is "depth unknown" (see domain.Ticker), not
    // an empty book, so it is allowed through rather than treated as unreachable.
    function crossings(visible: any[]): Array<{ time: string; best: Cross | null }> {
        const byTime = new Map<string, Array<{ code: string; p: any }>>();
        visible.forEach(x => (x.points || []).forEach((p: any) => {
            if (!byTime.has(p.t)) byTime.set(p.t, []);
            byTime.get(p.t)!.push({ code: x.provider, p });
        }));

        const reachable = (size: number | null | undefined, code: string) => {
            const floor = minQtyFor(code);
            if (size === null || size === undefined || size <= 0) return true; // unknown depth
            if (floor === null) return true;
            return size >= floor;
        };

        return Array.from(byTime.entries())
            .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
            .map(([time, quotes]) => {
                const found: { best: Cross | null } = { best: null };
                quotes.forEach(buy => {
                    const cost = buyCost(buy.p.ask, buy.code);
                    if (!cost || !reachable(buy.p.ask_size, buy.code)) return;
                    quotes.forEach(sell => {
                        if (sell.code === buy.code) return;
                        const net = sellNet(sell.p.bid, sell.code);
                        if (!net || !reachable(sell.p.bid_size, sell.code)) return;
                        const edge = (net - cost) / cost * 100;
                        if (!found.best || edge > found.best.edge) {
                            found.best = { edge, buy: buy.code, sell: sell.code, cost, net };
                        }
                    });
                });
                return { time, best: found.best };
            });
    }

    // Contiguous runs of buckets that carried a positive edge, merged into ranges
    // so the chart shades a window rather than a picket fence of single buckets.
    function crossWindows(crosses: ReturnType<typeof crossings>) {
        const windows: Array<{ from: string; to: string; peak: number }> = [];
        let open: { from: string; to: string; peak: number } | null = null;
        crosses.forEach(c => {
            const on = !!c.best && c.best.edge > 0;
            if (on && !open) open = { from: c.time, to: c.time, peak: c.best!.edge };
            else if (on && open) { open.to = c.time; open.peak = Math.max(open.peak, c.best!.edge); }
            else if (open) { windows.push(open); open = null; }
        });
        if (open) windows.push(open);
        return windows;
    }

    function buildPriceOption(tokens: ChartTokens): any | null {
        const visible = visibleSeries;
        if (!visible.length) return null;

        const labels = sideLabels();
        const out: any[] = [];
        visible.forEach(x => {
            const points = x.points || [];
            const pairs = points.map((p: any) => ({ t: p.t, q: quoteOf(p, x.provider) }));
            if (s.showBid) {
                out.push(bidLine(x.provider,
                    pairs.map((y: any) => [y.t, y.q.strong]), tokens,
                    // Direct endpoint labels only when the ask lines aren't also
                    // competing for that margin, and only up to a count where
                    // they don't collide.
                    { endLabel: visible.length <= 5, side: labels.strong }));
            }
            if (s.showAsk) {
                out.push(askLine(x.provider, pairs.map((y: any) => [y.t, y.q.soft]), tokens,
                    { side: labels.soft }));
            }
        });
        if (!out.length) return null;

        const option = baseOption(tokens, { xType: 'time' });
        option.series = out;
        option.grid.right = (s.showBid && visible.length <= 5) ? 78 : 20;
        option.yAxis.axisLabel.formatter = (v: number) => fmtPrice(v);

        // Shade the windows where a fee-inclusive crossing actually existed. Only
        // in effective mode, and only when both sides are drawn: a crossing the
        // reader cannot see both halves of is an unexplained stripe.
        const crosses = effective ? crossings(visible) : [];
        const windows = (effective && s.showBid && s.showAsk) ? crossWindows(crosses) : [];
        if (windows.length && windows.length <= 400 && out.length) {
            out[0].markArea = {
                silent: true,
                itemStyle: { color: withAlpha(tokens.green, 0.13) },
                emphasis: { disabled: true },
                data: windows.map(w => [
                    { xAxis: new Date(w.from).getTime() },
                    { xAxis: new Date(w.to).getTime() },
                ]),
            };
            // The bands mean something, so they are named in the legend rather
            // than left as an unexplained wash the note has to account for. An
            // empty series purely to claim the legend entry; green is the status
            // colour for "good" here, which is what the band actually says.
            out.push({
                name: t('stats.price.arbWindow', { count: format.number(windows.length) }),
                type: 'line',
                data: [],
                silent: true,
                itemStyle: { color: withAlpha(tokens.green, 0.45) },
                lineStyle: { color: withAlpha(tokens.green, 0.45), width: 8 },
                symbol: 'none',
            });
        }

        const crossAt = new Map(crosses.map(c => [new Date(c.time).getTime(), c.best]));

        // One tooltip listing every series at that x, so the pointer never has to
        // land on a line to read it.
        option.tooltip.formatter = (params: any[]) => {
            if (!params || !params.length) return '';
            const rows: TooltipRow[] = params
                .filter(p => p.value && p.value[1] !== null && p.value[1] !== undefined)
                .map(p => ({ color: p.color, label: p.seriesName, value: fmtPrice(p.value[1]) + ' T' }));
            if (!rows.length) return '';

            // The reason the fee-inclusive view exists: say outright whether the
            // venues on screen were crossing at this moment, and by how much.
            const best = crossAt.get(new Date(params[0].value[0]).getTime());
            if (best) {
                const route = `${providerLabel(best.buy)} → ${providerLabel(best.sell)}`;
                rows.push({
                    label: t(best.edge > 0 ? 'stats.price.arbRoute' : 'stats.price.bestRoute', { route }),
                    value: (best.edge > 0 ? '+' : '') + fmtPct(best.edge, 3),
                    muted: best.edge <= 0,
                });
            }
            return tooltipShell(tokens, fmtDateTime(params[0].value[0]), rows);
        };

        // Zoom is part of reading a price series: the interesting move is usually
        // a few minutes wide inside a range measured in days.
        option.dataZoom = [
            { type: 'inside', throttle: 60 },
            {
                type: 'slider', height: 18, bottom: 0,
                borderColor: 'transparent',
                backgroundColor: tokens.surface2,
                fillerColor: withAlpha(tokens.accent, 0.12),
                handleStyle: { color: tokens.border, borderColor: tokens.textFaint },
                moveHandleStyle: { color: tokens.border },
                dataBackground: { lineStyle: { color: tokens.borderSoft }, areaStyle: { color: 'transparent' } },
                selectedDataBackground: { lineStyle: { color: tokens.textFaint }, areaStyle: { color: 'transparent' } },
                textStyle: { color: tokens.textFaint, fontSize: 10 },
                labelFormatter: (v: number) => fmtClock(v),
            },
        ];
        option.grid.bottom = 30;

        // Last, so the margin it reserves survives - see lib/charts.
        axisTitles(option, tokens, {
            y: t(effective ? 'stats.price.axisY.effective' : 'stats.price.axisY.raw'),
            x: t('stats.price.axisX'),
        });
        return option;
    }

    // One row per bucket, one column pair per venue: the numbers behind the
    // lines, which is also the relief the light-mode palette requires.
    function priceTableRows(): Array<{ t: string; byProvider: Record<string, any> }> {
        const buckets = new Map<string, Record<string, any>>();
        visibleSeries.forEach(x => (x.points || []).forEach((p: any) => {
            if (!buckets.has(p.t)) buckets.set(p.t, {});
            buckets.get(p.t)![x.provider] = p;
        }));
        return Array.from(buckets.entries())
            .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
            .map(([time, byProvider]) => ({ t: time, byProvider }));
    }

    // ------------------------------------------- 2. opportunities over time

    function inScope(p: any): boolean {
        return isEnabled(p.buy_provider) && isEnabled(p.sell_provider);
    }

    // What the opportunity chart reads. The realOnly filter is applied here
    // rather than per chart, so views of it can never describe different sets.
    function visibleProjections(): any[] {
        const scoped = data.projections.filter(inScope);
        return s.realOnly ? scoped.filter(isReal) : scoped;
    }

    // How many in-scope detections the realOnly filter is holding back, so the
    // count is stated rather than silently missing.
    function excludedCount(): number {
        if (!s.realOnly) return 0;
        return data.projections.filter(p => inScope(p) && !isReal(p)).length;
    }

    function buildOppOption(tokens: ChartTokens): any | null {
        const rows = visibleProjections();
        if (!rows.length) return null;

        const byRoute = new Map<string, any[]>();
        rows.forEach(p => {
            const key = routeKey(p);
            if (!byRoute.has(key)) byRoute.set(key, []);
            byRoute.get(key)!.push(p);
        });

        // Busiest routes keep their own identity; the tail folds into one neutral
        // series rather than being given a hue that can't be distinguished.
        const ranked = Array.from(byRoute.entries()).sort((a, b) => b[1].length - a[1].length);
        const kept = ranked.slice(0, MAX_ROUTES);
        const folded = ranked.slice(MAX_ROUTES);

        const isPct = s.oppMetric === 'pct';
        const valueOf = (p: any) => (isPct ? p.scored_profit_pct : p.net_profit);
        const asLines = s.oppShape === 'lines';

        const series: any[] = kept.map(([, points]) => {
            const buy = points[0].buy_provider;
            const sell = points[0].sell_provider;
            const color = providerColor(buy);
            const shape = SELL_SHAPES[providerSlot(sell) % SELL_SHAPES.length];
            return {
                name: providerLabel(buy) + ' → ' + providerLabel(sell),
                type: asLines ? 'line' : 'scatter',
                symbol: shape === 'none' ? 'circle' : shape,
                symbolSize: asLines ? 6 : 9,
                showSymbol: true,
                data: points.map(p => ({
                    value: [p.detected_at, valueOf(p)],
                    raw: p,
                })),
                lineStyle: asLines ? { color, width: 1.6, type: 'solid', opacity: 0.9 } : undefined,
                // A 2px surface ring, so overlapping marks stay countable.
                itemStyle: { color, borderColor: tokens.surface, borderWidth: 2, opacity: 0.95 },
                emphasis: { focus: 'series', scale: 1.25 },
                z: 3,
            };
        });

        if (folded.length) {
            const foldedPoints = folded.flatMap(([, pts]) => pts);
            series.push({
                name: plural('stats.opp.other', folded.length, { count: format.number(folded.length) }),
                type: 'scatter',
                symbol: 'circle',
                symbolSize: 7,
                data: foldedPoints.map(p => ({ value: [p.detected_at, valueOf(p)], raw: p })),
                itemStyle: { color: tokens.textFaint, borderColor: tokens.surface, borderWidth: 2, opacity: 0.8 },
                z: 2,
            });
        }

        const option = baseOption(tokens, { xType: 'time' });
        option.series = series;
        // The percent sign goes on the tick itself, not only in the title: a
        // column of bare "0.20"s is the thing that made this chart unreadable.
        option.yAxis.axisLabel.formatter = (v: number) => (isPct ? v.toFixed(2) + '%' : fmtToman(v));

        // The threshold the bot actually trades at, so a mark below the line is
        // visibly an opportunity that was never eligible.
        if (isPct && limits) {
            option.series.push({
                name: t('stats.opp.threshold', { value: fmtPct(limits.min_profit_pct, 2) }),
                type: 'line',
                data: [],
                markLine: {
                    silent: true,
                    symbol: 'none',
                    label: { show: false },
                    lineStyle: { color: tokens.textFaint, width: 1, type: [4, 4] },
                    data: [{ yAxis: limits.min_profit_pct }],
                },
            });
        }

        // Marks are the hit target here, not an x-crosshair: each point is a
        // discrete detection with its own route, size and outcome to report.
        option.tooltip.trigger = 'item';
        option.tooltip.axisPointer = undefined;
        option.tooltip.formatter = (p: any) => {
            const r = p.data && p.data.raw;
            if (!r) return '';
            const rows: TooltipRow[] = [
                { color: p.color, label: t('common.route'), value: `${providerLabel(r.buy_provider)} → ${providerLabel(r.sell_provider)}` },
                { label: t('stats.opp.tip.edge'), value: fmtPct(r.scored_profit_pct, 3) },
                { label: t('stats.opp.tip.net'), value: fmtToman(r.net_profit) + ' T' },
                { label: t('stats.opp.tip.buySell'), value: `${fmtPrice(r.scored_buy_price)} / ${fmtPrice(r.scored_sell_price)} T` },
                { label: t('stats.opp.tip.size'), value: fmtQty(r.projected_amount) + ' USDT' },
                {
                    label: t('stats.opp.tip.maxBook'),
                    value: t('stats.opp.tip.maxBookValue', { qty: fmtQty(r.max_amount), limit: r.limited_by }),
                },
                {
                    label: t('stats.opp.tip.placeable'),
                    value: r.placeable ? t('common.yes') : t('stats.opp.tip.notPlaceable'),
                    muted: !r.placeable,
                },
                // The outcome is the bot's own enum value and appears in its
                // logs, so it is shown verbatim rather than paraphrased.
                { label: t('common.outcome'), value: r.outcome, muted: r.outcome !== 'executed' },
            ];
            return tooltipShell(tokens, fmtDateTime(r.detected_at), rows);
        };

        option.dataZoom = [{ type: 'inside', throttle: 60 }];

        axisTitles(option, tokens, {
            y: t(isPct ? 'stats.opp.axisY.pct' : 'stats.opp.axisY.net'),
            x: t('stats.opp.axisX'),
        });
        return option;
    }

    // --------------------------------------------------- 3. threshold sweep

    // The sweep: for each candidate threshold, re-test every detection in the
    // range. Done here rather than in SQL so dragging the range is instant, and
    // because the arithmetic is a filter and a sum - nothing a database does
    // better at this row count.
    function computeSweep(): Sweep | null {
        // Deliberately the scoped set, not visibleProjections(): the whole point
        // of this chart is the gap between what was detected and what could
        // actually be traded, so it must keep both even when the opportunities
        // chart above is filtered down to the real ones.
        const rows = data.projections.filter(inScope);
        if (!rows.length) return null;

        const pcts = rows.map(r => r.scored_profit_pct).filter(v => isFinite(v));
        if (!pcts.length) return null;

        const lo = Math.min(0, Math.min(...pcts));
        const hi = Math.max(...pcts);
        // A flat span means every detection had the same edge; one point is the
        // honest answer, not a fabricated curve.
        const steps = hi > lo ? 60 : 1;
        const width = hi > lo ? (hi - lo) / steps : 0;

        const points: SweepPoint[] = [];
        for (let i = 0; i <= steps; i++) {
            const threshold = lo + width * i;
            // Five aggregates per threshold, each kept for the whole set and for
            // the real subset, because "what do I keep" is not answerable from
            // profit alone: the same profit off ten times the volume, or ten
            // times the capital, is a different proposition.
            let count = 0, placeableCount = 0;
            let total = 0, placeableTotal = 0;          // net, Toman
            let gross = 0, placeableGross = 0;          // before fees, Toman
            let volume = 0, placeableVolume = 0;        // base asset, USDT
            let deployed = 0, placeableDeployed = 0;    // capital tied up, Toman
            const sizes: number[] = [];

            rows.forEach(r => {
                if (r.scored_profit_pct < threshold) return;
                count++;
                total += r.net_profit || 0;
                gross += r.gross_profit || 0;
                volume += r.projected_amount || 0;
                deployed += r.deployed || 0;
                if (r.projected_amount > 0) sizes.push(r.projected_amount);
                // Real, not merely placeable: an order a venue would accept that
                // still loses money is not profit retained at this threshold.
                if (isReal(r)) {
                    placeableCount++;
                    placeableTotal += r.net_profit || 0;
                    placeableGross += r.gross_profit || 0;
                    placeableVolume += r.projected_amount || 0;
                    placeableDeployed += r.deployed || 0;
                }
            });

            points.push({
                threshold,
                count,
                placeableCount,
                total,
                placeableTotal,
                gross,
                placeableGross,
                volume,
                placeableVolume,
                deployed,
                placeableDeployed,
                avg: count ? total / count : 0,
                placeableAvg: placeableCount ? placeableTotal / placeableCount : 0,
                avgGross: count ? gross / count : 0,
                placeableAvgGross: placeableCount ? placeableGross / placeableCount : 0,
                // Return on the capital the buy legs would have tied up - the
                // figure that makes two thresholds with the same profit but
                // different volume comparable.
                returnPct: deployed > 0 ? total / deployed * 100 : 0,
                placeableReturnPct: placeableDeployed > 0 ? placeableTotal / placeableDeployed * 100 : 0,
                medianSize: median(sizes),
            });
        }

        // Break-even for a *threshold*: the highest one that still admits a trade
        // that was both placeable and profitable. Past it the setting earns
        // nothing, however good the spreads it keeps look.
        let breakEven: SweepPoint | null = null;
        for (let i = points.length - 1; i >= 0; i--) {
            if (points[i].placeableCount > 0) { breakEven = points[i]; break; }
        }

        // The knee: where raising the threshold starts costing more captured
        // profit than it removes trades. Marked rather than called "optimal" -
        // the curve only falls, so the choice is a risk appetite, not a maximum.
        let knee: SweepPoint | null = null;
        const first = points[0];
        if (first && first.placeableTotal > 0) {
            let bestScore = -Infinity;
            points.forEach(p => {
                const kept = p.placeableTotal / first.placeableTotal;
                const quality = first.placeableAvg > 0 ? p.placeableAvg / first.placeableAvg : 1;
                const score = kept * quality;
                if (p.placeableCount > 0 && score > bestScore) { bestScore = score; knee = p; }
            });
        }

        return { points, breakEven, knee, rowCount: rows.length };
    }

    function buildDeltaOption(tokens: ChartTokens, sweep: Sweep | null): any | null {
        if (!sweep) return null;
        const m = deltaMeasure(s.deltaMetric);
        const allKey = m.key;
        const placeableKey = m.realKey;

        const option = baseOption(tokens, { xType: 'value' });
        option.grid.top = 58; // clearance for the threshold markers' labels
        option.grid.bottom = 4;
        option.xAxis.name = '';
        option.xAxis.axisLabel.formatter = (v: number) => format.percent(v, 2);
        option.yAxis.axisLabel.formatter = m.fmt;
        option.yAxis.scale = false; // an axis that doesn't include zero misleads

        const xy = (key: keyof SweepPoint) => sweep.points.map(p => [p.threshold, p[key]]);

        const markLines: any[] = [];
        if (limits) {
            markLines.push({
                xAxis: limits.min_profit_pct,
                // At the foot of its line, not the head. This marker sits at
                // ~0.01%, hard against the y-axis, where the top of the plot is
                // already taken by the axis title - and every curve here is at
                // its highest on the left, so the bottom-left is the empty
                // corner.
                label: {
                    formatter: t('stats.threshold.mark.botSetting'),
                    color: tokens.accent,
                    fontSize: 10,
                    position: 'insideStartTop',
                    rotate: 0,
                },
                lineStyle: { color: tokens.accent, width: 1.5, type: [4, 4] },
            });
        }
        if (sweep.breakEven) {
            markLines.push({
                xAxis: sweep.breakEven.threshold,
                label: {
                    formatter: t('stats.threshold.mark.breakEven'),
                    color: tokens.textDim,
                    fontSize: 10,
                    position: 'insideEndTop',
                    rotate: 0,
                },
                lineStyle: { color: tokens.textFaint, width: 1, type: [2, 3] },
            });
        }

        option.series = [];

        // Gross sits behind net on the profit measures, so a threshold's earnings
        // and what survives its fees read off one axis in one unit. On volume and
        // capital there is no "before fees" counterpart, so the slot is skipped
        // rather than filled with a duplicate line.
        if (m.grossKey && m.realGrossKey) {
            option.series.push({
                name: t('stats.threshold.series.gross'),
                type: 'line',
                data: xy(m.realGrossKey),
                showSymbol: false,
                // Neutral ink, not amber: amber is the reserved warning colour
                // across this dashboard, and gross is a reference line rather
                // than a state. It also keeps both blue lines reading as one
                // family - the money actually kept.
                lineStyle: { color: tokens.textDim, width: 1.5, type: [5, 4] },
                itemStyle: { color: tokens.textDim },
                z: 2,
            });
        }

        const knee = sweep.knee;
        option.series.push(
            {
                name: t('stats.threshold.series.all'),
                type: 'line',
                data: xy(allKey),
                showSymbol: false,
                smooth: false,
                lineStyle: { color: withAlpha(tokens.accent, 0.45), width: 1.5, type: [2, 3] },
                itemStyle: { color: tokens.accent },
                z: 2,
            },
            {
                name: t('stats.threshold.series.real'),
                type: 'line',
                data: xy(placeableKey),
                showSymbol: false,
                lineStyle: { color: tokens.accent, width: 2 },
                itemStyle: { color: tokens.accent, borderColor: tokens.surface, borderWidth: 2 },
                // No area fill: it is a large soft block where a thin mark does
                // the job, and ECharts draws the legend swatch in the fill
                // colour, which at that alpha is invisible against the surface.
                z: 3,
                markLine: markLines.length ? { silent: true, symbol: 'none', data: markLines } : undefined,
                markPoint: knee ? {
                    symbol: 'circle',
                    symbolSize: 9,
                    itemStyle: { color: tokens.accent, borderColor: tokens.surface, borderWidth: 2 },
                    label: {
                        show: true,
                        // The knee is where *profit* stops paying for the trades
                        // it gives up. On a volume or capital axis it still marks
                        // that threshold, but calling it diminishing returns
                        // there would read as a claim about the plotted quantity.
                        formatter: t(m.grossKey ? 'stats.threshold.mark.diminishing' : 'stats.threshold.mark.knee'),
                        position: 'top',
                        color: tokens.textDim,
                        fontSize: 10,
                    },
                    data: [{ coord: [knee.threshold, knee[placeableKey]] }],
                } : undefined,
            },
        );

        option.tooltip.formatter = (params: any[]) => {
            if (!params || !params.length) return '';
            const p = nearest(sweep.points, params[0].value[0]);
            // Every measure on one hover, not just the plotted one: the question
            // is "what would this threshold have earned me", and profit without
            // the volume and capital behind it does not answer it.
            const rows: TooltipRow[] = [
                {
                    label: t('stats.threshold.tip.trades'),
                    value: t('stats.threshold.tip.tradesValue', {
                        real: fmtInt.format(p.placeableCount),
                        total: fmtInt.format(p.count),
                    }),
                },
                { label: t('stats.threshold.tip.volume'), value: fmtQty(p.placeableVolume, 2) + ' USDT', color: tokens.accent },
                { label: t('stats.threshold.tip.capital'), value: fmtToman(p.placeableDeployed) + ' T' },
                { label: t('stats.threshold.tip.gross'), value: fmtToman(p.placeableGross) + ' T', color: tokens.textDim },
                { label: t('stats.threshold.tip.net'), value: fmtToman(p.placeableTotal) + ' T', color: tokens.accent },
                { label: t('stats.threshold.tip.return'), value: fmtPct(p.placeableReturnPct, 3) },
                {
                    label: t('stats.threshold.tip.perTrade'),
                    value: t('stats.threshold.tip.perTradeValue', {
                        net: fmtToman(p.placeableAvg),
                        size: p.medianSize === null ? t('stats.threshold.tip.sizeNA') : fmtQty(p.medianSize) + ' USDT',
                    }),
                    muted: true,
                },
                {
                    label: t('stats.threshold.tip.including'),
                    value: t('stats.threshold.tip.includingValue', {
                        net: fmtToman(p.total),
                        volume: fmtQty(p.volume, 2),
                    }),
                    muted: true,
                },
            ];
            return tooltipShell(tokens, t('stats.threshold.tip.title', { value: fmtPct(p.threshold, 3) }), rows);
        };

        axisTitles(option, tokens, {
            y: t(m.label),
            x: t('stats.threshold.axisX'),
        });
        return option;
    }

    // The companion chart: order size against the floor that decides whether any
    // of the profit above is reachable. Its own chart, its own unit, one axis.
    function buildSizeOption(tokens: ChartTokens, sweep: Sweep | null): any | null {
        if (!sweep) return null;

        const floor: number = limits ? limits.strictest_min_order_qty : 0;
        const sizes = sweep.points.map(p => [p.threshold, p.medianSize]);
        const known = sizes.filter(x => x[1] !== null);
        if (!known.length) return null;

        const option = baseOption(tokens, { xType: 'value', legend: true, legendTop: 0 });
        option.grid.top = 34;
        option.grid.bottom = 4;
        option.xAxis.axisLabel.formatter = (v: number) => format.percent(v, 2);
        option.yAxis.axisLabel.formatter = (v: number) => fmtQty(v, 2);
        option.yAxis.min = 0;

        const series: any[] = [{
            name: t('stats.size.series'),
            type: 'line',
            data: sizes,
            showSymbol: false,
            connectNulls: false,
            lineStyle: { color: tokens.textDim, width: 2 },
            itemStyle: { color: tokens.textDim },
            z: 3,
        }];

        // The floor as a band rather than a second y-axis: same unit as the line
        // it constrains, so the comparison is real. Anything inside the band is
        // an order no venue on the route would accept.
        if (floor > 0) {
            series[0].markArea = {
                silent: true,
                itemStyle: { color: withAlpha(tokens.amber, 0.1) },
                // No label on the band itself: when the size range is wide the
                // band is a sliver and its label lands on the rule above it. The
                // markLine below carries the whole fact in one place.
                label: { show: false },
                data: [[{ yAxis: 0 }, { yAxis: floor }]],
            };
            series[0].markLine = {
                silent: true,
                symbol: 'none',
                label: {
                    show: true,
                    formatter: limits.strictest_provider
                        ? t('stats.size.minOrder', {
                            qty: fmtQty(floor),
                            provider: providerLabel(limits.strictest_provider),
                        })
                        : t('stats.size.minOrderPlain', { qty: fmtQty(floor) }),
                    color: tokens.amber,
                    fontSize: 10,
                    position: 'insideEndTop',
                },
                lineStyle: { color: tokens.amber, width: 1.5, type: 'solid' },
                data: [{ yAxis: floor }],
            };
        }

        option.series = series;
        option.tooltip.formatter = (params: any[]) => {
            if (!params || !params.length) return '';
            const p = nearest(sweep.points, params[0].value[0]);
            const rows: TooltipRow[] = [
                {
                    label: t('stats.size.tip.median'),
                    value: p.medianSize === null ? t('common.na') : fmtQty(p.medianSize) + ' USDT',
                    color: tokens.textDim,
                },
            ];
            if (floor > 0) {
                rows.push({ label: t('stats.size.tip.strictest'), value: fmtQty(floor) + ' USDT', muted: true });
                if (p.medianSize !== null) {
                    rows.push({
                        label: t('stats.size.tip.actionable'),
                        value: p.medianSize >= floor ? t('common.yes') : t('stats.size.tip.underMinimum'),
                        muted: p.medianSize < floor,
                    });
                }
            }
            return tooltipShell(tokens, t('stats.threshold.tip.title', { value: fmtPct(p.threshold, 3) }), rows);
        };

        axisTitles(option, tokens, {
            y: t('stats.size.axisY'),
            x: t('stats.threshold.axisX'),
        });
        return option;
    }

    return {
        effective,
        visibleSeries,
        quoteOf,
        sideLabels,
        buildPriceOption,
        priceTableRows,
        visibleProjections,
        excludedCount,
        buildOppOption,
        computeSweep,
        buildDeltaOption,
        buildSizeOption,
    };
}

export type Model = ReturnType<typeof makeModel>;
