import { useEffect, useRef, useState, type ReactNode } from 'react';

import { usePageStatus } from '../components/Layout';
import { format, plural, t, useI18n } from '../i18n';
import { API_BASE, fetchJSON } from '../lib/api';
import { renderJSON } from './RequestLogs/renderJSON';
import Template from '../components/Template';

type Filter = 'all' | 'attention' | 'clean';
const FILTERS: Filter[] = ['all', 'attention', 'clean'];

const isBlank = (v: unknown) => v === null || v === undefined;

// Prices run to the whole Toman and amounts to 8 decimals, and the entire
// point of the page is spotting a small divergence between two columns - so
// values are shown at full precision rather than rounded to a
// thousands-separated summary the way the other pages show them.
function fmtValText(v: unknown, unit: string): string {
    if (isBlank(v)) return t('audit.notReported');
    const decimals = unit === 'USDT' ? 8 : 2;
    return format.number(v as number, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function fmtVal(v: unknown, unit: string): ReactNode {
    if (isBlank(v)) return <span className="audit-missing">{t('audit.notReported')}</span>;
    return fmtValText(v, unit);
}

// A row is judged by the audit's own verdict, never by the sign of its
// difference: an exchange reporting more than we recorded is no better news
// than one reporting less, so direction gets no colour of its own.
// Differences that only exist past the display precision count as equal.
function fieldState(field: any, leg: any): string {
    if (isBlank(field.exchange) || isBlank(field.diff)) return 'missing';
    if (field.mismatch) return 'bad';
    const pct = isBlank(field.diff_pct) ? null : Math.abs(field.diff_pct);
    if (field.diff === 0 || (pct !== null && pct < 0.0001)) return 'ok';
    if (!leg.terminal && (field.field === 'executed_amount' || field.field === 'quote_total')) return 'open';
    return 'near';
}

function fmtPct(pct: number | null | undefined): string {
    if (isBlank(pct)) return '';
    const n = pct as number;
    const sign = n > 0 ? '+' : '';
    if (n !== 0 && Math.abs(n) < 0.01) return `${n > 0 ? '+' : '−'}<${format.percent(0.01, 2)}`;
    return sign + format.percent(n, 2);
}

const MARK_OK = <span className="audit-mark ok">✓</span>;
const MARK_NEAR = <span className="audit-mark near">≈</span>;
const MARK_BAD = <span className="audit-mark bad">✕</span>;
const MISSING = <span className="audit-missing">—</span>;

function fmtCheck(field: any, state: string): ReactNode {
    if (state === 'missing') return MISSING;
    if (state === 'ok') return MARK_OK;
    const sign = field.diff > 0 ? '+' : '';
    const diff = <>{sign}{fmtVal(field.diff, field.unit)} <span className="audit-pct">{fmtPct(field.diff_pct)}</span></>;
    if (state === 'bad') return <>{MARK_BAD} <span className="audit-diff bad">{diff}</span></>;
    if (state === 'open') return <span className="audit-diff dim" title={t('audit.openExpected')}>{diff}</span>;
    return <>{MARK_NEAR} <span className="audit-diff dim">{diff}</span></>;
}

function fieldLabel(name: string): string {
    const key = `audit.field.${name}`;
    const label = t(key);
    return label === key ? name.replace(/_/g, ' ') : label;
}

function statusBadge(text: string, cls: string): ReactNode {
    return <span className={`status-badge ${cls}`}>{text}</span>;
}

function needsAttention(trade: any): boolean {
    return trade.mismatch_count > 0 || !(trade.buy && trade.buy.verified) || !(trade.sell && trade.sell.verified);
}

// Which asset an exchange bills its commission in decides which balance the
// cost lands on, so it is shown rather than folded into one number.
function feeLine(leg: any): ReactNode {
    if (!leg.fee_measured) {
        return leg.verified ? <> · <span className="fee-text">{t('audit.feeNotReported')}</span></> : null;
    }
    const parts: string[] = [];
    if (leg.fee_quote) parts.push(`${fmtValText(leg.fee_quote, 'IRT')} IRT`);
    if (leg.fee_base) parts.push(`${fmtValText(leg.fee_base, 'USDT')} USDT`);
    if (!parts.length) parts.push(format.number(0));
    return <> · <span className="fee-text">{t('audit.feeCharged', { parts: parts.join(' + ') })}</span></>;
}

// Status is compared like any other field - first, since it decides how every
// row under it should be read.
function StatusRow({ leg }: { leg: any }) {
    useI18n();
    const recorded = leg.recorded_status || t('common.unknown');
    if (!leg.verified) {
        return (
            <tr className="audit-row-missing">
                <td>{t('audit.field.status')}</td>
                <td>{recorded}</td>
                <td><span className="audit-missing">{t('audit.notVerified')}</span></td>
                <td>{MISSING}</td>
            </tr>
        );
    }
    const exchange = leg.exchange_status || t('common.unknown');
    const bad = leg.status_mismatch || leg.status_stale;
    const same = !bad && String(leg.recorded_status || '').toLowerCase() === String(exchange).toLowerCase();
    const showRaw = leg.exchange_raw_status && leg.exchange_raw_status.toLowerCase() !== String(exchange).toLowerCase();
    const state = bad ? 'bad' : (same ? 'ok' : 'near');
    const check = state === 'bad' ? MARK_BAD : (state === 'ok' ? MARK_OK : MARK_NEAR);
    return (
        <tr className={`audit-row-${state}`}>
            <td>
                {t('audit.field.status')}
                {leg.status_stale && <div className="audit-note-inline">{t('audit.statusStale')}</div>}
            </td>
            <td>{recorded}</td>
            <td className="audit-exch">
                {exchange}
                {showRaw && <> <span className="audit-sub">{leg.exchange_raw_status}</span></>}
                {!leg.terminal && <> <span className="audit-sub">· {t('audit.stillOpen')}</span></>}
            </td>
            <td>{check}</td>
        </tr>
    );
}

function Leg({ leg }: { leg: any }) {
    useI18n();
    const sideClass = leg.side === 'buy' ? 'side-buy' : 'side-sell';
    const legBadge = !leg.verified
        ? statusBadge(t('audit.notVerified'), 'pending')
        : (leg.mismatch_count > 0
            ? statusBadge(plural('audit.mismatches', leg.mismatch_count), 'failed')
            : statusBadge(t('audit.matches'), 'ok'));

    return (
        <div className="audit-leg">
            <div className="audit-leg-head">
                <span className={sideClass}>{String(leg.side).toUpperCase()}</span>
                <span className="provider-tag">{leg.provider}</span>
                <span className="spacer" />
                {legBadge}
            </div>
            <div className="audit-leg-order">{t('audit.order', { id: leg.order_id ? leg.order_id : '—' })}{feeLine(leg)}</div>
            {/* A leg the exchange never answered for shows its recorded values
                with an empty exchange column and says why - never a clean-looking row. */}
            {leg.error && <div className="audit-leg-error">{leg.error}</div>}
            <table className="audit-table">
                <thead>
                    <tr>
                        <th>{t('audit.col.field')}</th>
                        <th>{t('audit.col.recorded')}</th>
                        <th>{t('audit.col.exchange')}</th>
                        <th>{t('audit.col.difference')}</th>
                    </tr>
                </thead>
                <tbody>
                    <StatusRow leg={leg} />
                    {(leg.fields || []).map((f: any, i: number) => {
                        const state = fieldState(f, leg);
                        return (
                            <tr key={`${f.field}-${i}`} className={`audit-row-${state}`}>
                                <td title={f.note || ''}>{fieldLabel(f.field)}</td>
                                <td>{fmtVal(f.recorded, f.unit)}</td>
                                <td className="audit-exch">{fmtVal(f.exchange, f.unit)}</td>
                                <td>{fmtCheck(f, state)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {leg.raw && (
                <details className="audit-raw">
                    <summary>{t('audit.rawResponse')}</summary>
                    <div className="json-view" dangerouslySetInnerHTML={{ __html: renderJSON(leg.raw) }} />
                </details>
            )}
        </div>
    );
}

function Trade({ trade, open, onToggle }: { trade: any; open: boolean; onToggle: (open: boolean) => void }) {
    useI18n();
    const profitClass = (trade.expected_profit || 0) >= 0 ? 'profit-positive' : 'profit-negative';
    // This strategy takes its profit as retained base asset, not IRT (see
    // orderaudit.measure), so the outcome only makes sense as both axes added
    // together - the IRT change alone reads as a large loss on a trade that
    // made money. Both parts stay visible.
    let realized: ReactNode = <span className="audit-missing">{t('audit.notMeasurable')}</span>;
    let breakdownLine: ReactNode = null;
    if (!isBlank(trade.realized_net)) {
        const cls = trade.realized_net >= 0 ? 'profit-positive' : 'profit-negative';
        const flowCls = trade.quote_flow_net >= 0 ? 'profit-positive' : 'profit-negative';
        const breakdown = (
            <Template template={t('audit.realizedBreakdown')} nodes={{
                flow: <span className={flowCls}>{fmtVal(trade.quote_flow_net, 'IRT')}</span>,
                base: fmtVal(trade.retained_base, 'USDT'),
                value: fmtVal(trade.retained_base_value, 'IRT'),
                fees: fmtVal(trade.modeled_fees, 'IRT'),
                feeLabel: t(trade.fees_measured ? 'audit.feesLabel' : 'audit.feesModeled'),
            }} />
        );
        realized = <span className={cls}>{fmtVal(trade.realized_net, 'IRT')}</span>;
        breakdownLine = <span>{t('audit.realized')} <span className={cls}>{fmtVal(trade.realized_net, 'IRT')}</span> {breakdown}</span>;
    }

    const attention = needsAttention(trade);
    const verdict = trade.mismatch_count > 0
        ? statusBadge(plural('audit.mismatches', trade.mismatch_count), 'failed')
        : (attention ? statusBadge(t('audit.notVerified'), 'pending') : statusBadge(t('audit.matches'), 'ok'));
    const statusCls = trade.status === 'completed' ? 'completed' : (trade.status === 'failed' ? 'failed' : 'pending');
    const venue = (leg: any) => (leg && leg.provider) || '—';

    return (
        <details className={`audit-trade ${trade.mismatch_count > 0 ? 'has-mismatch' : ''}`} open={open}
                 onToggle={e => { if (e.currentTarget.open !== open) onToggle(e.currentTarget.open); }}>
            <summary className="audit-trade-head">
                <span className="audit-caret" aria-hidden="true" />
                <span className="audit-time">{format.dateTime(trade.created_at)}</span>
                <span className="provider-tag">{trade.symbol}</span>
                <span className="audit-route"><span className="side-buy">{venue(trade.buy)}</span> → <span className="side-sell">{venue(trade.sell)}</span></span>
                {statusBadge(trade.status || 'pending', statusCls)}
                {trade.simulated && statusBadge(t('common.simulated'), 'simulated')}
                <span className="spacer" />
                <span className="audit-fig"><span className="audit-fig-label">{t('audit.expected')}</span><span className={profitClass}>{fmtVal(trade.expected_profit, 'IRT')}</span></span>
                <span className="audit-fig"><span className="audit-fig-label">{t('audit.realized')}</span>{realized}</span>
                {verdict}
            </summary>
            <div className="audit-legs">
                <Leg leg={trade.buy} />
                <Leg leg={trade.sell} />
            </div>
            <div className="audit-note">
                {breakdownLine}
                <span className="audit-exec-id">
                    <Template template={t('audit.execution')} nodes={{ id: <bdi>{trade.execution_id}</bdi> }} />
                </span>
            </div>
        </details>
    );
}

type View = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

export default function OrderAudit() {
    const { t, format } = useI18n();
    const status = usePageStatus();

    const [limit, setLimit] = useState('25');
    const [priceTol, setPriceTol] = useState('0.05');
    const [qtyTol, setQtyTol] = useState('0.5');
    const [simulated, setSimulated] = useState('false');
    const [unplaced, setUnplaced] = useState('false');

    // The last report, held so a language change repaints it without spending
    // two more live order lookups per trade.
    const [report, setReport] = useState<any>(null);
    const [view, setView] = useState<View>({ kind: 'idle' });
    const [running, setRunning] = useState(false);
    const [activeFilter, setActiveFilter] = useState<Filter>('all');
    // Per-trade open state; unset means the default, where clean trades start
    // folded to their summary line so what needs reading is what is left open.
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
    }, []);

    // Each run spends two live exchange lookups per trade, so it only ever
    // runs on an explicit click - never on mount, a poll, or a language change.
    async function runAudit() {
        setRunning(true);
        status.setStatus(true, t('audit.fetchingStatus'));
        setView({ kind: 'loading' });

        const params = new URLSearchParams({
            limit: limit || '25',
            include_simulated: simulated,
            include_unplaced: unplaced,
            price_tolerance_pct: priceTol || '',
            qty_tolerance_pct: qtyTol || '',
        });

        try {
            const { ok, data } = await fetchJSON(`/order-audit?${params}`);
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            if (!alive.current) return;
            setReport(data);
            setOpenMap({});
            setView({ kind: 'ready' });
            status.setStatus(true, t('audit.doneStatus', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error running order audit:', error);
            if (!alive.current) return;
            const message = error instanceof Error ? error.message : '';
            status.setStatus(false, t('audit.failedStatus'));
            status.showError(message || t('error.unreachable', { base: API_BASE }));
            setView({ kind: 'error', message: message || t('audit.failedStatus') });
        } finally {
            if (alive.current) setRunning(false);
        }
    }

    const trades: any[] = (report && report.trades) || [];
    const tradeKey = (trade: any, i: number) => String(trade.execution_id ?? i);
    const attentionCount = trades.filter(needsAttention).length;
    const counts: Record<Filter, number> = { all: trades.length, attention: attentionCount, clean: trades.length - attentionCount };
    const shown = activeFilter === 'attention'
        ? trades.filter(needsAttention)
        : activeFilter === 'clean' ? trades.filter(tr => !needsAttention(tr)) : trades;
    const isOpen = (trade: any, i: number) => openMap[tradeKey(trade, i)] ?? needsAttention(trade);

    const selectFilter = (f: Filter) => {
        if (f === activeFilter) return;
        setActiveFilter(f);
        setOpenMap({});
    };
    const setAllOpen = (open: boolean) => {
        const next: Record<string, boolean> = {};
        trades.forEach((trade, i) => { next[tradeKey(trade, i)] = open; });
        setOpenMap(next);
    };

    const count = (n: unknown) => format.number((n as number) || 0);
    const measured = report ? (report.trades_measured || 0) : 0;
    const tone = (n: number) => (n >= 0 ? ' green' : ' red');

    let content: ReactNode;
    if (view.kind === 'loading') {
        content = <div className="skeleton">{t('audit.fetching')}</div>;
    } else if (view.kind === 'error') {
        content = <div className="empty-state"><span className="big">⚠️</span>{view.message}</div>;
    } else if (!report) {
        content = <div className="empty-state"><span className="big">🔍</span><span>{t('audit.prompt')}</span></div>;
    } else if (trades.length === 0) {
        content = <div className="empty-state"><span className="big">🧾</span>{t('audit.empty')}</div>;
    } else if (shown.length === 0) {
        content = <div className="empty-state"><span className="big">✓</span>{t('audit.filterEmpty')}</div>;
    } else {
        content = shown.map(trade => {
            const i = trades.indexOf(trade);
            const key = tradeKey(trade, i);
            return (
                <Trade key={key} trade={trade} open={isOpen(trade, i)}
                       onToggle={open => setOpenMap(m => ({ ...m, [key]: open }))} />
            );
        });
    }

    return (
        <>
            <section className="panel">
                <div className="panel-header">
                    <h2>{t('audit.scope.title')}</h2>
                    <span className="panel-hint">{t('audit.scope.hint')}</span>
                </div>
                <div className="filters">
                    <div className="filter-field">
                        <label htmlFor="limitInput">{t('audit.scope.limit')}</label>
                        <input type="number" id="limitInput" min="1" max="200" value={limit} onChange={e => setLimit(e.target.value)} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="priceTolInput">{t('audit.scope.priceTolerance')}</label>
                        <input type="number" id="priceTolInput" min="0" step="0.01" value={priceTol} onChange={e => setPriceTol(e.target.value)} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="qtyTolInput">{t('audit.scope.qtyTolerance')}</label>
                        <input type="number" id="qtyTolInput" min="0" step="0.01" value={qtyTol} onChange={e => setQtyTol(e.target.value)} />
                    </div>
                    <div className="filter-field">
                        <label htmlFor="simulatedSelect">{t('audit.scope.simulated')}</label>
                        <select id="simulatedSelect" value={simulated} onChange={e => setSimulated(e.target.value)}>
                            <option value="false">{t('audit.scope.exclude')}</option>
                            <option value="true">{t('audit.scope.include')}</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label htmlFor="unplacedSelect">{t('audit.scope.unplaced')}</label>
                        <select id="unplacedSelect" value={unplaced} onChange={e => setUnplaced(e.target.value)}>
                            <option value="false">{t('audit.scope.exclude')}</option>
                            <option value="true">{t('audit.scope.include')}</option>
                        </select>
                    </div>
                    <div className="filter-field">
                        <label>&nbsp;</label>
                        <button className="btn primary" disabled={running} onClick={runAudit}>
                            {running ? t('audit.scope.running') : t('audit.scope.run')}
                        </button>
                    </div>
                </div>
            </section>

            <div className="stats">
                <div className="stat">
                    <div className="stat-label">{t('audit.stat.trades')}</div>
                    <div className="stat-value">{report ? count(report.trades_audited) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('audit.stat.mismatchTrades')}</div>
                    <div className={`stat-value${report ? ((report.trades_with_mismatch || 0) > 0 ? ' red' : ' green') : ''}`}>
                        {report ? count(report.trades_with_mismatch) : '—'}
                    </div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('audit.stat.mismatchFields')}</div>
                    <div className="stat-value">{report ? count(report.total_mismatches) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('audit.stat.unverified')}</div>
                    <div className="stat-value">{report ? count(report.legs_unverified) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('audit.stat.realized')}</div>
                    <div className={`stat-value${measured ? tone(report.realized_net) : ''}`}>
                        {measured ? fmtValText(report.realized_net, 'IRT') : '—'}
                    </div>
                    <div className="stat-sub">
                        {report && (measured
                            ? t('audit.expectedSub', {
                                expected: fmtValText(report.expected_total, 'IRT'),
                                measured: count(measured),
                                audited: count(report.trades_audited),
                            })
                            : t('audit.noneMeasurable'))}
                    </div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('audit.stat.quoteFlow')}</div>
                    {/* The drain signal: the model intends IRT to come out roughly flat. */}
                    <div className={`stat-value${measured ? tone(report.net_quote_flow) : ''}`}>
                        {measured ? fmtValText(report.net_quote_flow, 'IRT') : '—'}
                    </div>
                    <div className="stat-sub">
                        {measured ? t('audit.retainedSub', { retained: fmtValText(report.retained_base, 'USDT') }) : ''}
                    </div>
                </div>
            </div>

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('audit.trades.title')}</span> <span className="count">{trades.length}</span></h2>
                    <span className="panel-hint">
                        {report ? t('audit.generatedAt', {
                            time: format.dateTime(report.generated_at),
                            price: format.number(report.price_tolerance_pct),
                            qty: format.number(report.qty_tolerance_pct),
                        }) : ''}
                    </span>
                </div>
                <div className="audit-toolbar" hidden={trades.length === 0}>
                    <div className="segmented" role="tablist">
                        {FILTERS.map(f => (
                            <button key={f} type="button" className={f === activeFilter ? 'active' : ''} onClick={() => selectFilter(f)}>
                                {`${t(`audit.filter.${f}`)} · ${format.number(counts[f])}`}
                            </button>
                        ))}
                    </div>
                    <div className="audit-legend">
                        <span>{MARK_OK} <span>{t('audit.legend.ok')}</span></span>
                        <span>{MARK_NEAR} <span>{t('audit.legend.near')}</span></span>
                        <span>{MARK_BAD} <span>{t('audit.legend.bad')}</span></span>
                    </div>
                    <span className="spacer" />
                    <button type="button" className="btn" onClick={() => setAllOpen(true)}>{t('audit.expandAll')}</button>
                    <button type="button" className="btn" onClick={() => setAllOpen(false)}>{t('audit.collapseAll')}</button>
                </div>
                <div>{content}</div>
            </section>

            <footer className="page-footer">{t('audit.footer')}</footer>
        </>
    );
}
