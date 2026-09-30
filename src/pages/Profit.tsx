import { useState } from 'react';

import Html from '../components/Html';
import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { API_BASE, fetchJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { fmtNum } from '../lib/ui';

function diffClass(v: unknown): string {
    if (v === null || v === undefined || isNaN(v as number)) return '';
    return (v as number) >= 0 ? 'profit-positive' : 'profit-negative';
}

interface Snapshot {
    predicted: any;
    verified: any;
}

const METHOD_ROWS: Array<{ key: string; trustClass?: string }> = [
    { key: 'roundTrip', trustClass: 'profit-positive' },
    { key: 'unmatched' },
    { key: 'net', trustClass: 'profit-positive' },
    { key: 'axes' },
    { key: 'predicted' },
    { key: 'excluded' },
];

export default function Profit() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();
    const [snap, setSnap] = useState<Snapshot | null>(null);

    async function fetchData() {
        try {
            const [predictedRes, verifiedRes] = await Promise.all([
                fetchJSON('/profit/daily?days=30'),
                fetchJSON('/profit/daily-verified?days=30'),
            ]);
            if (!predictedRes.ok) throw new Error((predictedRes.data && predictedRes.data.error) || t('error.requestFailed'));
            if (!verifiedRes.ok) throw new Error((verifiedRes.data && verifiedRes.data.error) || t('error.requestFailed'));

            setSnap({ predicted: predictedRes.data, verified: verifiedRes.data });
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error fetching profit history:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('error.unreachable', { base: API_BASE }));
        }
    }

    usePolling(fetchData, 15000, [locale]);

    return (
        <>
            <VerifiedStats data={snap ? snap.verified : null} />

            <section className="panel">
                <div className="panel-header">
                    <h2>{t('profit.verified.title')}</h2>
                    <span className="panel-hint">{t('profit.verified.hint')}</span>
                </div>
                <div>
                    {snap ? <VerifiedTable data={snap.verified} /> : <div className="skeleton">{t('profit.verified.loading')}</div>}
                </div>
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2>{t('profit.trades.title')}</h2>
                    <span className="panel-hint">{t('profit.trades.hint')}</span>
                </div>
                <div>
                    {snap ? <TradesTable data={snap.verified} /> : <div className="skeleton">{t('profit.trades.loading')}</div>}
                </div>
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2>{t('profit.method.title')}</h2>
                    <span className="panel-hint">{t('profit.method.hint')}</span>
                </div>
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('profit.method.col.figure')}</th>
                                <th>{t('profit.method.col.source')}</th>
                                <th>{t('profit.method.col.trust')}</th>
                            </tr>
                        </thead>
                        {/* The source and trust cells carry <em>/<code> emphasis that is part
                            of the sentence, so they are translated as markup rather than text. */}
                        <tbody>
                            {METHOD_ROWS.map(row => (
                                <tr key={row.key}>
                                    <td><strong>{t(`profit.method.${row.key}.name`)}</strong></td>
                                    <Html as="td" k={`profit.method.${row.key}.source`} />
                                    <Html as="td" k={`profit.method.${row.key}.trust`} className={row.trustClass} />
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="panel">
                <div className="panel-header">
                    <h2>{t('profit.predicted.title')}</h2>
                    <span className="panel-hint">{t('profit.predicted.hint')}</span>
                </div>
                <div>
                    {snap ? <PredictedTable data={snap.predicted} /> : <div className="skeleton">{t('profit.predicted.loading')}</div>}
                </div>
            </section>

            <footer className="page-footer">{t('profit.footer')}</footer>
        </>
    );
}

function Stat({ label, value, valueClass, sub }: { label: string; value: string; valueClass?: string; sub: string }) {
    return (
        <div className="stat">
            <div className="stat-label">{label}</div>
            <div className={'stat-value' + (valueClass ? ' ' + valueClass : '')}>{value}</div>
            <div className="stat-sub">{sub}</div>
        </div>
    );
}

function VerifiedStats({ data }: { data: any }) {
    const { t, format } = useI18n();
    const dec = (v: unknown, d: number) => format.decimal((v as number) || 0, d);
    const rows: any[] = (data && data.daily) || [];
    const totals = (data && data.totals) || {};

    let roundTrip = { value: '—', cls: '', sub: '' };
    let unmatchedStat = { value: '—', cls: '', sub: '' };
    let net = { value: '—', cls: '', sub: '' };
    let usdt = { value: '—', cls: '' };
    let irt = { value: '—', cls: '' };
    let trades = '—';
    let excludedSub = '';

    if (data && rows.length === 0) {
        trades = format.number(0);
        net.sub = t('profit.verified.noPairs');
    } else if (data) {
        // Profit first and on its own. The combined net is kept, demoted, and
        // labelled - it is the honest total of everything that moved, but it
        // answers "how did the balance change", not "did we earn".
        roundTrip = {
            value: fmtNum(Math.round(totals.round_trip_net_irt || 0)) + ' IRT',
            cls: diffClass(totals.round_trip_net_irt),
            sub: t('profit.verified.roundTripSub', { count: fmtNum(totals.round_trip_trades || 0) }),
        };

        const unmatched = totals.unmatched_trades || 0;
        unmatchedStat = {
            value: unmatched ? fmtNum(Math.round(totals.unmatched_net_irt || 0)) + ' IRT' : t('common.none'),
            cls: unmatched ? diffClass(totals.unmatched_net_irt) : '',
            sub: unmatched
                ? t('profit.verified.unmatchedSub', { count: fmtNum(unmatched) })
                : t('profit.verified.allRoundTripped'),
        };

        let netSub = t('profit.verified.netSub', { usdt: dec(totals.net_usdt, 4) });
        if (totals.days_unvalued) {
            netSub += ' · ' + t('profit.verified.unvalued', { count: fmtNum(totals.days_unvalued) });
        }
        net = { value: fmtNum(Math.round(totals.net_irt || 0)) + ' IRT', cls: diffClass(totals.net_irt), sub: netSub };
        usdt = { value: dec(totals.usdt, 4), cls: diffClass(totals.usdt) };
        irt = { value: fmtNum(Math.round(totals.irt || 0)), cls: diffClass(totals.irt) };
        trades = fmtNum(totals.trades || 0);

        // Coverage before profit: a net computed over half the trades is not
        // an answer, so say plainly how much of the trading it covers.
        const excluded = totals.excluded_trades || 0;
        const unmeasured = totals.unmeasured_trades || 0;
        const placed = totals.placed_trades || 0;
        const gaps: string[] = [];
        if (excluded) gaps.push(t('profit.verified.excluded', { count: fmtNum(excluded) }));
        if (unmeasured) gaps.push(t('profit.verified.unmeasured', { count: fmtNum(unmeasured) }));
        excludedSub = gaps.length
            ? t('profit.verified.gaps', { placed: fmtNum(placed), gaps: gaps.join(' · ') })
            : t('profit.verified.allMeasured', { placed: fmtNum(placed) });
    }

    return (
        <div className="stats">
            <Stat label={t('profit.stat.roundTrip')} value={roundTrip.value} valueClass={roundTrip.cls} sub={roundTrip.sub} />
            <Stat label={t('profit.stat.unmatched')} value={unmatchedStat.value} valueClass={unmatchedStat.cls} sub={unmatchedStat.sub} />
            <Stat label={t('profit.stat.net')} value={net.value} valueClass={net.cls} sub={net.sub} />
            <Stat label={t('profit.stat.usdt')} value={usdt.value} valueClass={usdt.cls} sub={t('profit.stat.usdtSub')} />
            <Stat label={t('profit.stat.irt')} value={irt.value} valueClass={irt.cls} sub={t('profit.stat.irtSub')} />
            <Stat label={t('profit.stat.trades')} value={trades} sub={excludedSub} />
        </div>
    );
}

// The measured half of the page. Deliberately rendered before the
// prediction below it: the prediction is what the bot expected to happen,
// and reading it as profit is what makes a losing run look fine.
function VerifiedTable({ data }: { data: any }) {
    const { t, format } = useI18n();
    const dec = (v: unknown, d: number) => format.decimal((v as number) || 0, d);
    const rows: any[] = (data && data.daily) || [];

    if (rows.length === 0) {
        return <div className="empty-state"><span className="big">⚖️</span>{t('profit.verified.empty')}</div>;
    }
    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>{t('common.date')}</th>
                        <th>{t('profit.stat.usdt')}</th>
                        <th>{t('profit.stat.irt')}</th>
                        <th>{t('profit.col.net')}</th>
                        <th>{t('profit.col.pricedAt')}</th>
                        <th>{t('profit.col.trades')}</th>
                        <th>{t('profit.col.excluded')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r.date ?? i}>
                            <td>{format.date(r.date)}</td>
                            <td className={diffClass(r.usdt)}>{dec(r.usdt, 4)}</td>
                            <td className={diffClass(r.irt)}>{fmtNum(Math.round(r.irt || 0))}</td>
                            {r.valued ? (
                                <>
                                    <td className={diffClass(r.net_irt)}>{fmtNum(Math.round(r.net_irt))}</td>
                                    <td className="fee-text">{fmtNum(Math.round(r.valuation_price))}</td>
                                </>
                            ) : (
                                <>
                                    <td className="fee-text">{t('profit.verified.notValued')}</td>
                                    <td className="fee-text">{t('profit.verified.noTradedPrice')}</td>
                                </>
                            )}
                            <td className="fee-text">{fmtNum(r.trades || 0)}</td>
                            <td className={r.excluded_trades ? 'profit-negative' : 'fee-text'}>{fmtNum(r.excluded_trades || 0)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TradesTable({ data }: { data: any }) {
    const { t, format } = useI18n();
    const dec = (v: unknown, d: number) => format.decimal((v as number) || 0, d);
    const trades: any[] = (data && data.trades) || [];

    if (trades.length === 0) {
        return <div className="empty-state"><span className="big">📋</span>{t('profit.trades.empty')}</div>;
    }
    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>{t('profit.trades.col.when')}</th>
                        <th>{t('common.route')}</th>
                        <th>{t('profit.stat.usdt')}</th>
                        <th>{t('profit.stat.irt')}</th>
                        <th>{t('profit.col.net')}</th>
                        <th>{t('profit.trades.col.shape')}</th>
                        <th>{t('profit.trades.col.recorded')}</th>
                    </tr>
                </thead>
                <tbody>
                    {trades.map((trade, i) => (
                        <tr key={i}>
                            <td>{format.dateTime(trade.at)}</td>
                            <td className="fee-text">{trade.buy_provider} → {trade.sell_provider}</td>
                            <td className={diffClass(trade.usdt)}>{dec(trade.usdt, 4)}</td>
                            <td className={diffClass(trade.irt)}>{fmtNum(Math.round(trade.irt || 0))}</td>
                            <td className={trade.unmatched ? 'fee-text' : diffClass(trade.net_irt)}>{fmtNum(Math.round(trade.net_irt || 0))}</td>
                            <td>
                                {!trade.reliable
                                    ? <span className="status-badge stale">{t('profit.trades.unreliable')}</span>
                                    : trade.unmatched
                                        ? <span className="status-badge failed">{t('profit.trades.unmatchedLeg')}</span>
                                        : <span className="status-badge completed">{t('profit.trades.roundTrip')}</span>}
                            </td>
                            <td className="fee-text">{trade.status || ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function PredictedTable({ data }: { data: any }) {
    const { t, format } = useI18n();
    const real: any[] = (data && data.real_daily) || [];
    const sim: any[] = (data && data.simulated_daily) || [];

    if (real.length === 0 && sim.length === 0) {
        return <div className="empty-state"><span className="big">📈</span>{t('profit.predicted.empty')}</div>;
    }

    const byDate: Record<string, { realProfit?: number; realTrades?: number; simProfit?: number; simTrades?: number }> = {};
    for (const r of real) {
        const d = (r.date || '').slice(0, 10);
        byDate[d] = byDate[d] || {};
        byDate[d].realProfit = r.profit_irt;
        byDate[d].realTrades = r.trades;
    }
    for (const s of sim) {
        const d = (s.date || '').slice(0, 10);
        byDate[d] = byDate[d] || {};
        byDate[d].simProfit = s.profit_irt;
        byDate[d].simTrades = s.trades;
    }
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>{t('common.date')}</th>
                        <th>{t('profit.predicted.col.realProfit')}</th>
                        <th>{t('profit.predicted.col.realTrades')}</th>
                        <th>{t('profit.predicted.col.simProfit')}</th>
                        <th>{t('profit.predicted.col.simTrades')}</th>
                    </tr>
                </thead>
                <tbody>
                    {dates.map(d => {
                        const v = byDate[d];
                        const realProfit = v.realProfit || 0;
                        return (
                            <tr key={d}>
                                <td>{format.date(d)}</td>
                                <td className={realProfit >= 0 ? 'profit-positive' : 'profit-negative'}>{fmtNum(Math.round(realProfit))}</td>
                                <td className="fee-text">{fmtNum(v.realTrades || 0)}</td>
                                <td className="fee-text">{fmtNum(Math.round(v.simProfit || 0))}</td>
                                <td className="fee-text">{fmtNum(v.simTrades || 0)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
