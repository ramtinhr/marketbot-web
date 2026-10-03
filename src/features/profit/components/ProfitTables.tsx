import { useI18n } from '../../../i18n';
import { fmtNum, fmtRounded, signClass } from '../../../shared/lib';
import { DataTable, Html, StatusBadge, type Column } from '../../../shared/ui';
import type { PredictedProfit, VerifiedDay, VerifiedTrade } from '../api';

// The measured half of the page. Deliberately rendered before the
// prediction below it: the prediction is what the bot expected to happen,
// and reading it as profit is what makes a losing run look fine.
export function VerifiedTable({ days }: { days: VerifiedDay[] | undefined }) {
    const { t, format } = useI18n();
    const columns: Column<VerifiedDay>[] = [
        { key: 'date', header: t('common.date'), cell: (r) => format.date(r.date) },
        { key: 'usdt', header: t('profit.stat.usdt'), className: (r) => signClass(r.usdt), cell: (r) => format.decimal(r.usdt || 0, 4) },
        { key: 'irt', header: t('profit.stat.irt'), className: (r) => signClass(r.irt), cell: (r) => fmtRounded(r.irt) },
        {
            key: 'net', header: t('profit.col.net'),
            className: (r) => (r.valued ? signClass(r.net_irt) : 'fee-text'),
            cell: (r) => (r.valued ? fmtRounded(r.net_irt) : t('profit.verified.notValued')),
        },
        {
            key: 'price', header: t('profit.col.pricedAt'), className: 'fee-text',
            cell: (r) => (r.valued ? fmtRounded(r.valuation_price) : t('profit.verified.noTradedPrice')),
        },
        { key: 'trades', header: t('profit.col.trades'), className: 'fee-text', cell: (r) => fmtNum(r.trades || 0) },
        {
            key: 'excluded', header: t('profit.col.excluded'),
            className: (r) => (r.excluded_trades ? 'profit-negative' : 'fee-text'),
            cell: (r) => fmtNum(r.excluded_trades || 0),
        },
    ];
    return (
        <DataTable columns={columns} rows={days} rowKey={(r, i) => r.date ?? i}
                   loading={t('profit.verified.loading')} empty={{ icon: '⚖️', text: t('profit.verified.empty') }} />
    );
}

function TradeShape({ trade }: { trade: VerifiedTrade }) {
    const { t } = useI18n();
    if (!trade.reliable) return <StatusBadge tone="stale">{t('profit.trades.unreliable')}</StatusBadge>;
    if (trade.unmatched) return <StatusBadge tone="failed">{t('profit.trades.unmatchedLeg')}</StatusBadge>;
    return <StatusBadge tone="completed">{t('profit.trades.roundTrip')}</StatusBadge>;
}

export function TradesTable({ trades }: { trades: VerifiedTrade[] | undefined }) {
    const { t, format } = useI18n();
    const columns: Column<VerifiedTrade>[] = [
        { key: 'when', header: t('profit.trades.col.when'), cell: (r) => format.dateTime(r.at) },
        { key: 'route', header: t('common.route'), className: 'fee-text', cell: (r) => `${r.buy_provider} → ${r.sell_provider}` },
        { key: 'usdt', header: t('profit.stat.usdt'), className: (r) => signClass(r.usdt), cell: (r) => format.decimal(r.usdt || 0, 4) },
        { key: 'irt', header: t('profit.stat.irt'), className: (r) => signClass(r.irt), cell: (r) => fmtRounded(r.irt) },
        { key: 'net', header: t('profit.col.net'), className: (r) => (r.unmatched ? 'fee-text' : signClass(r.net_irt)), cell: (r) => fmtRounded(r.net_irt) },
        { key: 'shape', header: t('profit.trades.col.shape'), cell: (r) => <TradeShape trade={r} /> },
        { key: 'recorded', header: t('profit.trades.col.recorded'), className: 'fee-text', cell: (r) => r.status || '' },
    ];
    return (
        <DataTable columns={columns} rows={trades} rowKey={(_, i) => i}
                   loading={t('profit.trades.loading')} empty={{ icon: '📋', text: t('profit.trades.empty') }} />
    );
}

interface PredictedRow {
    date: string;
    realProfit: number;
    realTrades: number;
    simProfit: number;
    simTrades: number;
}

/** Real and simulated days merged into one row per date, newest first. */
function mergeByDate(data: PredictedProfit): PredictedRow[] {
    const byDate = new Map<string, PredictedRow>();
    const row = (date: string) => {
        const d = (date || '').slice(0, 10);
        if (!byDate.has(d)) byDate.set(d, { date: d, realProfit: 0, realTrades: 0, simProfit: 0, simTrades: 0 });
        return byDate.get(d)!;
    };
    for (const r of data.real_daily || []) Object.assign(row(r.date), { realProfit: r.profit_irt || 0, realTrades: r.trades || 0 });
    for (const s of data.simulated_daily || []) Object.assign(row(s.date), { simProfit: s.profit_irt || 0, simTrades: s.trades || 0 });
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function PredictedTable({ data }: { data: PredictedProfit | undefined }) {
    const { t, format } = useI18n();
    const columns: Column<PredictedRow>[] = [
        { key: 'date', header: t('common.date'), cell: (r) => format.date(r.date) },
        { key: 'realProfit', header: t('profit.predicted.col.realProfit'), className: (r) => signClass(r.realProfit), cell: (r) => fmtRounded(r.realProfit) },
        { key: 'realTrades', header: t('profit.predicted.col.realTrades'), className: 'fee-text', cell: (r) => fmtNum(r.realTrades) },
        { key: 'simProfit', header: t('profit.predicted.col.simProfit'), className: 'fee-text', cell: (r) => fmtRounded(r.simProfit) },
        { key: 'simTrades', header: t('profit.predicted.col.simTrades'), className: 'fee-text', cell: (r) => fmtNum(r.simTrades) },
    ];
    return (
        <DataTable columns={columns} rows={data && mergeByDate(data)} rowKey={(r) => r.date}
                   loading={t('profit.predicted.loading')} empty={{ icon: '📈', text: t('profit.predicted.empty') }} />
    );
}

const METHOD_ROWS: Array<{ key: string; trustClass?: string }> = [
    { key: 'roundTrip', trustClass: 'profit-positive' },
    { key: 'unmatched' },
    { key: 'net', trustClass: 'profit-positive' },
    { key: 'axes' },
    { key: 'predicted' },
    { key: 'excluded' },
];

/** How each figure is computed. The source and trust cells carry <em>/<code>
 *  emphasis that is part of the sentence, so they are translated as markup. */
export function MethodTable() {
    const { t } = useI18n();
    return (
        <div className="table-scroll">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>{t('profit.method.col.figure')}</th>
                        <th>{t('profit.method.col.source')}</th>
                        <th>{t('profit.method.col.trust')}</th>
                    </tr>
                </thead>
                <tbody>
                    {METHOD_ROWS.map((row) => (
                        <tr key={row.key}>
                            <td><strong>{t(`profit.method.${row.key}.name`)}</strong></td>
                            <Html as="td" k={`profit.method.${row.key}.source`} />
                            <Html as="td" k={`profit.method.${row.key}.trust`} className={row.trustClass} />
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
