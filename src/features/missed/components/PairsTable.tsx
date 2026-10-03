import { useI18n } from '../../../i18n';
import { cx, fmtQty, fmtToman } from '../../../shared/lib';
import { DataTable, type Column } from '../../../shared/ui';
import type { PairSummary } from '../api';
import { count } from '../labels';

/** Per pair totals; clicking a pair filters the whole page to it. */
export function PairsTable({ pairs, selected, onPair }: { pairs: PairSummary[]; selected: string; onPair: (symbol: string) => void }) {
    const { t } = useI18n();
    const columns: Column<PairSummary>[] = [
        { key: 'pair', header: t('missed.pairs.col.pair'), cell: (p) => <strong>{p.symbol}</strong> },
        { key: 'missed', header: t('missed.pairs.col.missed'), cell: (p) => count(p.count) },
        { key: 'short', header: t('missed.pairs.col.balanceShort'), cell: (p) => count(p.balance_short) },
        { key: 'errors', header: t('missed.pairs.col.errors'), cell: (p) => count(p.errors) },
        { key: 'volume', header: t('missed.pairs.col.volume'), cell: (p) => <>{fmtQty(p.missed_qty, 4)} <span className="fee-text">{p.symbol.split('_')[0]}</span></> },
        { key: 'gross', header: t('missed.pairs.col.gross'), cell: (p) => fmtToman(p.missed_gross) },
        { key: 'net', header: t('missed.pairs.col.net'), className: 'profit-positive', cell: (p) => fmtToman(p.missed_net) },
    ];
    return (
        <DataTable columns={columns} rows={pairs} rowKey={(p) => p.symbol}
                   rowClassName={(p) => cx('pair-row', p.symbol === selected && 'active')} onRowClick={(p) => onPair(p.symbol)}
                   loading={t('missed.loading')} empty={{ text: t('missed.empty') }} />
    );
}
