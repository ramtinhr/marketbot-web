import { useI18n } from '../../../i18n';
import { fmtNum, fmtRounded, signClass } from '../../../shared/lib';
import { Stat, StatGrid } from '../../../shared/ui';
import type { VerifiedProfit } from '../api';

const IRT = ' IRT';

/** The measured headline figures; dashes until the first load lands. */
export function VerifiedStats({ data }: { data: VerifiedProfit | undefined }) {
    const { t, format } = useI18n();
    const dec = (v: number | undefined, d: number) => format.decimal(v || 0, d);

    // Not loaded yet, or loaded with nothing to measure.
    if (!data || data.daily.length === 0) {
        return (
            <StatGrid>
                <Stat label={t('profit.stat.roundTrip')} value="—" sub="" />
                <Stat label={t('profit.stat.unmatched')} value="—" sub="" />
                <Stat label={t('profit.stat.net')} value="—" sub={data ? t('profit.verified.noPairs') : ''} />
                <Stat label={t('profit.stat.usdt')} value="—" sub={t('profit.stat.usdtSub')} />
                <Stat label={t('profit.stat.irt')} value="—" sub={t('profit.stat.irtSub')} />
                <Stat label={t('profit.stat.trades')} value={data ? format.number(0) : '—'} sub="" />
            </StatGrid>
        );
    }

    const totals = data.totals;
    const unmatched = totals.unmatched_trades || 0;

    let netSub = t('profit.verified.netSub', { usdt: dec(totals.net_usdt, 4) });
    if (totals.days_unvalued) netSub += ' · ' + t('profit.verified.unvalued', { count: fmtNum(totals.days_unvalued) });

    // Coverage before profit: a net computed over half the trades is not an
    // answer, so say plainly how much of the trading it covers.
    const placed = fmtNum(totals.placed_trades || 0);
    const gaps: string[] = [];
    if (totals.excluded_trades) gaps.push(t('profit.verified.excluded', { count: fmtNum(totals.excluded_trades) }));
    if (totals.unmeasured_trades) gaps.push(t('profit.verified.unmeasured', { count: fmtNum(totals.unmeasured_trades) }));
    const coverage = gaps.length
        ? t('profit.verified.gaps', { placed, gaps: gaps.join(' · ') })
        : t('profit.verified.allMeasured', { placed });

    // Profit first and on its own. The combined net is kept, demoted, and
    // labelled - it is the honest total of everything that moved, but it
    // answers "how did the balance change", not "did we earn".
    return (
        <StatGrid>
            <Stat label={t('profit.stat.roundTrip')} value={fmtRounded(totals.round_trip_net_irt) + IRT}
                  tone={signClass(totals.round_trip_net_irt)}
                  sub={t('profit.verified.roundTripSub', { count: fmtNum(totals.round_trip_trades || 0) })} />
            <Stat label={t('profit.stat.unmatched')}
                  value={unmatched ? fmtRounded(totals.unmatched_net_irt) + IRT : t('common.none')}
                  tone={unmatched ? signClass(totals.unmatched_net_irt) : ''}
                  sub={unmatched ? t('profit.verified.unmatchedSub', { count: fmtNum(unmatched) }) : t('profit.verified.allRoundTripped')} />
            <Stat label={t('profit.stat.net')} value={fmtRounded(totals.net_irt) + IRT} tone={signClass(totals.net_irt)} sub={netSub} />
            <Stat label={t('profit.stat.usdt')} value={dec(totals.usdt, 4)} tone={signClass(totals.usdt)} sub={t('profit.stat.usdtSub')} />
            <Stat label={t('profit.stat.irt')} value={fmtRounded(totals.irt)} tone={signClass(totals.irt)} sub={t('profit.stat.irtSub')} />
            <Stat label={t('profit.stat.trades')} value={fmtNum(totals.trades || 0)} sub={coverage} />
        </StatGrid>
    );
}
