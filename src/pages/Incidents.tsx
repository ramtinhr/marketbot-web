import { useState } from 'react';

import { usePageStatus } from '../components/Layout';
import { useI18n } from '../i18n';
import { API_BASE, fetchJSON } from '../lib/api';
import { usePolling } from '../lib/hooks';

export default function Incidents() {
    const { t, format, locale } = useI18n();
    const status = usePageStatus();
    const [data, setData] = useState<any>(null);

    async function fetchData() {
        try {
            const { ok, data } = await fetchJSON('/providers/health-events?limit=100');
            if (!ok) throw new Error((data && data.error) || t('error.requestFailed'));
            setData(data);
            status.setStatus(true, t('status.updated', { time: format.time(new Date()) }));
        } catch (error) {
            console.error('Error fetching incidents:', error);
            status.setStatus(false, t('status.connectionLost'));
            status.showError(t('error.unreachable', { base: API_BASE }));
        }
    }

    usePolling(fetchData, 5000, [locale]);

    const events: any[] = (data && data.events) || [];
    const count = data && typeof data.count === 'number' ? data.count : events.length;

    return (
        <>
            <section className="panel">
                <div className="panel-header">
                    <h2><span>{t('incidents.panel.title')}</span> <span className="count">{count}</span></h2>
                    <span className="panel-hint">{t('incidents.panel.hint')}</span>
                </div>
                <div>
                    {!data ? (
                        <div className="skeleton">{t('incidents.loading')}</div>
                    ) : events.length === 0 ? (
                        <div className="empty-state"><span className="big">✅</span>{t('incidents.empty')}</div>
                    ) : (
                        <div className="table-scroll">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{t('common.time')}</th>
                                        <th>{t('common.provider')}</th>
                                        <th>{t('incidents.col.transition')}</th>
                                        <th>{t('incidents.col.reason')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map((e, i) => {
                                        // Circuit states are the bot's own vocabulary and appear in its
                                        // logs, so they stay in their recorded form rather than becoming
                                        // words that cannot be searched for.
                                        const toClass = (e.to_state || '').toLowerCase();
                                        return (
                                            <tr key={e.id ?? i}>
                                                <td>{format.dateTime(e.created_at)}</td>
                                                <td className="provider-tag">{e.provider_code}</td>
                                                <td className="route-cell">{e.from_state}<span className="arrow">→</span><span className={`status-badge ${toClass}`}>{e.to_state}</span></td>
                                                <td>{e.reason || ''}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>

            <footer className="page-footer">{t('incidents.footer')}</footer>
        </>
    );
}
