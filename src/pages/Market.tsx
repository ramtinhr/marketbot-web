import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import Html from '../components/Html';
import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { useInterval } from '../lib/hooks';
import { escapeHtml, providerLabel } from '../lib/ui';
import {
    BOOK_ROWS, MarketController, baseOf, fmtAsset, fmtTime, fmtToman, num, pairLabel, parseAmount,
    quoteLabel, sideWord, type BookRow, type BookSide, type BookView, type FormRole, type OrdersTab, type Side,
} from './Market/controller';

const dirClass = (d: number) => (d > 0 ? 'mk-up' : d < 0 ? 'mk-down' : '');
const dirArrow = (d: number) => (d > 0 ? ' ↑' : d < 0 ? ' ↓' : '');

const MODE_BADGE = { demo: 'simulated', liveNoBot: 'failed', liveOff: 'stale', liveSimulated: 'pending', liveReal: 'failed' };
const ORDER_BADGE: Record<string, string> = { open: 'simulated', partial: 'pending', filled: 'completed', cancelled: 'stale' };

export default function Market() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();
    const [searchParams, setSearchParams] = useSearchParams();
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    const [m] = useState(() => new MarketController({ rerender, status, setSymbolParam: () => {} }));
    m.deps.setSymbolParam = (symbol) => setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('symbol', symbol);
        return next;
    }, { replace: true });

    const urlSymbol = searchParams.get('symbol');
    const initialSymbol = useRef(urlSymbol);
    useEffect(() => {
        m.start(initialSymbol.current);
        return () => m.dispose();
    }, [m]);
    useEffect(() => { m.followUrl(urlSymbol); }, [m, urlSymbol]);

    // app.css widens this page's container off body.page-market.
    useEffect(() => {
        document.body.classList.add('page-market');
        return () => document.body.classList.remove('page-market');
    }, []);

    const shownLocale = useRef(locale);
    useEffect(() => {
        if (shownLocale.current === locale) return;
        shownLocale.current = locale;
        m.onLanguageChange();
    }, [m, locale]);

    useInterval(() => { if (m.s.inited) m.renderStatus(); }, 1000);
    useInterval(() => { if (m.s.inited) void m.loadStatus(); }, 15000);
    // The bot refreshes its balance cache every ~20s; a live page follows it.
    useInterval(() => { if (m.s.inited) void m.loadRealBalances(); }, 10000);

    const s = m.s;
    const base = baseOf(s.symbol);
    const live = m.isLive();

    const last = m.lastPrice();
    const { bid, ask } = m.bestPrices();
    const market = m.marketPrice();
    const spread = bid !== null && ask !== null ? ask - bid : null;
    const mid = spread !== null && bid !== null && ask !== null ? (ask + bid) / 2 : null;
    const spreadPct = format.percent(mid ? ((spread as number) / mid) * 100 : 0, 3);

    const mode = m.modeState();

    const liquidity = !s.depth
        ? { cls: 'pending', text: t('market.liquidity.none') }
        : s.depth.venue_liquidity
            ? { cls: 'ok', text: t('market.liquidity.venues') }
            : { cls: 'stale', text: t('market.liquidity.usersOnly') };

    return (
        <>
            <div className={`mt-notice${s.notice?.red ? ' red' : ''}`} hidden={!s.notice}>{s.notice?.text}</div>

            {/* Pair and ticker */}
            <div className="mk-bar">
                <div className="mk-pair">
                    <div className="mk-pair-icon" aria-hidden="true">{base.slice(0, 4)}</div>
                    <select aria-label={t('market.pair')} value={s.symbol || ''} onChange={(e) => m.selectSymbol(e.target.value)}>
                        {s.symbols.map((sym) => <option key={sym} value={sym}>{pairLabel(sym)}</option>)}
                    </select>
                </div>
                <div className="mk-stat">
                    <span title={t('market.price.hint')}>{t('market.price')}</span>
                    <strong className={`mk-last ${dirClass(s.marketDirection)}`}>{market === null ? '—' : m.fmtPrice(market)}</strong>
                </div>
                <div className="mk-stat">
                    <span>{t('market.last')}</span>
                    <strong className={dirClass(s.lastDirection)}>{last === null ? '—' : m.fmtPrice(last)}</strong>
                </div>
                <div className="mk-stat">
                    <span>{t('market.bestBid')}</span>
                    <strong className="mk-up">{bid === null ? '—' : m.fmtPrice(bid)}</strong>
                </div>
                <div className="mk-stat">
                    <span>{t('market.bestAsk')}</span>
                    <strong className="mk-down">{ask === null ? '—' : m.fmtPrice(ask)}</strong>
                </div>
                <div className="mk-stat">
                    <span>{t('market.spread')}</span>
                    <strong>{spread === null ? '—' : `${m.fmtPrice(spread)} (${spreadPct})`}</strong>
                </div>
                <div className="mk-stat">
                    <span>{t('market.liquidity')}</span>
                    <strong><span className={`status-badge ${liquidity.cls}`}>{liquidity.text}</span></strong>
                </div>
                <div className="mk-stat" hidden={!mode}>
                    <span>{t('market.mode')}</span>
                    <strong>
                        {mode && (
                            <span className={`status-badge ${MODE_BADGE[mode]}`} title={t(`market.mode.hint.${mode}`, {
                                cap: s.hedging && s.hedging.max_notional_toman ? fmtToman(s.hedging.max_notional_toman) : '—',
                            })}>{t(`market.mode.${mode}`)}</span>
                        )}
                    </strong>
                </div>
                <div className="mk-spacer" />
                <div className="mk-user">
                    <div className="filter-field">
                        <label htmlFor="userSelect">{t('market.tradingAs')}</label>
                        <select id="userSelect" value={s.userId || ''} onChange={(e) => m.selectUser(e.target.value)}>
                            {s.users.length
                                ? s.users.map((u) => <option key={u.id} value={u.id}>{u.display_name} ({u.username})</option>)
                                : s.inited && <option value="">{t('market.users.none')}</option>}
                        </select>
                    </div>
                    {/* Test funds exist only in demo mode: live orders spend real money. */}
                    <button className="btn" type="button" title={t('market.faucet.hint')} hidden={live}
                            disabled={!s.userId || live || s.faucetBusy} onClick={() => void m.topUp()}>
                        {t('market.faucet')}
                    </button>
                </div>
            </div>

            <div className="mk-grid">
                <OrderBook m={m} />

                {/* Order entry and balances */}
                <section className="panel mk-trade">
                    <div className="panel-header">
                        <h2>{t('market.form.title')}</h2>
                        <span className="panel-hint">{t('market.form.hint')}</span>
                    </div>
                    <div className="mk-forms">
                        <TradeForm m={m} side="buy" />
                        <TradeForm m={m} side="sell" />
                    </div>

                    <div className="mk-subhead" title={live ? t('market.balances.liveHint') : ''}>
                        {t(live ? 'market.balances.titleLive' : 'market.balances.title')}
                    </div>
                    <Balances m={m} />
                </section>

                <MarketTrades m={m} />
            </div>

            <Orders m={m} />

            <footer className="page-footer">{t('market.footer')}</footer>

            <div className="mk-toasts" aria-live="polite">
                {s.toasts.map((toast) => (
                    <div key={toast.id} className={`mk-toast ${toast.kind}${toast.leaving ? ' leaving' : ''}`}>
                        <div className="mk-toast-body">
                            <strong>{toast.title}</strong>
                            {toast.body ? <span>{toast.body}</span> : null}
                        </div>
                        <button type="button" className="mk-toast-close" aria-label={t('market.toast.close')}
                                onClick={() => m.dismissToast(toast.id)}>&times;</button>
                    </div>
                ))}
            </div>
        </>
    );
}

