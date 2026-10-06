import type { ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { cx, fmtPrice, fmtQty, fmtSignedPct, fmtToman, providerLabel, signClass } from '../../../shared/lib';
import { Skeleton, StatusBadge } from '../../../shared/ui';
import { useExecution, type BookLevel, type Projection } from '../api';
import { bestPriceOf, limitLabel, outcomeOf, placeabilityOf } from '../labels';

// Every quantity on a projection is in the pair's base asset; rows written
// before the symbol was recorded were all USDT_IRT.
const baseOf = (symbol: string | undefined) => (symbol || '').split('_')[0] || 'USDT';

const toneOf = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? '' : n >= 0 ? 'green' : 'red');

function Kpi({ label, value, unit, sub, tone }: { label: ReactNode; value: ReactNode; unit?: ReactNode; sub?: ReactNode; tone?: string }) {
    return (
        <div className="osum-kpi">
            <div className="osum-kpi-label">{label}</div>
            <div className={cx('osum-kpi-value', tone)}>{value}{unit && <span className="osum-unit">{unit}</span>}</div>
            {sub && <div className="osum-kpi-sub">{sub}</div>}
        </div>
    );
}

function Card({ title, hint, children, className }: { title: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cx('pd-card', className)}>
            <header className="pd-card-head">
                <h4>{title}</h4>
                {hint && <p>{hint}</p>}
            </header>
            {children}
        </section>
    );
}

interface CompareRow {
    label: ReactNode;
    deep: ReactNode;
    best: ReactNode;
    deepClass?: string;
    bestClass?: string;
    total?: boolean;
}

/** The deep-book order and the best-price order, line for line. */
function CompareTable({ r, base, fraction }: { r: Projection; base: string; fraction: string }) {
    const { t } = useI18n();
    const bp = bestPriceOf(r);
    const known = bp.known;
    const qty = (n: number | undefined) => `${fmtQty(n, 4)} ${base}`;
    const toman = (n: number | undefined) => t('opps.detail.tomanValue', { value: fmtToman(n) });
    const best = (v: ReactNode) => (known ? v : <span className="audit-missing">—</span>);
    const deepPlace = placeabilityOf(r.placeable ? 'yes' : 'no');
    const bestPlace = placeabilityOf(bp.placeable);
    const deepFraction = String(Math.round((r.projected_fraction || 0) * 100));

    const rows: CompareRow[] = [
        { label: t('opps.detail.size'), deep: qty(r.projected_amount), best: best(qty(bp.amount)) },
        { label: t('opps.detail.buyAt', { provider: providerLabel(r.buy_provider) }), deep: fmtPrice(r.projected_buy_price), best: best(fmtPrice(r.top_ask)) },
        { label: t('opps.detail.sellAt', { provider: providerLabel(r.sell_provider) }), deep: fmtPrice(r.projected_sell_price), best: best(fmtPrice(r.top_bid)) },
        { label: t('opps.detail.gross'), deep: fmtToman(r.gross_profit), best: best(fmtToman(bp.gross)), deepClass: signClass(r.gross_profit), bestClass: known ? signClass(bp.gross) : '' },
        { label: t('opps.detail.buyFee', { provider: providerLabel(r.buy_provider) }), deep: `−${fmtToman(r.buy_fee)}`, best: best(`−${fmtToman(bp.buy_fee)}`), deepClass: 'neg', bestClass: known ? 'neg' : '' },
        { label: t('opps.detail.sellFee', { provider: providerLabel(r.sell_provider) }), deep: `−${fmtToman(r.sell_fee)}`, best: best(`−${fmtToman(bp.sell_fee)}`), deepClass: 'neg', bestClass: known ? 'neg' : '' },
        {
            label: t('opps.detail.slippage'),
            deep: (r.slippage_cost || 0) > 0 ? `−${fmtToman(r.slippage_cost)}` : fmtToman(0),
            best: best(fmtToman(0)),
            deepClass: (r.slippage_cost || 0) > 0 ? 'neg' : 'muted', bestClass: 'muted',
        },
        {
            label: t('opps.detail.netProfit'), total: true,
            deep: <>{fmtToman(r.net_profit)} <small>{fmtSignedPct(r.net_profit_pct, 4)}</small></>,
            best: best(<>{fmtToman(bp.net)} <small>{fmtSignedPct(bp.net_pct, 4)}</small></>),
            deepClass: signClass(r.net_profit), bestClass: known ? signClass(bp.net) : '',
        },
        { label: t('opps.detail.capital'), deep: toman(r.deployed), best: best(toman(bp.deployed)) },
        {
            label: t('opps.detail.clearsMinimums'),
            deep: <StatusBadge tone={deepPlace.badge} title={deepPlace.long}>{deepPlace.label}</StatusBadge>,
            best: best(<StatusBadge tone={bestPlace.badge} title={bestPlace.long}>{bestPlace.label}</StatusBadge>),
        },
    ];

    return (
        <>
            <div className="table-scroll">
                <table className="pd-table pd-compare">
                    <thead>
                        <tr>
                            <th />
                            <th>{t('opps.detail.col.deep')}<small>{t('opps.detail.col.deepSub', { fraction: deepFraction })}</small></th>
                            <th>{t('opps.detail.col.best')}<small>{t('opps.detail.col.bestSub', { fraction })}</small></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i} className={cx(row.total && 'total')}>
                                <td>{row.label}</td>
                                <td className={row.deepClass}>{row.deep}</td>
                                <td className={row.bestClass}>{row.best}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!known && <p className="pd-note">{t('opps.detail.bestPriceUnknown', { buy: providerLabel(r.buy_provider), sell: providerLabel(r.sell_provider) })}</p>}
        </>
    );
}

