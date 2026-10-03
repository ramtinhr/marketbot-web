import { useI18n } from '../../../i18n';
import { cx, providerLabel } from '../../../shared/lib';
import { fmtTime, sideWord } from '../format';
import type { MarketSession } from '../session';

/** The pair's latest trades, newest first; ones that just arrived flash. */
export function MarketTrades({ market }: { market: MarketSession }) {
    const { t } = useI18n();
    const s = market.s;
    return (
        <section className="panel mk-trades">
            <div className="mk-panel-head">
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
                        <div key={tr.id} className={cx('mk-trade-row', tr.taker_side, s.flashIds?.has(tr.id) && 'flash')}
                             title={t('market.trades.tip', { source, side: sideWord(tr.taker_side) })}>
                            <span className="mk-price">{market.fmtPrice(tr.price)}</span>
                            <span>{market.fmtQty(tr.quantity)}</span>
                            <span className="mk-dim">{fmtTime(tr.executed_at)}</span>
                            <span><i className={cx('mk-src', !tr.venue && 'user')}>{source}</i></span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
