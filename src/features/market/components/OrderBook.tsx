import type { CSSProperties, ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { cx, providerLabel } from '../../../shared/lib';
import { cumulative, type BookRow, type BookSide } from '../book';
import { baseOf, dirArrow, dirClass, fmtToman, quoteLabel } from '../format';
import { BOOK_ROWS, type BookView, type MarketSession } from '../session';

const VIEWS: BookView[] = ['both', 'bids', 'asks'];

function BookLine({ market, side, row, cumulative: cum, maxCum, digits }: {
    market: MarketSession; side: BookSide; row: BookRow; cumulative: number; maxCum: number; digits: number;
}) {
    const { t } = useI18n();
    const base = baseOf(market.s.symbol);
    const pct = maxCum > 0 ? Math.min(100, (cum / maxCum) * 100) : 0;
    const tip = row.venues.length
        ? t('market.book.tip', { quantity: market.fmtQty(row.quantity), base, users: market.fmtQty(row.user), venues: row.venues.map(providerLabel).join(', ') })
        : t('market.book.tipUsers', { quantity: market.fmtQty(row.quantity), base });
    const mine = market.hasMine(side, row);
    return (
        <div className={cx('mk-row', side, mine && 'mine')}
             style={{ '--depth': `${pct.toFixed(1)}%` } as CSSProperties}
             title={tip + (mine ? ` · ${t('market.book.mine')}` : '')}
             onClick={() => market.rowClick(side, row.price, cum)}>
            <span className="mk-price">{row.user > 0 && <i className="mk-user-dot" aria-hidden="true" />}{market.fmtPrice(row.price, digits)}</span>
            <span>{market.fmtQty(row.quantity)}</span>
            <span className="mk-dim">{fmtToman(row.price * row.quantity)}</span>
        </div>
    );
}

function BookRatio({ ratio }: { ratio: { bid: number; ask: number } }) {
    const { t, format } = useI18n();
    return (
        <div className="mk-ratio" title={t('market.book.ratio.hint')}>
            <span className="mk-up">{t('market.book.ratio.buy')} {format.percent(ratio.bid, 1)}</span>
            <div className="mk-ratio-bar" aria-hidden="true">
                <i className="bid" style={{ width: `${ratio.bid.toFixed(1)}%` }} />
                <i className="ask" style={{ width: `${ratio.ask.toFixed(1)}%` }} />
            </div>
            <span className="mk-down">{format.percent(ratio.ask, 1)} {t('market.book.ratio.sell')}</span>
        </div>
    );
}

function BookControls({ market }: { market: MarketSession }) {
    const { t, format } = useI18n();
    const s = market.s;
    return (
        <div className="toolbar-group">
            <div className="segmented" id="bookView">
                {VIEWS.map((v) => (
                    <button key={v} type="button" className={s.view === v ? 'active' : ''}
                            title={t(`market.book.view.${v}`)} aria-label={t(`market.book.view.${v}`)}
                            onClick={() => market.setView(v)}>
                        <span className={`mk-view-icon ${v}`} aria-hidden="true" />
                    </button>
                ))}
            </div>
            <select className="toolbar-select" aria-label={t('market.book.group')}
                    value={String(s.group)} onChange={(e) => market.setGroup(e.target.value)}>
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
    );
}

/** The consolidated book: asks above the spread, bids below, grouped and clickable. */
export function OrderBook({ market }: { market: MarketSession }) {
    const { t, format } = useI18n();
    const s = market.s;
    const base = baseOf(s.symbol);
    const { view } = s;
    const rows = view === 'both' ? BOOK_ROWS : BOOK_ROWS * 2;
    const digits = market.priceDigits();
    const { last, market: price, spread, mid } = market.quote();

    const empty = <div className="mk-book-empty">{t('market.book.empty')}</div>;
    let asksBody: ReactNode;
    let bidsBody: ReactNode;
    // How the shown book splits between buyers and sellers, by amount.
    let ratio: { bid: number; ask: number } | null = null;
    if (!s.depth) {
        asksBody = view === 'bids' ? null : <div className="mk-book-empty">{t('market.book.waiting')}</div>;
        bidsBody = null;
    } else {
        const asks = market.bookRows('ask').slice(0, rows);
        const bids = market.bookRows('bid').slice(0, rows);
        const askCum = cumulative(asks);
        const bidCum = cumulative(bids);
        const askTotal = askCum.at(-1) || 0;
        const bidTotal = bidCum.at(-1) || 0;
        const maxCum = Math.max(askTotal, bidTotal);
        if (bidTotal + askTotal > 0) {
            const bidPct = (bidTotal / (bidTotal + askTotal)) * 100;
            ratio = { bid: bidPct, ask: 100 - bidPct };
        }
        const line = (side: BookSide, r: BookRow, cum: number) => (
            <BookLine key={r.price} market={market} side={side} row={r} cumulative={cum} maxCum={maxCum} digits={digits} />
        );
        // Asks read upwards from the spread, so the best ask sits just above it.
        asksBody = asks.length ? asks.map((r, i) => line('ask', r, askCum[i])).reverse() : empty;
        bidsBody = bids.length ? bids.map((r, i) => line('bid', r, bidCum[i])) : empty;
    }

    return (
        <section className="panel mk-book">
            <div className="mk-panel-head">
                <h2>{t('market.book.title')}</h2>
                <BookControls market={market} />
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
                    {price === null ? '—' : market.fmtPrice(price, digits) + dirArrow(s.marketDirection)}
                </strong>
                <div className="mk-mid-meta">
                    <span>{spread === null ? '' : t('market.book.spreadLine', {
                        spread: market.fmtPrice(spread, digits), pct: format.percent(mid ? (spread / mid) * 100 : 0, 3),
                    })}</span>
                    <span>{last === null
                        ? t('market.book.noTrade')
                        : t('market.book.lastTrade', { price: market.fmtPrice(last, digits) + dirArrow(s.lastDirection) })}</span>
                </div>
            </div>
            <div className="mk-side mk-bids" hidden={view === 'asks'}
                 style={{ '--rows': view === 'asks' ? 0 : rows } as CSSProperties}>{bidsBody}</div>
            {ratio && <BookRatio ratio={ratio} />}
            <div className="mk-legend">
                <span><i className="mk-user-dot" aria-hidden="true" /><span>{t('market.book.legend.users')}</span></span>
                <span><i className="mk-mine-mark" aria-hidden="true" /><span>{t('market.book.legend.mine')}</span></span>
            </div>
        </section>
    );
}
