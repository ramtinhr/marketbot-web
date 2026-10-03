import type { ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { cx } from '../../../shared/lib';
import { baseOf, dirClass, fmtToman, pairLabel, quoteLabel } from '../format';
import type { MarketSession } from '../session';

const MODE_BADGE = { demo: 'simulated', liveNoBot: 'failed', liveOff: 'stale', liveSimulated: 'pending', liveReal: 'failed' };

function TickerStat({ label, value, className, hint }: { label: string; value: ReactNode; className?: string; hint?: string }) {
    return (
        <div className="mk-stat">
            <span title={hint}>{label}</span>
            <strong className={className}>{value}</strong>
        </div>
    );
}

function Badges({ market }: { market: MarketSession }) {
    const { t } = useI18n();
    const s = market.s;
    const mode = market.modeState();
    const liquidity = !s.depth
        ? { cls: 'pending', text: t('market.liquidity.none') }
        : s.depth.venue_liquidity
            ? { cls: 'ok', text: t('market.liquidity.venues') }
            : { cls: 'stale', text: t('market.liquidity.usersOnly') };
    return (
        <div className="mk-badges">
            <span className={`status-badge ${liquidity.cls}`} title={t('market.liquidity')}>{liquidity.text}</span>
            {mode && (
                <span className={`status-badge ${MODE_BADGE[mode]}`} title={t(`market.mode.hint.${mode}`, {
                    cap: s.hedging && s.hedging.max_notional_toman ? fmtToman(s.hedging.max_notional_toman) : '—',
                })}>{t(`market.mode.${mode}`)}</span>
            )}
        </div>
    );
}

/** The pair, its headline price and day figures, the market's mode, and who is trading. */
export function Ticker({ market }: { market: MarketSession }) {
    const { t, format } = useI18n();
    const s = market.s;
    const base = baseOf(s.symbol);
    const { last, market: price, spread, mid } = market.quote();

    const day = s.summary;
    const change = day ? day.close - day.open : null;
    const changePct = day && day.open ? (change as number) / day.open * 100 : null;
    const sign = (n: number) => (n > 0 ? '+' : '');

    return (
        <header className="panel mk-ticker">
            <div className="mk-pair">
                <div className="mk-pair-icon" aria-hidden="true">{base.slice(0, 4)}</div>
                <select aria-label={t('market.pair')} value={s.symbol || ''} onChange={(e) => market.selectSymbol(e.target.value)}>
                    {s.symbols.map((sym) => <option key={sym} value={sym}>{pairLabel(sym)}</option>)}
                </select>
            </div>
            <div className="mk-headline">
                <strong className={cx('mk-last', dirClass(s.marketDirection))} title={t('market.price.hint')}>
                    {price === null ? '—' : market.fmtPrice(price)}
                </strong>
                <span className={dirClass(s.lastDirection)}>
                    {last === null ? t('market.book.noTrade') : t('market.book.lastTrade', { price: market.fmtPrice(last) })}
                </span>
            </div>
            <div className="mk-stats">
                <TickerStat label={t('market.ticker.change')} className={dirClass(change ?? 0)} hint={t('market.ticker.hint')}
                            value={change === null ? '—' : `${sign(change)}${market.fmtPrice(change)} ${sign(change)}${format.percent(changePct ?? 0, 2)}`} />
                <TickerStat label={t('market.ticker.high')} value={day ? market.fmtPrice(day.high) : '—'} />
                <TickerStat label={t('market.ticker.low')} value={day ? market.fmtPrice(day.low) : '—'} />
                <TickerStat label={t('market.ticker.volume', { asset: base })} value={day ? market.fmtQty(day.volume) : '—'} />
                <TickerStat label={t('market.ticker.volume', { asset: quoteLabel() })} value={day ? fmtToman(day.quoteVolume) : '—'} />
                <TickerStat label={t('market.spread')}
                            value={spread === null ? '—' : `${market.fmtPrice(spread)} (${format.percent(mid ? (spread / mid) * 100 : 0, 3)})`} />
            </div>
            <div className="mk-spacer" />
            <Badges market={market} />
            <div className="mk-user">
                <label htmlFor="userSelect">{t('market.tradingAs')}</label>
                <select id="userSelect" className="toolbar-select" value={s.userId || ''} onChange={(e) => market.selectUser(e.target.value)}>
                    {s.users.length
                        ? s.users.map((u) => <option key={u.id} value={u.id}>{u.display_name} ({u.username})</option>)
                        : s.inited && <option value="">{t('market.users.none')}</option>}
                </select>
            </div>
        </header>
    );
}
