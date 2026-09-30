import { useState } from 'react';

import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { API_BASE, fetchJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';
import { fmtNum, providerColor } from '../lib/ui';

export default function Reconciliation() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();
    const [data, setData] = useState<any>(null);

    async function fetchData() {
        try {
            const { ok, data } = await fetchJSON('/reconciliation');
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            setData(data);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error fetching reconciliation:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('error.unreachable', { base: API_BASE }));
        }
    }

    usePolling(fetchData, 15000, [locale]);

    const accounts: any[] = (data && data.accounts) || [];
    const count = (n: number) => (data ? format.number(n) : '—');

    return (
        <>
            <div className="stats">
                <div className="stat">
                    <div className="stat-label">{t('recon.stat.accounts')}</div>
                    <div className="stat-value">{count(accounts.length)}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('recon.stat.mismatches')}</div>
                    <div className="stat-value accent">{count(accounts.filter(a => a.status === 'mismatch').length)}</div>
                </div>
                <div className="stat">
                    <div className="stat-label">{t('recon.stat.noData')}</div>
                    <div className="stat-value">{count(accounts.filter(a => a.status === 'no_live_data').length)}</div>
                </div>
            </div>

            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('recon.panel.title')}</span> <span className="count">{accounts.length}</span></h2>
                    <span className="panel-hint">{t('recon.panel.hint')}</span>
                </div>
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('common.provider')}</th>
                                <th>{t('recon.col.asset')}</th>
                                <th>{t('recon.col.internal')}</th>
                                <th>{t('recon.col.live')}</th>
                                <th>{t('recon.col.diff')}</th>
                                <th>{t('common.status')}</th>
                                <th>{t('recon.col.liveUpdated')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!data ? (
                                <tr><td colSpan={7} className="skeleton">{t('recon.loading')}</td></tr>
                            ) : accounts.length === 0 ? (
                                <tr><td colSpan={7} className="empty-state"><span className="big">⚖️</span>{t('recon.empty')}</td></tr>
                            ) : accounts.map((a, i) => {
                                const live = a.live_balance !== null && a.live_balance !== undefined ? fmtNum(a.live_balance) : '—';
                                const diff = a.diff !== null && a.diff !== undefined ? fmtNum(a.diff) : '—';
                                const updated = a.live_updated_at ? format.time(a.live_updated_at) : '—';
                                return (
                                    <tr key={`${a.provider}:${a.asset}:${i}`}>
                                        <td><span className="provider-name"><span className="provider-dot" style={{ background: providerColor(a.provider) }} />{a.provider}</span></td>
                                        <td>{a.asset}</td>
                                        <td>{fmtNum(a.internal_balance)}</td>
                                        <td>{live}</td>
                                        <td>{diff}</td>
                                        <td><StatusBadge status={a.status} /></td>
                                        <td>{updated}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <footer className="page-footer">{t('recon.footer')}</footer>
        </>
    );
}

function StatusBadge({ status }: { status: string }) {
    const { t } = useI18n();
    if (status === 'mismatch') return <span className="status-badge offline">{t('recon.status.mismatch')}</span>;
    if (status === 'no_live_data') return <span className="status-badge">{t('recon.status.noLiveData')}</span>;
    if (status === 'stale_live') {
        return <span className="status-badge stale" title={t('recon.status.awaitingRefreshHint')}>{t('recon.status.awaitingRefresh')}</span>;
    }
    return <span className="status-badge online">{t('recon.status.ok')}</span>;
}
