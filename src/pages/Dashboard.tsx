import { useState } from 'react';

import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { API_BASE, fetchJSON, type JsonResult } from '../lib/api';
import { usePolling, useStoredState } from '../lib/hooks';
import { useTheme } from '../lib/theme';
import { fmtNum, providerColor } from '../lib/ui';
import Template from '../components/Template';

const FALLBACK_SYMBOL = 'USDT_IRT';
// The pair the provider tiles show. Defaults to USDT_IRT rather than the first
// active symbol, which is whatever sorts first (ADA).
const QUOTE_SYMBOL_KEY = 'marketbot:dashboard:quoteSymbol';
const PROFIT_CURRENCY_KEY = 'marketbot:dashboard:profitCurrency';

const STATUS_BADGE: Record<string, string> = {
    live: 'online',
    stale: 'stale',
    no_quote: 'offline',
    circuit_open: 'offline',
};

interface Snapshot {
    symbols: string[];
    quotes: any;
    arb: any;
    balances: any;
    profit: any;
    prices: JsonResult[];
}

/** Toman per unit of each base asset, as the mid of the best bid and ask across venues. */
function ratesFrom(symbols: string[], results: JsonResult[]): Record<string, number> {
    const rates: Record<string, number> = {};
    symbols.forEach((symbol, i) => {
        const d = results[i] && results[i].ok ? results[i].data : null;
        const [base, quote] = symbol.split('_');
        if (quote !== 'IRT' || !d || !d.best_bid || !d.best_ask) return;
        const mid = (d.best_bid.price + d.best_ask.price) / 2;
        if (mid > 0) rates[base] = mid;
    });
    return rates;
}

