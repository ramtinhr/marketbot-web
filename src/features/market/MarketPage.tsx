import { useEffect } from 'react';

import { renderMessage, useI18n } from '../../i18n';
import { cx } from '../../shared/lib';
import { AssetsPanel } from './components/AssetsPanel';
import { MarketTrades } from './components/MarketTrades';
import { OrderBook } from './components/OrderBook';
import { Orders } from './components/Orders';
import { PriceChart } from './components/PriceChart';
import { Ticker } from './components/Ticker';
import { Toasts } from './components/Toasts';
import { TradePanel } from './components/TradeForm';
import { useMarketSession } from './useMarketSession';

export default function MarketPage() {
    const { t } = useI18n();
    const market = useMarketSession();
    const { notice } = market.s;

    // app.css widens this page's container off body.page-market.
    useEffect(() => {
        document.body.classList.add('page-market');
        return () => document.body.classList.remove('page-market');
    }, []);

    return (
        <div className="mk-page">
            <div className={cx('mt-notice', notice?.red && 'red')} hidden={!notice}>{notice && renderMessage(notice.message)}</div>

            <div className="mk-terminal">
                <Ticker market={market} />
                <OrderBook market={market} />
                <PriceChart market={market} />
                <TradePanel market={market} />
                <MarketTrades market={market} />
                <AssetsPanel market={market} />
                <Orders market={market} />
            </div>

            <footer className="page-footer">{t('market.footer')}</footer>

            <Toasts market={market} />
        </div>
    );
}