/** Each cap on the order size as a bar, with the one that bound it marked. */
function SizingCaps({ r, base }: { r: Projection; base: string }) {
    const { t } = useI18n();
    const caps = [
        { key: 'depth', label: t('opps.detail.cap.depth'), value: r.depth_max_amount, known: r.depth_known },
        { key: 'buy_balance', label: t('opps.detail.cap.buy', { provider: providerLabel(r.buy_provider) }), value: r.buy_balance_max_amount, known: r.buy_balance_max_amount !== -1 },
        { key: 'sell_balance', label: t('opps.detail.cap.sell', { provider: providerLabel(r.sell_provider) }), value: r.sell_balance_max_amount, known: r.sell_balance_max_amount !== -1 },
        { key: 'config', label: t('opps.detail.cap.config'), value: r.config_max_amount, known: true },
    ];
    // Log scale: one balance is often thousands of times the binding cap, and
    // a linear bar would flatten every other cap to a dot.
    const scale = (n: number) => Math.log10(Math.max(n, 0) + 1);
    const widest = scale(Math.max(...caps.filter((c) => c.known).map((c) => c.value || 0), r.max_amount || 0, 1));
    const fraction = String(Math.round((r.projected_fraction || 0) * 100));

    return (
        <>
            <ul className="pd-caps">
                {caps.map((c) => {
                    const binding = c.key === r.limited_by;
                    return (
                        <li key={c.key} className={cx(binding && 'binding', !c.known && 'unknown')}>
                            <div className="pd-cap-line">
                                <span>{c.label}{binding && <span className="pd-tag">{t('opps.detail.binding')}</span>}</span>
                                <span className="pd-num">{c.known ? `${fmtQty(c.value, 4)} ${base}` : t('opps.notKnown')}</span>
                            </div>
                            <div className="pd-bar"><span style={{ width: c.known ? `${Math.max(1, (scale(c.value) / widest) * 100)}%` : 0 }} /></div>
                        </li>
                    );
                })}
            </ul>
            <dl className="pd-kv">
                <div className="total"><dt>{t('opps.detail.maximum', { limit: limitLabel(r.limited_by) })}</dt><dd>{fmtQty(r.max_amount, 6)} {base}</dd></div>
                <div><dt>{t('opps.detail.projectedOrder', { fraction })}</dt><dd>{fmtQty(r.projected_amount, 6)} {base}</dd></div>
                <div><dt>{t('opps.detail.sellLeg')}</dt><dd>{fmtQty(r.projected_sell_amount, 6)} {base}</dd></div>
                <div><dt>{t('opps.detail.retained', { base })}</dt><dd className="pos">{fmtQty(r.retained_usdt, 6)} {base}</dd></div>
            </dl>
        </>
    );
}

