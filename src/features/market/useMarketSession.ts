import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useI18n } from '../../i18n';
import { useInterval } from '../../shared/hooks';
import { usePageStatus } from '../../shared/stores/pageStatus';
import { MarketSession } from './session';

/**
 * The market session for as long as the page is open: started on mount,
 * following `?symbol=`, refreshing what the feed does not push, and
 * re-rendering the page on every change.
 */
export function useMarketSession(): MarketSession {
    const { locale } = useI18n();
    const status = usePageStatus();
    const [searchParams, setSearchParams] = useSearchParams();
    const [market] = useState(() => new MarketSession({ status, setSymbolParam: () => {} }));
    market.deps.setSymbolParam = (symbol) => setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('symbol', symbol);
        return next;
    }, { replace: true });

    useSyncExternalStore(market.subscribe, market.getVersion);

    const urlSymbol = searchParams.get('symbol');
    const initialSymbol = useRef(urlSymbol);
    useEffect(() => {
        market.start(initialSymbol.current);
        return () => market.dispose();
    }, [market]);
    useEffect(() => { market.followUrl(urlSymbol); }, [market, urlSymbol]);

    const shownLocale = useRef(locale);
    useEffect(() => {
        if (shownLocale.current === locale) return;
        shownLocale.current = locale;
        market.onLanguageChange();
    }, [market, locale]);

    useInterval(() => { if (market.s.inited) market.renderStatus(); }, 1000);
    useInterval(() => { if (market.s.inited) void market.loadStatus(); }, 15000);
    // The bot refreshes its balance cache every ~20s; a live page follows it.
    useInterval(() => { if (market.s.inited) void market.loadRealBalances(); }, 10000);

    return market;
}
