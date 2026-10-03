import { useI18n } from '../../../i18n';
import { Stat, StatGrid } from '../../../shared/ui';
import type { AuditReport } from '../api';
import { fmtValText } from '../verdict';

export function AuditStats({ report }: { report: AuditReport | undefined }) {
    const { t, format } = useI18n();
    const count = (n: number | undefined) => (report ? format.number(n || 0) : '—');
    const measured = report?.trades_measured || 0;
    const tone = (n: number) => (n >= 0 ? 'green' : 'red');

    return (
        <StatGrid>
            <Stat label={t('audit.stat.trades')} value={count(report?.trades_audited)} />
            <Stat label={t('audit.stat.mismatchTrades')} value={count(report?.trades_with_mismatch)}
                  tone={report ? ((report.trades_with_mismatch || 0) > 0 ? 'red' : 'green') : ''} />
            <Stat label={t('audit.stat.mismatchFields')} value={count(report?.total_mismatches)} />
            <Stat label={t('audit.stat.unverified')} value={count(report?.legs_unverified)} />
            <Stat label={t('audit.stat.realized')}
                  tone={measured ? tone(report!.realized_net) : ''}
                  value={measured ? fmtValText(report!.realized_net, 'IRT') : '—'}
                  sub={report && (measured
                      ? t('audit.expectedSub', {
                          expected: fmtValText(report.expected_total, 'IRT'),
                          measured: format.number(measured),
                          audited: format.number(report.trades_audited || 0),
                      })
                      : t('audit.noneMeasurable'))} />
            {/* The drain signal: the model intends IRT to come out roughly flat. */}
            <Stat label={t('audit.stat.quoteFlow')}
                  tone={measured ? tone(report!.net_quote_flow) : ''}
                  value={measured ? fmtValText(report!.net_quote_flow, 'IRT') : '—'}
                  sub={measured ? t('audit.retainedSub', { retained: fmtValText(report!.retained_base, 'USDT') }) : ''} />
        </StatGrid>
    );
}