/** One side of a book, best level first; levels the projected order would reach are lit. */
function Ladder({ levels, side, reach, title, emptyKey }: {
    levels: BookLevel[] | undefined; side: 'ask' | 'bid'; reach: number; title: ReactNode; emptyKey: string;
}) {
    const { t } = useI18n();
    const shown = (levels || []).slice(0, 10);
    const deepest = Math.max(...shown.map(([, size]) => size), 0);
    const reached = (price: number) => reach > 0 && (side === 'ask' ? price <= reach : price >= reach);
    return (
        <div className={cx('pd-ladder', side)}>
            <div className="pd-ladder-title">{title}</div>
            {!shown.length ? <div className="audit-missing">{t(emptyKey)}</div> : shown.map(([price, size], i) => (
                <div key={i} className={cx('pd-level', reached(price) && 'reached')}>
                    <span className="pd-depth" style={{ width: deepest > 0 ? `${(size / deepest) * 100}%` : 0 }} />
                    <span className="pd-level-price">{fmtPrice(price)}</span>
                    <span className="pd-level-size">{size > 0 ? fmtQty(size, 4) : t('opps.detail.sizeNotPublished')}</span>
                </div>
            ))}
        </div>
    );
}

function MarketCard({ r, base }: { r: Projection; base: string }) {
    const { t, format } = useI18n();
    const size = (n: number) => (n > 0 ? `${fmtQty(n, 4)} ${base}` : t('opps.detail.notPublished'));
    return (
        <Card title={t('opps.detail.marketTitle')} hint={t('opps.detail.marketHint')}>
            <dl className="pd-kv">
                <div><dt>{t('opps.detail.topAsk', { provider: providerLabel(r.buy_provider) })}</dt><dd>{fmtPrice(r.top_ask)} <small>× {size(r.top_ask_size)}</small></dd></div>
                <div><dt>{t('opps.detail.topBid', { provider: providerLabel(r.sell_provider) })}</dt><dd>{fmtPrice(r.top_bid)} <small>× {size(r.top_bid_size)}</small></dd></div>
                <div>
                    <dt>{t('opps.detail.rawSpread')}</dt>
                    <dd className={signClass(r.raw_spread)}>{t('opps.detail.rawSpreadValue', { value: fmtPrice(r.raw_spread), pct: fmtSignedPct(r.raw_spread_pct) })}</dd>
                </div>
                <div>
                    <dt>{t('common.fees')}</dt>
                    <dd>{t('opps.detail.feesValue', {
                        buy: format.decimal(r.buy_fee_pct || 0, 2),
                        sell: format.decimal(r.sell_fee_pct || 0, 2),
                        total: format.decimal(r.total_fee_pct || 0, 4),
                    })}</dd>
                </div>
                <div><dt>{t('opps.detail.scoredAt')}</dt><dd>{fmtPrice(r.scored_buy_price)} → {fmtPrice(r.scored_sell_price)} <small>{fmtSignedPct(r.scored_profit_pct)}</small></dd></div>
            </dl>
            <div className="pd-ladders">
                <Ladder levels={r.book?.asks} side="ask" reach={r.projected_amount > 0 ? r.projected_buy_price : 0}
                        title={t('opps.detail.asksLabel', { provider: providerLabel(r.buy_provider) })} emptyKey="opps.detail.noAsks" />
                <Ladder levels={r.book?.bids} side="bid" reach={r.projected_amount > 0 ? r.projected_sell_price : 0}
                        title={t('opps.detail.bidsLabel', { provider: providerLabel(r.sell_provider) })} emptyKey="opps.detail.noBids" />
            </div>
        </Card>
    );
}

function ExecutionCard({ id, base }: { id: string; base: string }) {
    const { t } = useI18n();
    const { data: e, error, isPending } = useExecution(id, true);
    let body: ReactNode;
    if (error) body = <div className="error-line">{t('opps.detail.executionFailed', { error: error.message })}</div>;
    else if (isPending) body = <Skeleton>{t('opps.detail.loadingExecution')}</Skeleton>;
    else if (!e) return null;
    else body = (
        <dl className="pd-kv pd-kv-wide">
            <div><dt>{t('opps.detail.tradedSize')}</dt><dd>{t('opps.detail.tradedSizeValue', { bought: `${fmtQty(e.amount, 8)} ${base}`, sold: `${fmtQty(e.sell_amount, 8)} ${base}` })}</dd></div>
            <div><dt>{t('opps.detail.prices')}</dt><dd>{fmtPrice(e.buy_price)} → {fmtPrice(e.sell_price)}</dd></div>
            <div>
                <dt>{t('opps.detail.expectedProfit')}</dt>
                <dd className={signClass(e.expected_profit)}>{t('opps.detail.netWithPct', { value: fmtToman(e.expected_profit), pct: fmtSignedPct(e.expected_profit_pct, 3) })}</dd>
            </div>
            <div><dt>{t('common.status')}</dt><dd>{t('opps.detail.statusValue', { status: e.status, buy: e.buy_status, sell: e.sell_status })}</dd></div>
            <div><dt>{t('opps.detail.execution')}</dt><dd className="pd-id">{e.id}</dd></div>
        </dl>
    );
    return <Card title={t('opps.detail.executionProduced')} className="pd-span">{body}</Card>;
}

