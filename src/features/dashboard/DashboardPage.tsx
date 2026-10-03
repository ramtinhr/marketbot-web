import { useEffect } from 'react';

import { useI18n } from '../../i18n';
import { useStoredState } from '../../shared/hooks';
import { useTheme } from '../../shared/stores/theme';
import { PageFooter, Panel } from '../../shared/ui';
import { FALLBACK_SYMBOL, useDashboard } from './api';
import { DashboardStats } from './components/DashboardStats';
import { ArbitrageTable, BestPrices } from './components/MarketPanels';
import { BestRoute, QuoteGrid } from './components/ProviderQuotes';

// The pair the provider tiles show. Defaults to USDT_IRT rather than the first
// active symbol, which is whatever sorts first (ADA).
const QUOTE_SYMBOL_KEY = 'marketbot:dashboard:quoteSymbol';
const PROFIT_CURRENCY_KEY = 'marketbot:dashboard:profitCurrency';

export default function DashboardPage() {
    const { t } = useI18n();
    // Venue colours are theme-dependent.
    useTheme();
    const [quoteSymbol, setQuoteSymbol] = useStoredState(QUOTE_SYMBOL_KEY, FALLBACK_SYMBOL);
    const [profitCurrency, setProfitCurrency] = useStoredState(PROFIT_CURRENCY_KEY, 'IRT');
    const { data: snap } = useDashboard(quoteSymbol);

    // A stored pair the bot no longer polls is replaced by the one shown.
    useEffect(() => {
        if (snap && snap.symbol !== quoteSymbol) setQuoteSymbol(snap.symbol);
    }, [snap, quoteSymbol, setQuoteSymbol]);

    const symbols = snap?.symbols ?? [];
    const providers = snap?.quotes.providers;
    const opps = snap?.arb.opportunities;

    return (
        <>
            <DashboardStats snap={snap} profitCurrency={profitCurrency} onProfitCurrency={setProfitCurrency} />

            <Panel title={t('dashboard.providers.title')} count={providers?.length ?? 0} actions={(
                <div className="quote-controls">
                    <span className="panel-hint">{t('dashboard.providers.hint')}</span>
                    <select className="toolbar-select" aria-label={t('dashboard.providers.pair')}
                            value={quoteSymbol} onChange={(e) => setQuoteSymbol(e.target.value)}>
                        {symbols.map((s) => <option key={s} value={s}>{s.replace('_', '/')}</option>)}
                    </select>
                </div>
            )}>
                <BestRoute route={snap?.quotes.best_route} />
                <QuoteGrid providers={snap && (providers ?? [])} />
            </Panel>

            <Panel title={t('dashboard.prices.title')} hint={t('dashboard.prices.hint')}>
                <BestPrices symbols={symbols} prices={snap?.prices} />
            </Panel>

            <Panel title={t('dashboard.arbitrage.title')} count={opps?.length ?? 0} hint={t('dashboard.arbitrage.hint')}>
                <ArbitrageTable opportunities={snap && (opps ?? [])} />
            </Panel>

            <PageFooter>{t('dashboard.footer')}</PageFooter>
        </>
    );
}
