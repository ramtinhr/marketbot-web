import { useI18n } from '../../../i18n';
import { fmtToman } from '../../../shared/lib';
import { DataTable, Template, type Column } from '../../../shared/ui';
import type { Topup } from '../api';
import { Amount, count } from '../labels';

function CreditNote({ g }: { g: Topup }) {
    const { t } = useI18n();
    if (g.live_credit === 'unlimited') return <div className="fee-text">{t('missed.topup.creditUnlimited')}</div>;
    if (!g.live_credit || g.live_credit <= 0) return null;
    return <div className="fee-text"><Template template={t('missed.topup.credit')} nodes={{ amount: <Amount n={g.live_credit} asset={g.asset} /> }} /></div>;
}

/** A top-up figure: red with a plus when money is needed; starred when judged from a stale balance. */
function TopupAmount({ n, g }: { n: number; g: Topup }) {
    const { t } = useI18n();
    return (
        <>
            {n > 0 ? '+' : ''}<Amount n={n} asset={g.asset} />
            {g.topup_basis !== 'live' && <> <span className="fee-text" title={t('missed.topup.basisLastSeen')}>*</span></>}
        </>
    );
}

// The answer to "how much should each wallet hold": per venue and asset, the
// balance that would have funded `coverage`% of the opportunities it was
// short on, and all of them, against what it holds now.
export function TopupTable({ groups, coverage }: { groups: Topup[]; coverage: number }) {
    const { t, format } = useI18n();
    const cov = format.number(coverage);
    const columns: Column<Topup>[] = [
        { key: 'venue', header: t('missed.topup.col.venue'), cell: (g) => <span className="provider-tag">{g.venue}</span> },
        {
            key: 'asset', header: t('missed.topup.col.asset'),
            cell: (g) => <>{g.asset} <span className="fee-text">{t(g.side === 'buy' ? 'missed.topup.buyLeg' : 'missed.topup.sellLeg')}</span></>,
        },
        { key: 'missed', header: t('missed.topup.col.missed'), headerTitle: t('missed.topup.col.missedHint'), cell: (g) => count(g.count) },
        { key: 'missedNet', header: t('missed.topup.col.missedNet'), className: 'profit-positive', cell: (g) => fmtToman(g.missed_net) },
        {
            key: 'required', header: t('missed.topup.col.required', { coverage: cov }), headerTitle: t('missed.topup.col.requiredHint', { coverage: cov }),
            cell: (g) => (
                <>
                    <Amount n={g.required} asset={g.asset} />
                    <div className="fee-text">{t('missed.topup.covers', { covered: count(g.covered_count), count: count(g.count), net: fmtToman(g.covered_net) })}</div>
                </>
            ),
        },
        { key: 'requiredAll', header: t('missed.topup.col.requiredAll'), cell: (g) => <Amount n={g.required_all} asset={g.asset} /> },
        {
            key: 'lastSeen', header: t('missed.topup.col.lastSeen'), headerTitle: t('missed.topup.col.lastSeenHint'),
            cell: (g) => <span title={g.last_seen_at ? format.dateTime(g.last_seen_at) : ''}><Amount n={g.last_seen_have} asset={g.asset} /></span>,
        },
        {
            key: 'live', header: t('missed.topup.col.live'), headerTitle: t('missed.topup.col.liveHint'),
            cell: (g) => (
                <>
                    {g.live_free === null || g.live_free === undefined
                        ? <span className="fee-text">{t('common.unknown')}</span>
                        : <Amount n={g.live_free} asset={g.asset} />}
                    <CreditNote g={g} />
                </>
            ),
        },
        {
            key: 'topup', header: t('missed.topup.col.topup', { coverage: cov }),
            className: (g) => `topup-cell ${g.topup > 0 ? 'profit-negative' : 'profit-positive'}`,
            cell: (g) => <TopupAmount n={g.topup} g={g} />,
        },
        {
            key: 'topupAll', header: t('missed.topup.col.topupAll'),
            className: (g) => (g.topup_all > 0 ? 'profit-negative' : 'profit-positive'),
            cell: (g) => <TopupAmount n={g.topup_all} g={g} />,
        },
    ];
    return (
        <DataTable columns={columns} rows={groups} rowKey={(g) => `${g.venue}:${g.asset}:${g.side}`}
                   loading={t('missed.loading')} empty={{ icon: '✅', text: t('missed.topup.empty') }} />
    );
}