export default function Dashboard() {
    const { t, format, plural, locale } = useI18n();
    useTheme();
    const status = usePageStatus();
    const [quoteSymbol, setQuoteSymbol] = useStoredState(QUOTE_SYMBOL_KEY, FALLBACK_SYMBOL);
    const [profitCurrencyPref, setProfitCurrency] = useStoredState(PROFIT_CURRENCY_KEY, 'IRT');
    const [snap, setSnap] = useState<Snapshot | null>(null);

    // Enough decimals to tell two quotes apart at any price: whole Toman on
    // USDT, but SHIB trades near 1 and would round every venue to the same
    // figure. A difference of prices takes the scale of the prices (ref).
    const fmtPrice = (n: number, ref: number = n) => {
        const abs = Math.abs(Number(ref));
        const digits = abs >= 1000 ? 1 : abs >= 1 ? 4 : 8;
        return format.number(n, { maximumFractionDigits: digits });
    };
    const fmtAge = (seconds: unknown) => typeof seconds !== 'number'
        ? t('common.na')
        : t('dashboard.providers.age', { age: format.seconds(seconds, seconds < 10 ? 1 : 0) });

    async function fetchData() {
        try {
            // The pairs the bot actually polls, straight from the price cache,
            // so a pair added to the bot shows up without touching this page.
            const listing = await fetchJSON('/best-prices');
            const listed = listing.ok && Array.isArray(listing.data?.active_symbols) ? listing.data.active_symbols as string[] : null;
            const symbols = listed && listed.length ? listed : (snap?.symbols.length ? snap.symbols : [FALLBACK_SYMBOL]);

            let symbol = quoteSymbol;
            if (!symbols.includes(symbol)) {
                symbol = symbols.includes('USDT_IRT') ? 'USDT_IRT' : symbols[0];
                setQuoteSymbol(symbol);
            }
            // Tiles read what the bot already published - never /providers,
            // which health-checks every exchange live and would spend trading's
            // rate limit on each 2s poll.
            const [quotesRes, arbRes, balancesRes, profitRes, ...priceResults] = await Promise.all([
                fetchJSON(`/provider-quotes?symbol=${encodeURIComponent(symbol)}`),
                fetchJSON('/arbitrage'),
                fetchJSON('/balances'),
                fetchJSON('/profit/daily?days=14'),
                ...symbols.map(s => fetchJSON(`/best-prices?symbol=${encodeURIComponent(s)}`)
                    .catch(() => ({ ok: false, status: 0, data: null }))),
            ]);
            setSnap({
                symbols,
                quotes: quotesRes.data,
                arb: arbRes.data,
                balances: balancesRes.data,
                profit: profitRes.data,
                prices: priceResults,
            });
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error fetching data:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('error.unreachable', { base: API_BASE }));
        }
    }

    // A language change repaints from data; a symbol change refetches.
    usePolling(fetchData, 2000, [quoteSymbol, locale]);

    const symbols = snap?.symbols || [];
    const quotes = snap?.quotes;
    const arb = snap?.arb;
    const providers: any[] | undefined = quotes?.providers;

    // ---- Stats ----
    const online = (providers || []).filter(p => p.status === 'live').length;
    const opps: any[] = arb?.opportunities || [];
    const best = opps.reduce((m, o) => Math.max(m, o.profit_pct || 0), -Infinity);
    const age = arb && typeof arb.data_age === 'number' ? arb.data_age : null;
    const totalBalance = snap?.balances && typeof snap.balances.total_irt === 'number' ? snap.balances.total_irt : null;

    // ---- Today's profit, in a currency of the reader's choosing ----
    // Recorded in Toman. Any other currency is that figure converted at the
    // pair's current mid price, so it moves with the market; the rate used is
    // printed under it rather than hidden.
    const profitAssets = ['IRT', ...symbols.filter(s => s.endsWith('_IRT')).map(s => s.split('_')[0])];
    const profitCurrency = profitAssets.includes(profitCurrencyPref) ? profitCurrencyPref : 'IRT';
    const rates = snap ? ratesFrom(symbols, snap.prices) : {};

    function renderTodayProfit() {
        const data = snap?.profit;
        const toman = data && typeof data.today_profit_irt === 'number' ? data.today_profit_irt as number : null;
        if (toman === null) return { value: <div className="stat-value">—</div>, sub: '' };

        const trades = typeof data.today_trades === 'number' ? plural('dashboard.stat.profitTrades', data.today_trades) : '';
        let amount: string;
        let unit: string;
        let note = trades;
        if (profitCurrency === 'IRT') {
            amount = fmtNum(Math.round(toman));
            unit = t('dashboard.stat.toman');
        } else {
            const rate = rates[profitCurrency];
            if (!(rate > 0)) {
                return {
                    value: <div className="stat-value">—</div>,
                    sub: t('dashboard.stat.profitNoPrice', { asset: profitCurrency }),
                };
            }
            // Significant digits, not fixed decimals: a day's profit is a few
            // thousandths of a USDT and a few billionths of a BTC.
            amount = format.number(toman / rate, { maximumSignificantDigits: 4 });
            unit = profitCurrency;
            const at = t('dashboard.stat.profitAt', { rate: fmtNum(Math.round(rate)), asset: profitCurrency });
            note = trades ? `${trades} · ${at}` : at;
        }
        const tone = toman > 0 ? ' green' : toman < 0 ? ' red' : '';
        return {
            value: (
                <div className={`stat-value${tone}`}>
                    <bdi dir="ltr">{toman > 0 ? '+' : ''}{amount}</bdi><span className="stat-unit">{unit}</span>
                </div>
            ),
            sub: note,
        };
    }
    const todayProfit = renderTodayProfit();

    return (
        <>
            {/* Summary stats */}
            <div className="stats">
                <div className="stat">
                    <div className="stat-label">{t('dashboard.stat.providers')}</div>
                    <div className="stat-value">{snap ? `${format.number(online)}/${format.number((providers || []).length)}` : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('dashboard.stat.symbols')}</div>
                    <div className="stat-value">{arb ? format.number((arb.active_symbols || []).length) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('dashboard.stat.opportunities')}</div>
                    <div className="stat-value accent">{arb ? format.number(opps.length) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('dashboard.stat.bestProfit')}</div>
                    <div className="stat-value green">{isFinite(best) ? format.percent(best, 2) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('dashboard.stat.dataAge')}</div>
                    <div className="stat-value amber">{age !== null ? format.seconds(age, 1) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('dashboard.stat.totalBalance')}</div>
                    <div className="stat-value">{totalBalance !== null ? fmtNum(Math.round(totalBalance)) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-head">
                        <div className="stat-label">{t('dashboard.stat.todayProfit')}</div>
                        <select className="stat-select" aria-label={t('dashboard.stat.profitCurrency')}
                                value={profitCurrency} onChange={e => setProfitCurrency(e.target.value)}>
                            {profitAssets.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    {todayProfit.value}
                    <div className="stat-sub">{todayProfit.sub}</div>
                </div>
            </div>

            {/* Providers */}
            <section className="panel" id="providers">
                <div className="panel-header">
                    <h2><span>{t('dashboard.providers.title')}</span> <span className="count">{providers ? providers.length : 0}</span></h2>
                    <div className="quote-controls">
                        <span className="panel-hint">{t('dashboard.providers.hint')}</span>
                        <select className="toolbar-select" aria-label={t('dashboard.providers.pair')}
                                value={quoteSymbol} onChange={e => setQuoteSymbol(e.target.value)}>
                            {symbols.map(s => <option key={s} value={s}>{s.replace('_', '/')}</option>)}
                        </select>
                    </div>
                </div>
                <BestRoute route={quotes?.best_route} fmtPrice={fmtPrice} />
                <div className="grid quote-grid">
                    {!snap ? (
                        <div className="skeleton">{t('dashboard.providers.loading')}</div>
                    ) : !providers || providers.length === 0 ? (
                        <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                            <span className="big">🔌</span>{t('dashboard.providers.empty')}
                        </div>
                    ) : providers.map(p => (
                        <QuoteCard key={p.code} p={p} fmtPrice={fmtPrice} fmtAge={fmtAge} />
                    ))}
                </div>
            </section>

            {/* Best prices */}
            <section className="panel" id="prices">
                <div className="panel-header">
                    <h2>{t('dashboard.prices.title')}</h2>
                    <span className="panel-hint">{t('dashboard.prices.hint')}</span>
                </div>
                <div className="price-cards">
                    {!snap ? <div className="skeleton">{t('dashboard.prices.loading')}</div> : symbols.map((symbol, i) => {
                        const r = snap.prices[i];
                        const d = r && r.ok ? r.data : null;
                        if (!d || !d.best_bid || !d.best_ask) {
                            return (
                                <div className="price-card" key={symbol}>
                                    <div className="symbol">{symbol}</div>
                                    <div className="empty-state" style={{ padding: '10px 0' }}>{t('dashboard.prices.noData')}</div>
                                </div>
                            );
                        }
                        return (
                            <div className="price-card" key={symbol}>
                                <div className="symbol">{symbol}</div>
                                <div className="bid-ask-row">
                                    <div className="bid-ask-col">
                                        <div className="bid-ask-label">{t('dashboard.prices.bestBid')}</div>
                                        <div className="bid-ask-price bid">{fmtNum(d.best_bid.price)}</div>
                                        <div className="bid-ask-provider">{d.best_bid.provider}</div>
                                    </div>
                                    <div className="bid-ask-col" style={{ textAlign: 'end' }}>
                                        <div className="bid-ask-label">{t('dashboard.prices.bestAsk')}</div>
                                        <div className="bid-ask-price ask">{fmtNum(d.best_ask.price)}</div>
                                        <div className="bid-ask-provider">{d.best_ask.provider}</div>
                                    </div>
                                </div>
                                <div className="spread-line">
                                    <span>{t('common.spread')}</span>
                                    <b>{fmtNum(d.spread)} ({format.percent(d.spread_pct || 0, 2)})</b>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Arbitrage opportunities */}
            <section className="panel" id="arbitrage">
                <div className="panel-header">
                    <h2><span>{t('dashboard.arbitrage.title')}</span> <span className="count">{opps.length}</span></h2>
                    <span className="panel-hint">{t('dashboard.arbitrage.hint')}</span>
                </div>
                <div>
                    {!snap ? (
                        <div className="skeleton">{t('dashboard.arbitrage.loading')}</div>
                    ) : opps.length === 0 ? (
                        <div className="empty-state"><span className="big">📭</span>{t('dashboard.arbitrage.empty')}</div>
                    ) : (
                        <div className="table-scroll">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{t('common.buySell')}</th>
                                        <th>{t('common.symbol')}</th>
                                        <th>{t('common.buyPrice')}</th>
                                        <th>{t('common.sellPrice')}</th>
                                        <th>{t('common.spread')}</th>
                                        <th>{t('common.fees')}</th>
                                        <th>{t('common.profit')}</th>
                                        <th>{t('common.profitPct')}</th>
                                        <th>{t('dashboard.arbitrage.maxAmount')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...opps].sort((a, b) => b.profit_pct - a.profit_pct).map((o, i) => {
                                        const profitable = o.profit_after_fees > 0;
                                        const profitClass = profitable ? 'profit-positive' : 'profit-negative';
                                        return (
                                            <tr key={i} className={profitable ? 'profitable' : ''}>
                                                <td className="route-cell">
                                                    <span className="provider-tag">{o.buy_provider}</span><span className="arrow">→</span><span className="provider-tag">{o.sell_provider}</span>
                                                </td>
                                                <td>{o.symbol}</td>
                                                <td>{fmtNum(o.buy_price)}</td>
                                                <td>{fmtNum(o.sell_price)}</td>
                                                <td>{fmtNum(o.raw_spread)} <span className="fee-text">({format.percent(o.raw_spread_pct, 4)})</span></td>
                                                <td className="fee-text">{format.percent(o.total_fee_pct, 4)}</td>
                                                <td className={profitClass}>{fmtNum(o.profit_after_fees)}</td>
                                                <td className={profitClass}>{format.percent(o.profit_pct, 3)}</td>
                                                <td>{format.decimal(o.max_amount, 2)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>

            <footer className="page-footer">{t('dashboard.footer')}</footer>
        </>
    );
}

function BestRoute({ route, fmtPrice }: { route: any; fmtPrice: (n: number, ref?: number) => string }) {
    const { t, format } = useI18n();
    if (!route) return null;
    const clears = route.clears_min_profit === true;
    const positive = route.net_per_unit > 0;
    const sign = (n: number) => (n > 0 ? '+' : '');
    // Signed figures are isolated left-to-right, or a Persian page renders
    // -150 as 150- and the loss reads as a gain.
    const signed = (n: number, text: string) => <bdi dir="ltr">{sign(n)}{text}</bdi>;

    return (
        <div className={`best-route ${clears ? 'clears' : positive ? 'thin' : 'loss'}`}>
            <span className="br-label">{t('dashboard.providers.route.title')}</span>
            <span className="br-leg">
                {t('dashboard.providers.route.buy')}
                {' '}<span className="provider-tag">{route.buy_provider}</span>
                {' '}<b className="mono">{fmtPrice(route.buy_net)}</b>
            </span>
            <span className="arrow">→</span>
            <span className="br-leg">
                {t('dashboard.providers.route.sell')}
                {' '}<span className="provider-tag">{route.sell_provider}</span>
                {' '}<b className="mono">{fmtPrice(route.sell_net)}</b>
            </span>
            <span className="br-net mono">
                {signed(route.net_per_unit, fmtPrice(route.net_per_unit, route.buy_price))}
                {' '}({signed(route.profit_pct, format.percent(route.profit_pct, 3))})
            </span>
            {typeof route.trade_profit_toman === 'number' && (
                <span className="br-trade">
                    <Template
                        template={t('dashboard.providers.route.perTrade', {
                            notional: fmtNum(Math.round(route.trade_notional_toman)),
                        })}
                        nodes={{ profit: signed(route.trade_profit_toman, fmtNum(Math.round(route.trade_profit_toman))) }}
                    />
                    {typeof route.min_profit_toman === 'number'
                        ? ` · ${t(clears ? 'dashboard.providers.route.clears' : 'dashboard.providers.route.short',
                            { min: fmtNum(route.min_profit_toman) })}`
                        : ''}
                </span>
            )}
        </div>
    );
}

function QuoteCard({ p, fmtPrice, fmtAge }: {
    p: any;
    fmtPrice: (n: number, ref?: number) => string;
    fmtAge: (s: unknown) => string;
}) {
    const { t, format } = useI18n();
    const circuit: string = p.circuit_state || 'closed';
    const orderCircuit: string | undefined = p.order_circuit_state;

    return (
        <div className={`card quote-card status-${p.status}`}>
            <div className="card-header">
                <span className="provider-name"><span className="provider-dot" style={{ background: providerColor(p.code) }} />{p.code}</span>
                <span className={`status-badge ${STATUS_BADGE[p.status] || 'offline'}`}>{t(`dashboard.providers.status.${p.status}`)}</span>
            </div>
            <div className="card-meta">
                <span className="chip">{t('dashboard.providers.fee', { fee: format.percent(p.fee_pct, 2) })}</span>
                {p.has_quote && <span className={`chip${p.stale ? ' stale-text' : ''}`}>{fmtAge(p.age_s)}</span>}
                {/* A closed circuit is the normal case; only a tripped one earns a chip. */}
                {circuit !== 'closed' && (
                    <span className={`chip circuit-${circuit.replace('_', '-')}`}>{t('dashboard.providers.circuit', { state: circuit })}</span>
                )}
                {orderCircuit && orderCircuit !== 'closed' && (
                    <span className={`chip circuit-${orderCircuit.replace('_', '-')}`}>{t('dashboard.providers.orderCircuit', { state: orderCircuit })}</span>
                )}
            </div>
            {p.has_quote ? (
                <>
                    <div className="q-sides">
                        <QuoteSide side="bid" p={p} fmtPrice={fmtPrice} />
                        <QuoteSide side="ask" p={p} fmtPrice={fmtPrice} />
                    </div>
                    <div className="q-spread">
                        <span>{t('common.spread')}</span>
                        <b className="mono">{fmtPrice(p.spread, p.ask)} <span className="fee-text">({format.percent(p.spread_pct, 3)})</span></b>
                    </div>
                </>
            ) : (
                <div className="empty-state q-empty">{t('dashboard.providers.noQuote')}</div>
            )}
        </div>
    );
}

function QuoteSide({ side, p, fmtPrice }: { side: 'bid' | 'ask'; p: any; fmtPrice: (n: number, ref?: number) => string }) {
    const { t } = useI18n();
    const isBid = side === 'bid';
    const price = isBid ? p.bid : p.ask;
    const net = isBid ? p.bid_net : p.ask_net;
    const size = isBid ? p.bid_size : p.ask_size;
    const best = isBid ? p.best_to_sell : p.best_to_buy;
    return (
        <div className={`q-side ${side}${best ? ' best' : ''}`}>
            <div className="q-label">
                {t(isBid ? 'dashboard.providers.bid' : 'dashboard.providers.ask')}
                {best && <span className="q-best">{t(isBid ? 'dashboard.providers.bestSell' : 'dashboard.providers.bestBuy')}</span>}
            </div>
            <div className="q-price">{fmtPrice(price)}</div>
            <div className="q-net" title={t(isBid ? 'dashboard.providers.netBidHint' : 'dashboard.providers.netAskHint')}>
                {t('dashboard.providers.net')} <b>{fmtPrice(net)}</b>
            </div>
            <div className="q-size">{t('dashboard.providers.size')} {size > 0 ? fmtPrice(size) : t('common.na')}</div>
        </div>
    );
}