/** Everything known about one projection: what happened, what it was worth, why it was that size, and the market it saw. */
export function ProjectionDetail({ r }: { r: Projection }) {
    const { t, format } = useI18n();
    const base = baseOf(r.symbol);
    const outcome = outcomeOf(r.outcome);
    const bp = bestPriceOf(r);
    const bestPlace = placeabilityOf(bp.placeable);
    const fraction = format.number(Math.round((r.projected_fraction || 0.70) * 100));
    const projectedPct = format.number(Math.round((r.projected_fraction || 0) * 100));
    const edge = (r.raw_spread_pct || 0) - (r.total_fee_pct || 0);

    return (
        <div className="pd">
            <header className={cx('pd-verdict', outcome.badge)}>
                <div className="pd-verdict-main">
                    <StatusBadge tone={outcome.badge}>{outcome.label}</StatusBadge>
                    <strong>{outcome.long}</strong>
                </div>
                {r.outcome_detail && <p className="pd-reason">{r.outcome_detail}</p>}
                <div className="pd-chips">
                    <span className="meta-chip">{r.symbol ? r.symbol.replace('_', ' / ') : base}</span>
                    <span className="meta-chip">{t(r.simulated ? 'opps.detail.simulation' : 'opps.detail.realTrading')}</span>
                    <span className="meta-chip">
                        {r.traded_amount > 0 ? t('opps.detail.tradedChip', { qty: `${fmtQty(r.traded_amount, 8)} ${base}` }) : t('opps.detail.nothingTraded')}
                    </span>
                    <span className="meta-chip pd-id" title={t('opps.detail.projectionId')}>{r.id}</span>
                </div>
            </header>

            <div className="osum-kpis pd-kpis">
                <Kpi label={t('opps.detail.kpi.net')} value={fmtToman(r.net_profit)} unit={t('common.toman')} tone={toneOf(r.net_profit)}
                     sub={t('opps.detail.kpi.netSub', { pct: fmtSignedPct(r.net_profit_pct, 4), capital: fmtToman(r.deployed) })} />
                <Kpi label={t('opps.detail.kpi.best')}
                     value={bp.known ? fmtToman(bp.net) : t('opps.notKnown')} unit={bp.known ? t('common.toman') : undefined} tone={bp.known ? toneOf(bp.net) : ''}
                     sub={bp.known ? <>{fmtSignedPct(bp.net_pct, 4)} · <span title={bestPlace.long}>{bestPlace.label}</span></> : undefined} />
                <Kpi label={t('opps.detail.kpi.size')} value={fmtQty(r.projected_amount, 4)} unit={base}
                     sub={t('opps.detail.kpi.sizeSub', { fraction: projectedPct, max: fmtQty(r.max_amount, 4), limit: limitLabel(r.limited_by) })} />
                <Kpi label={t('opps.detail.kpi.edge')} value={fmtSignedPct(edge, 4)} tone={toneOf(edge)}
                     sub={t('opps.detail.kpi.edgeSub', { spread: fmtSignedPct(r.raw_spread_pct), fees: format.decimal(r.total_fee_pct || 0, 4) })} />
            </div>

            <div className="pd-grid">
                <Card title={t('opps.detail.compareTitle')} hint={t('opps.detail.compareHint')} className="pd-span">
                    <CompareTable r={r} base={base} fraction={fraction} />
                </Card>
                <Card title={t('opps.detail.sizingTitle')} hint={t('opps.detail.sizingHint')}>
                    <SizingCaps r={r} base={base} />
                </Card>
                <MarketCard r={r} base={base} />
                {r.execution_id && <ExecutionCard id={r.id} base={base} />}
            </div>

            {r.notes && <div className="note-line">⚠️ {r.notes}</div>}
        </div>
    );
}
