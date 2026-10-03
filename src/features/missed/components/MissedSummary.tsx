import type { ReactNode } from 'react';

import { useI18n } from '../../../i18n';
import { cx, fmtQty, fmtToman, isMissing } from '../../../shared/lib';
import { Stat, StatGrid, StatusBadge } from '../../../shared/ui';
import type { MissedReport, WalletNeeds } from '../api';
import { count, errorLabel } from '../labels';

function WalletRow({ label, children }: { label: ReactNode; children: ReactNode }) {
    return <div className="wallet-row"><span>{label}</span><span className="wallet-row-value">{children}</span></div>;
}

// One side's wallets: how many opportunities they were short on, and what to
// add - from the top-up plan, so each wallet is counted once rather than once
// per opportunity.
function WalletCard({ side, shortCount, n = {} }: { side: 'buy' | 'sell'; shortCount: number | undefined; n?: WalletNeeds }) {
    const { t } = useI18n();
    const usdt = (v: number | undefined) => (isMissing(v) ? '' : `≈ ${fmtQty(v, 2)} USDT`);
    const needed = (n.topup_all_toman || 0) > 0;
    // A sell wallet holds the pair's coin, so the Toman total hides which coins.
    const coins = side === 'sell' ? (n.assets || []).filter((a) => a.topup > 0) : [];
    const unpriced = n.unpriced || [];
    return (
        <div className="wallet-card">
            <div className="wallet-head">
                <div>
                    <div className="wallet-title">{t(`missed.wallet.${side}.title`)}</div>
                    <div className="wallet-hint">{t(`missed.wallet.${side}.hint`)}</div>
                </div>
                <StatusBadge tone={(shortCount || 0) > 0 ? 'failed' : 'completed'}>{t('missed.wallet.shortCount', { count: count(shortCount) })}</StatusBadge>
            </div>
            <div className="wallet-label">{t('missed.wallet.topup')}</div>
            <div className={cx('wallet-amount', (n.topup_toman || 0) > 0 && 'red')}>{fmtToman(n.topup_toman)}<span className="stat-unit">IRT</span></div>
            <div className={cx('wallet-usdt', !needed && 'none')}>{needed ? usdt(n.topup_usdt) : t('missed.wallet.none')}</div>
            <div className="wallet-rows">
                <WalletRow label={t('missed.wallet.wallets')}>{count(n.short_wallets)}</WalletRow>
                <WalletRow label={t('missed.wallet.all')}>
                    {fmtToman(n.topup_all_toman)} IRT{n.topup_all_usdt ? <> <span className="fee-text">· {usdt(n.topup_all_usdt)}</span></> : null}
                </WalletRow>
                {coins.length > 0 && (
                    <WalletRow label={t('missed.wallet.coins')}>
                        <span className="wallet-coins">
                            {coins.map((a) => <span key={a.asset} className="chip">{a.asset} +{fmtQty(a.topup, 6)}</span>)}
                        </span>
                    </WalletRow>
                )}
            </div>
            {unpriced.length > 0 && <div className="wallet-note">{t('missed.wallet.unpriced', { assets: unpriced.join(', ') })}</div>}
        </div>
    );
}

export function MissedSummary({ data }: { data: MissedReport }) {
    const { t, format } = useI18n();
    const s = data.summary || {};
    const needs = data.wallet_needs || {};
    const span = s.first_detected_at && s.last_detected_at
        ? `${format.date(s.first_detected_at)} → ${format.date(s.last_detected_at)}`
        : t('missed.summary.none');
    const kinds = (data.errors_by_kind || []).slice(0, 2).map((k) => `${errorLabel(k.kind)} ${count(k.count)}`).join(' · ');

    return (
        <>
            {data.truncated && <div className="note-line">⚠️ {t('missed.summary.truncated')}</div>}
            <div className="stat-group-label">{t('missed.summary.groupOpps', { fraction: format.number(data.fraction || 70) })}</div>
            <StatGrid className="kpis">
                <Stat label={t('missed.summary.count')} value={count(s.count)} sub={span} />
                <Stat label={t('missed.summary.gross')} value={fmtToman(s.missed_gross)} unit="IRT"
                      sub={t('missed.summary.grossSub', { capital: fmtToman(s.missed_deployed) })} />
                <Stat label={t('missed.summary.net')} value={fmtToman(s.missed_net)} unit="IRT" tone="green"
                      sub={t('missed.summary.netSub', { fees: fmtToman(s.missed_fees) })} />
                <Stat label={t('missed.summary.errors')} value={count(s.errors)} tone="amber" sub={kinds || t('missed.summary.errorsSub')} />
            </StatGrid>
            <div className="stat-group-label">{t('missed.summary.groupWallets', { coverage: format.number(data.coverage || 90) })}</div>
            <div className="wallet-grid">
                <WalletCard side="buy" shortCount={s.buy_short} n={needs.buy} />
                <WalletCard side="sell" shortCount={s.sell_short} n={needs.sell} />
            </div>
        </>
    );
}