// ---- Order book ----

function OrderBook({ m }: { m: MarketController }) {
    const { t, format } = useI18n();
    const s = m.s;
    const base = baseOf(s.symbol);
    const d = s.depth;
    const view = s.view;
    const rows = view === 'both' ? BOOK_ROWS : BOOK_ROWS * 2;
    const digits = m.priceDigits();

    const last = m.lastPrice();
    const { bid, ask } = m.bestPrices();
    const market = m.marketPrice();
    const spread = bid !== null && ask !== null ? ask - bid : null;
    const mid = spread !== null && bid !== null && ask !== null ? (ask + bid) / 2 : null;

    const views: BookView[] = ['both', 'bids', 'asks'];
    const empty = <div className="mk-book-empty">{t('market.book.empty')}</div>;

    let asksBody: ReactNode;
    let bidsBody: ReactNode;
    if (!d) {
        asksBody = view === 'bids' ? null : <div className="mk-book-empty">{t('market.book.waiting')}</div>;
        bidsBody = null;
    } else {
        const asks = m.groupLevels(d.asks || [], 'ask').slice(0, rows);
        const bids = m.groupLevels(d.bids || [], 'bid').slice(0, rows);
        const cum = (levels: BookRow[]) => { let c = 0; return levels.map((l) => (c += l.quantity)); };
        const askCum = cum(asks);
        const bidCum = cum(bids);
        const maxCum = Math.max(askCum.at(-1) || 0, bidCum.at(-1) || 0);
        const row = (side: BookSide, r: BookRow, cumulative: number) => {
            const pct = maxCum > 0 ? Math.min(100, (cumulative / maxCum) * 100) : 0;
            const tip = r.venues.length
                ? t('market.book.tip', { quantity: m.fmtQty(r.quantity), base, users: m.fmtQty(r.user), venues: r.venues.map(providerLabel).join(', ') })
                : t('market.book.tipUsers', { quantity: m.fmtQty(r.quantity), base });
            const mine = m.hasMine(side, r);
            return (
                <div key={r.price} className={`mk-row ${side}${mine ? ' mine' : ''}`}
                     style={{ '--depth': `${pct.toFixed(1)}%` } as CSSProperties}
                     title={tip + (mine ? ` · ${t('market.book.mine')}` : '')}
                     onClick={() => m.rowClick(side, r.price, cumulative)}>
                    <span className="mk-price">{r.user > 0 && <i className="mk-user-dot" aria-hidden="true" />}{m.fmtPrice(r.price, digits)}</span>
                    <span>{m.fmtQty(r.quantity)}</span>
                    <span className="mk-dim">{fmtToman(r.price * r.quantity)}</span>
                </div>
            );
        };
        // Asks read upwards from the spread, so the best ask sits just above it.
        asksBody = asks.length ? asks.map((r, i) => row('ask', r, askCum[i])).reverse() : empty;
        bidsBody = bids.length ? bids.map((r, i) => row('bid', r, bidCum[i])) : empty;
    }

    return (
        <section className="panel mk-book">
            <div className="panel-header">
                <h2>{t('market.book.title')}</h2>
                <div className="toolbar-group">
                    <div className="segmented" id="bookView">
                        {views.map((v) => (
                            <button key={v} type="button" className={s.view === v ? 'active' : ''}
                                    title={t(`market.book.view.${v}`)} aria-label={t(`market.book.view.${v}`)}
                                    onClick={() => m.setView(v)}>
                                <span className={`mk-view-icon ${v}`} aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                    <select className="toolbar-select" aria-label={t('market.book.group')}
                            value={String(s.group)} onChange={(e) => m.setGroup(e.target.value)}>
                        {s.groupSteps && (
                            <>
                                <option value="0">{t('market.book.groupNone')}</option>
                                {s.groupSteps.map((step) => (
                                    <option key={step} value={String(step)}>{format.number(step, { maximumFractionDigits: 8 })}</option>
                                ))}
                            </>
                        )}
                    </select>
                </div>
            </div>
            <div className="mk-book-head">
                <span>{t('market.book.price', { quote: quoteLabel() })}</span>
                <span>{t('market.book.amount', { base })}</span>
                <span>{t('market.book.total')}</span>
            </div>
            <div className="mk-side mk-asks" hidden={view === 'bids'}
                 style={{ '--rows': view === 'bids' ? 0 : rows } as CSSProperties}>{asksBody}</div>
            <div className="mk-mid">
                <strong className={dirClass(s.marketDirection)} title={t('market.price.hint')}>
                    {market === null ? '—' : m.fmtPrice(market, digits) + dirArrow(s.marketDirection)}
                </strong>
                <div className="mk-mid-meta">
                    <span>{spread === null ? '' : t('market.book.spreadLine', {
                        spread: m.fmtPrice(spread, digits), pct: format.percent(mid ? (spread / mid) * 100 : 0, 3),
                    })}</span>
                    <span>{last === null
                        ? t('market.book.noTrade')
                        : t('market.book.lastTrade', { price: m.fmtPrice(last, digits) + dirArrow(s.lastDirection) })}</span>
                </div>
            </div>
            <div className="mk-side mk-bids" hidden={view === 'asks'}
                 style={{ '--rows': view === 'asks' ? 0 : rows } as CSSProperties}>{bidsBody}</div>
            <div className="mk-legend">
                <span><i className="mk-user-dot" aria-hidden="true" /><span>{t('market.book.legend.users')}</span></span>
                <span><i className="mk-mine-mark" aria-hidden="true" /><span>{t('market.book.legend.mine')}</span></span>
            </div>
        </section>
    );
}

// ---- Order forms ----

function TradeForm({ m, side }: { m: MarketController; side: Side }) {
    const { t } = useI18n();
    const s = m.s;
    const base = baseOf(s.symbol);
    const f = s.forms[side];
    const asset = side === 'buy' ? 'IRT' : base;
    const busy = s.busy[side];
    const input = (role: FormRole) => (
        <input type="text" inputMode="decimal" autoComplete="off" aria-label={t(`market.form.${role}`)}
               value={f[role]} onChange={(e) => m.setField(side, role, e.target.value)} />
    );

    return (
        <form className="mk-form" data-side={side} noValidate onSubmit={(e) => { e.preventDefault(); void m.placeOrder(side); }}>
            <div className="mk-avail">
                <span>{t('market.form.available')}</span>
                <b>{s.userId ? `${fmtAsset(m.balanceOf(asset).available, asset, { floor: true })} ${side === 'buy' ? quoteLabel() : base}` : '—'}</b>
            </div>
            <div className="mk-field">
                <label>{t('market.form.price')}</label>
                {input('price')}
                <button type="button" className="mk-best" title={t(`market.form.best.${side}`)} onClick={() => m.bestClick(side)}>
                    {t('market.form.best')}
                </button>
                <span className="unit">{quoteLabel()}</span>
            </div>
            <div className="mk-field">
                <label>{t('market.form.amount')}</label>
                {input('amount')}
                <span className="unit">{base}</span>
            </div>
            <div className="mk-pcts">
                {[25, 50, 75, 100].map((pct) => (
                    <button key={pct} type="button" onClick={() => m.fillPercent(side, pct)}>{pct}%</button>
                ))}
            </div>
            <div className="mk-field">
                <label>{t('market.form.total')}</label>
                {input('total')}
                <span className="unit">{quoteLabel()}</span>
            </div>
            <div className="mk-preview" aria-live="polite"><Preview m={m} side={side} /></div>
            <button type="submit" className={`mk-submit ${side}`} disabled={busy || !s.userId}>
                {busy ? t('market.form.placing') : t(side === 'buy' ? 'market.form.buy' : 'market.form.sell', { base })}
            </button>
        </form>
    );
}

/**
 * What the order would do against the book on screen: the same walk the
 * engine makes, price by price, up to the limit. An estimate - the book
 * moves, and a published depth stops at its deepest levels.
 */
function Preview({ m, side }: { m: MarketController; side: Side }) {
    const { t } = useI18n();
    const s = m.s;
    const f = s.forms[side];
    const base = baseOf(s.symbol);
    const priceS = parseAmount(f.price);
    const qtyS = parseAmount(f.amount);
    if (!priceS || !qtyS) return <span className="mk-dim">{t('market.preview.empty')}</span>;

    const limit = num(priceS);
    const qty = num(qtyS);
    const levels: any[] = (s.depth && (side === 'buy' ? s.depth.asks : s.depth.bids)) || [];
    let filled = 0;
    let cost = 0;
    for (const l of levels) {
        const p = num(l.price);
        if (side === 'buy' ? p > limit : p < limit) break;
        const take = Math.min(qty - filled, num(l.quantity));
        filled += take;
        cost += take * p;
        if (filled >= qty - 1e-12) break;
    }
    const bold = (text: string) => `<b>${escapeHtml(text)}</b>`;

    let funds: string | null = null;
    if (s.userId) {
        const need = side === 'buy' ? limit * qty : qty;
        const have = m.balanceOf(side === 'buy' ? 'IRT' : base).available;
        if (need > have + 1e-9) {
            funds = t('market.preview.funds', {
                amount: side === 'buy' ? fmtToman(need) : m.fmtQty(need), asset: side === 'buy' ? quoteLabel() : base,
                available: side === 'buy' ? fmtToman(have) : m.fmtQty(have),
            });
        }
    }

    return (
        <>
            {filled <= 0 ? (
                <div>{t('market.preview.none', { price: m.fmtPrice(limit) })}</div>
            ) : (
                <>
                    <Html as="div" k="market.preview.fills" vars={{
                        qty: bold(m.fmtQty(filled)), base: escapeHtml(base), avg: bold(m.fmtPrice(cost / filled)),
                    }} />
                    {filled >= qty - 1e-12
                        ? <div>{t('market.preview.allFills')}</div>
                        : <Html as="div" k="market.preview.rests" vars={{
                            qty: bold(m.fmtQty(qty - filled)), base: escapeHtml(base), price: bold(m.fmtPrice(limit)),
                        }} />}
                </>
            )}
            {funds && <div><span className="mk-warn">{funds}</span></div>}
        </>
    );
}

// ---- Balances ----

function Balances({ m }: { m: MarketController }) {
    const { t } = useI18n();
    const s = m.s;
    const live = m.isLive();
    const balances = m.shownBalances();
    if (!live && !s.userId) return <div><div className="mk-empty">{t('market.orders.selectUser')}</div></div>;
    if (!balances.length) return <div><div className="mk-empty">{t('market.balances.empty')}</div></div>;
    const base = baseOf(s.symbol);
    // Live: where each total sits - an order on one venue is paid from that
    // venue's wallet, not from the sum - and which venues could not be read.
    const venueTip = (b: any) => ((b.venues || []) as any[])
        .map((v) => `${providerLabel(v.provider)}: ${fmtAsset(v.available, b.asset, { floor: true })}`).join('\n');
    const rows = [...balances].sort((a, b) => {
        const rank = (x: any) => (x.asset === base ? 0 : x.asset === 'IRT' ? 1 : 2);
        return rank(a) - rank(b) || a.asset.localeCompare(b.asset);
    });
    return (
        <div>
            <table className="mk-balances">
                <thead><tr><th>{t('market.balances.asset')}</th><th>{t('market.balances.available')}</th><th>{t('market.balances.locked')}</th></tr></thead>
                <tbody>
                    {rows.map((b) => {
                        const irt = b.asset === 'IRT';
                        const f = (v: unknown) => fmtAsset(v, b.asset, { floor: true });
                        return (
                            <tr key={b.asset} className={b.asset === base || irt ? '' : 'mk-dim'} title={venueTip(b)}>
                                <td>{irt ? quoteLabel() : b.asset}</td>
                                <td>{f(b.available)}</td>
                                <td>{num(b.locked) > 0 ? f(b.locked) : '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {live && s.real && s.real.unavailable.length > 0 && (
                <div className="mk-dim mk-note">{t('market.balances.unavailable', { venues: s.real.unavailable.map(providerLabel).join(', ') })}</div>
            )}
        </div>
    );
}

// ---- Market trades ----

function MarketTrades({ m }: { m: MarketController }) {
    const { t } = useI18n();
    const s = m.s;
    return (
        <section className="panel mk-trades">
            <div className="panel-header">
                <h2>{t('market.trades.title')}</h2>
            </div>
            <div className="mk-trade-head">
                <span>{t('market.trades.price')}</span>
                <span>{t('market.trades.amount')}</span>
                <span>{t('market.trades.time')}</span>
                <span>{t('market.trades.source')}</span>
            </div>
            <div id="marketTrades">
                {!s.trades.length ? <div className="mk-empty">{t('market.trades.empty')}</div> : s.trades.map((tr) => {
                    const source = tr.venue ? providerLabel(tr.venue) : t('market.trades.users');
                    return (
                        <div key={tr.id} className={`mk-trade-row ${tr.taker_side}${s.flashIds && s.flashIds.has(tr.id) ? ' flash' : ''}`}
                             title={t('market.trades.tip', { source, side: sideWord(tr.taker_side) })}>
                            <span className="mk-price">{m.fmtPrice(tr.price)}</span>
                            <span>{m.fmtQty(tr.quantity)}</span>
                            <span className="mk-dim">{fmtTime(tr.executed_at)}</span>
                            <span><i className={`mk-src${tr.venue ? '' : ' user'}`}>{source}</i></span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

// ---- The user's orders and trades ----

function Orders({ m }: { m: MarketController }) {
    const { t, format } = useI18n();
    const s = m.s;
    const tabs: OrdersTab[] = ['open', 'history', 'trades'];
    const tabLabel = (tab: OrdersTab) => (tab === 'open'
        ? <><span>{t('market.orders.open')}</span> <span className="mk-count">{format.number(s.open.size)}</span></>
        : t(tab === 'history' ? 'market.orders.history' : 'market.orders.myTrades'));

    return (
        <section className="panel mk-orders">
            <div className="panel-header">
                <div className="segmented">
                    {tabs.map((tab) => (
                        <button key={tab} type="button" className={s.tab === tab ? 'active' : ''} onClick={() => m.setTab(tab)}>
                            {tabLabel(tab)}
                        </button>
                    ))}
                </div>
                <button className="btn mt-small mt-danger" type="button" hidden={s.tab !== 'open' || s.open.size === 0}
                        disabled={s.cancelAllBusy} onClick={() => void m.cancelAll()}>
                    {t('market.orders.cancelAll')}
                </button>
            </div>
            <div><OrdersContent m={m} /></div>
        </section>
    );
}

function OrdersContent({ m }: { m: MarketController }) {
    const { t, format } = useI18n();
    const s = m.s;
    if (!s.userId) return <div className="empty-state">{t('market.orders.selectUser')}</div>;

    if (s.tab === 'trades') {
        if (!s.myTrades.length) return <div className="empty-state">{t('market.orders.empty.trades')}</div>;
        return (
            <div className="table-scroll">
                <table className="data-table mk-table">
                    <thead><tr>
                        <th>{t('market.orders.col.time')}</th><th>{t('market.orders.col.side')}</th>
                        <th>{t('market.orders.col.price')}</th><th>{t('market.orders.col.amount')}</th>
                        <th>{t('market.orders.col.total')}</th><th>{t('market.orders.col.role')}</th>
                        <th>{t('market.orders.col.counterparty')}</th>
                    </tr></thead>
                    <tbody>
                        {s.myTrades.map((tr) => {
                            const side = tr.buy_user_id === s.userId ? 'buy' : 'sell';
                            const other = side === 'buy' ? tr.sell_user_id : tr.buy_user_id;
                            const counterparty = tr.venue ? providerLabel(tr.venue)
                                : other === s.userId ? t('market.counterparty.self') : m.userName(other);
                            const role = side === tr.taker_side ? 'market.role.taker' : 'market.role.maker';
                            return (
                                <tr key={tr.id}>
                                    <td className="mk-dim">{format.dateTime(tr.executed_at)}</td>
                                    <td><span className={`side-${side}`}>{sideWord(side)}</span></td>
                                    <td>{m.fmtPrice(tr.price)}</td>
                                    <td>{m.fmtQty(tr.quantity)}</td>
                                    <td>{fmtToman(num(tr.price) * num(tr.quantity))}</td>
                                    <td>{t(role)}</td>
                                    <td><span className={`mk-src${tr.venue ? '' : ' user'}`}>{counterparty}</span></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    }

    const open = s.tab === 'open';
    const list = open
        ? [...s.open.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        : s.history;
    if (!list.length) return <div className="empty-state">{t(open ? 'market.orders.empty.open' : 'market.orders.empty.history')}</div>;
    return (
        <div className="table-scroll">
            <table className="data-table mk-table">
                <thead><tr>
                    <th>{t('market.orders.col.time')}</th><th>{t('market.orders.col.side')}</th>
                    <th>{t('market.orders.col.price')}</th><th>{t('market.orders.col.amount')}</th>
                    <th>{t('market.orders.col.filled')}</th><th>{t('market.orders.col.avg')}</th>
                    <th>{t('market.orders.col.total')}</th><th>{t('market.orders.col.status')}</th><th />
                </tr></thead>
                <tbody>
                    {list.map((o) => {
                        const qty = num(o.quantity);
                        const filled = num(o.filled_quantity);
                        const pct = qty > 0 ? (filled / qty) * 100 : 0;
                        const avg = filled > 0 ? num(o.filled_quote) / filled : null;
                        return (
                            <tr key={o.id}>
                                <td className="mk-dim">{format.dateTime(o.created_at)}</td>
                                <td><span className={`side-${o.side}`}>{sideWord(o.side)}</span></td>
                                <td>{m.fmtPrice(o.price)}</td>
                                <td>{m.fmtQty(qty)}</td>
                                <td><div className="mk-fill"><span>{m.fmtQty(filled)}</span><div className="mt-progress"><span style={{ width: `${pct.toFixed(1)}%` }} /></div></div></td>
                                <td>{avg === null ? '—' : m.fmtPrice(avg)}</td>
                                <td>{fmtToman(num(o.price) * qty)}</td>
                                <td><span className={`status-badge ${ORDER_BADGE[o.status] || 'pending'}`}>{t(`market.status.${o.status}`)}</span></td>
                                <td>
                                    {open && (
                                        <button className="btn mt-small mt-danger" type="button" disabled={s.cancelling.has(o.id)}
                                                onClick={() => void m.cancelOrder(o.id)}>{t('market.orders.cancel')}</button>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
