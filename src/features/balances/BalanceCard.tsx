import { useI18n } from '../../i18n';
import { fmtNum } from '../../shared/lib';
import { ProviderName, StatusBadge } from '../../shared/ui';
import type { AssetBalance, ProviderBalances } from './api';

export function BalanceCard({ venue }: { venue: ProviderBalances }) {
    const { t } = useI18n();

    if (venue.error) {
        return (
            <div className="card">
                <div className="card-header">
                    <ProviderName code={venue.provider} />
                    <StatusBadge tone="offline">{t('balances.error')}</StatusBadge>
                </div>
                <div className="card-meta"><span className="chip error-text">{venue.error}</span></div>
            </div>
        );
    }

    const balances = venue.balances ?? [];
    return (
        <div className="card">
            <div className="card-header">
                <ProviderName code={venue.provider} />
                <StatusBadge tone="online">{fmtNum(Math.round(venue.total_irt || 0))} IRT</StatusBadge>
            </div>
            {balances.length === 0
                ? <div className="price-row"><span className="price-label">{t('balances.noNonZero')}</span></div>
                : balances.map((b) => <AssetRow key={b.asset} balance={b} />)}
        </div>
    );
}

function AssetRow({ balance: b }: { balance: AssetBalance }) {
    const { t } = useI18n();
    const locked = b.locked ? t('balances.locked', { locked: fmtNum(b.locked) }) : '';
    return (
        <div className="price-row">
            <span className="price-label">{b.asset} <span className="fee-text">{t('balances.free', { free: fmtNum(b.free), locked })}</span></span>
            <span className="price-value">{`${fmtNum(b.total)} ${b.asset}`}</span>
        </div>
    );
}
