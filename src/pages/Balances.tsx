import { useState } from 'react';

import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { API_BASE, fetchJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { fmtNum, providerColor } from '../lib/ui';

export default function Balances() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();
    const [data, setData] = useState<any>(null);

    async function fetchData() {
        try {
            const { ok, data } = await fetchJSON('/balances');
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            setData(data);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error fetching balances:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('error.unreachable', { base: API_BASE }));
        }
    }

    usePolling(fetchData, 15000, [locale]);

    const providers: any[] = (data && data.providers) || [];
    const totalBalance = data && typeof data.total_irt === 'number' ? data.total_irt as number : null;

    return (
        <>
            <div className="stats">
                <div className="stat">
                    <div className="stat-label">{t('balances.stat.total')}</div>
                    <div className="stat-value">{totalBalance !== null ? fmtNum(Math.round(totalBalance)) : '—'}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('balances.stat.reporting')}</div>
                    <div className="stat-value accent">{data ? format.number(providers.length) : '—'}</div>
                </div>
            </div>

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('balances.panel.title')}</span> <span className="count">{providers.length}</span></h2>
                    <span className="panel-hint">{t('balances.panel.hint')}</span>
                </div>
                <div className="grid">
                    {!data ? (
                        <div className="skeleton">{t('balances.loading')}</div>
                    ) : providers.length === 0 ? (
                        <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                            <span className="big">💰</span>{t('balances.empty')}
                        </div>
                    ) : providers.map((pb, i) => <BalanceCard key={pb.provider ?? i} pb={pb} />)}
                </div>
            </section>

            <footer className="page-footer">{t('balances.footer')}</footer>
        </>
    );
}

function BalanceCard({ pb }: { pb: any }) {
    const { t } = useI18n();
    const dotColor = providerColor(pb.provider);
    const name = (
        <span className="provider-name"><span className="provider-dot" style={{ background: dotColor }} />{pb.provider}</span>
    );

    if (pb.error) {
        return (
            <div className="card">
                <div className="card-header">
                    {name}
                    <span className="status-badge offline">{t('balances.error')}</span>
                </div>
                <div className="card-meta"><span className="chip error-text">{pb.error}</span></div>
            </div>
        );
    }

    const balances: any[] = pb.balances || [];
    return (
        <div className="card">
            <div className="card-header">
                {name}
                <span className="status-badge online">{fmtNum(Math.round(pb.total_irt || 0))} IRT</span>
            </div>
            {balances.length === 0 ? (
                <div className="price-row"><span className="price-label">{t('balances.noNonZero')}</span></div>
            ) : balances.map(b => {
                const locked = b.locked ? t('balances.locked', { locked: fmtNum(b.locked) }) : '';
                const breakdown = t('balances.free', { free: fmtNum(b.free), locked });
                return (
                    <div className="price-row" key={b.asset}>
                        <span className="price-label">{b.asset} <span className="fee-text">{breakdown}</span></span>
                        <span className="price-value">{`${fmtNum(b.total)} ${b.asset}`}</span>
                    </div>
                );
            })}
        </div>
    );
}
