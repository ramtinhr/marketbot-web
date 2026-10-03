import { useI18n } from '../../../i18n';
import { fmtNum, fmtRounded } from '../../../shared/lib';
import { Stat, StatGrid } from '../../../shared/ui';
import { ratesFrom, type DashboardSnapshot } from '../api';

interface TodayProfitProps {
    snap: DashboardSnapshot | undefined;
    currency: string;
    onCurrency: (asset: string) => void;
}

// Recorded in Toman. Any other currency is that figure converted at the
// pair's current mid price, so it moves with the market; the rate used is
// printed under it rather than hidden.
function TodayProfitStat({ snap, currency: wanted, onCurrency }: TodayProfitProps) {
    const { t, plural, format } = useI18n();
    const symbols = snap?.symbols ?? [];
    const assets = ['IRT', ...symbols.filter((s) => s.endsWith('_IRT')).map((s) => s.split('_')[0])];
    const currency = assets.includes(wanted) ? wanted : 'IRT';

    const head = (
        <div className="stat-head">
            <div className="stat-label">{t('dashboard.stat.todayProfit')}</div>
            <select className="stat-select" aria-label={t('dashboard.stat.profitCurrency')}
                    value={currency} onChange={(e) => onCurrency(e.target.value)}>
                {assets.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
        </div>
    );

    const profit = snap?.profit;
    const toman = typeof profit?.today_profit_irt === 'number' ? profit.today_profit_irt : null;
    if (toman === null) return <Stat label="" head={head} value="—" sub="" />;

    const trades = typeof profit?.today_trades === 'number' ? plural('dashboard.stat.profitTrades', profit.today_trades) : '';
    let amount = fmtRounded(toman);
    let unit = t('dashboard.stat.toman');
    let note = trades;
    if (currency !== 'IRT') {
        const rate = ratesFrom(symbols, snap!.prices)[currency];
        if (!(rate > 0)) return <Stat label="" head={head} value="—" sub={t('dashboard.stat.profitNoPrice', { asset: currency })} />;
        // Significant digits, not fixed decimals: a day's profit is a few
        // thousandths of a USDT and a few billionths of a BTC.
        amount = format.number(toman / rate, { maximumSignificantDigits: 4 });
        unit = currency;
        const at = t('dashboard.stat.profitAt', { rate: fmtRounded(rate), asset: currency });
        note = trades ? `${trades} · ${at}` : at;
    }
    const tone = toman > 0 ? 'green' : toman < 0 ? 'red' : '';
    return <Stat label="" head={head} tone={tone} unit={unit} sub={note}
                 value={<bdi dir="ltr">{toman > 0 ? '+' : ''}{amount}</bdi>} />;
}

export function DashboardStats({ snap, profitCurrency, onProfitCurrency }: {
    snap: DashboardSnapshot | undefined;
    profitCurrency: string;
    onProfitCurrency: (asset: string) => void;
}) {
    const { t, format } = useI18n();
    const providers = snap?.quotes.providers ?? [];
    const online = providers.filter((p) => p.status === 'live').length;
    const arb = snap?.arb;
    const opps = arb?.opportunities ?? [];
    const best = opps.reduce((m, o) => Math.max(m, o.profit_pct || 0), -Infinity);
    const age = typeof arb?.data_age === 'number' ? arb.data_age : null;

    return (
        <StatGrid>
            <Stat label={t('dashboard.stat.providers')} value={snap ? `${format.number(online)}/${format.number(providers.length)}` : '—'} />
            <Stat label={t('dashboard.stat.symbols')} value={arb ? format.number((arb.active_symbols || []).length) : '—'} />
            <Stat label={t('dashboard.stat.opportunities')} tone="accent" value={arb ? format.number(opps.length) : '—'} />
            <Stat label={t('dashboard.stat.bestProfit')} tone="green" value={Number.isFinite(best) ? format.percent(best, 2) : '—'} />
            <Stat label={t('dashboard.stat.dataAge')} tone="amber" value={age !== null ? format.seconds(age, 1) : '—'} />
            <Stat label={t('dashboard.stat.totalBalance')} value={snap?.totalBalance != null ? fmtNum(Math.round(snap.totalBalance)) : '—'} />
            <TodayProfitStat snap={snap} currency={profitCurrency} onCurrency={onProfitCurrency} />
        </StatGrid>
    );
}
