import { useState, type ReactNode } from 'react';

import { useI18n } from '../../i18n';
import { EmptyState, PageFooter, Panel, Segmented, Skeleton } from '../../shared/ui';
import { useOrderAudit, type AuditTrade as Trade } from './api';
import { AuditScopeForm } from './components/AuditScopeForm';
import { AuditStats } from './components/AuditStats';
import { AuditTrade } from './components/AuditTrade';
import { MARK_BAD, MARK_NEAR, MARK_OK, needsAttention } from './verdict';

type Filter = 'all' | 'attention' | 'clean';
const FILTERS: Filter[] = ['all', 'attention', 'clean'];

const tradeKey = (trade: Trade, i: number) => String(trade.execution_id ?? i);

export default function OrderAuditPage() {
    const { t, format } = useI18n();
    const audit = useOrderAudit();
    const report = audit.data;
    const [filter, setFilter] = useState<Filter>('all');
    // Per-trade open state; unset means the default, where clean trades start
    // folded to their summary line so what needs reading is what is left open.
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

    const run = (scope: Parameters<typeof audit.mutate>[0]) => audit.mutate(scope, { onSuccess: () => setOpenMap({}) });

    const trades = report?.trades ?? [];
    const attention = trades.filter(needsAttention).length;
    const counts: Record<Filter, number> = { all: trades.length, attention, clean: trades.length - attention };
    const shown = filter === 'attention' ? trades.filter(needsAttention)
        : filter === 'clean' ? trades.filter((tr) => !needsAttention(tr))
            : trades;
    const isOpen = (trade: Trade, i: number) => openMap[tradeKey(trade, i)] ?? needsAttention(trade);

    const selectFilter = (f: Filter) => {
        if (f === filter) return;
        setFilter(f);
        setOpenMap({});
    };
    const setAllOpen = (open: boolean) => setOpenMap(Object.fromEntries(trades.map((trade, i) => [tradeKey(trade, i), open])));

    let content: ReactNode;
    if (audit.isPending) content = <Skeleton>{t('audit.fetching')}</Skeleton>;
    else if (audit.isError) content = <EmptyState icon="⚠️" text={audit.error.message || t('audit.failedStatus')} />;
    else if (!report) content = <EmptyState icon="🔍" text={<span>{t('audit.prompt')}</span>} />;
    else if (trades.length === 0) content = <EmptyState icon="🧾" text={t('audit.empty')} />;
    else if (shown.length === 0) content = <EmptyState icon="✓" text={t('audit.filterEmpty')} />;
    else {
        content = shown.map((trade) => {
            const i = trades.indexOf(trade);
            const key = tradeKey(trade, i);
            return <AuditTrade key={key} trade={trade} open={isOpen(trade, i)}
                               onToggle={(open) => setOpenMap((m) => ({ ...m, [key]: open }))} />;
        });
    }

    return (
        <>
            <AuditScopeForm running={audit.isPending} onRun={run} />
            <AuditStats report={report} />

            <Panel title={t('audit.trades.title')} count={trades.length} hint={report ? t('audit.generatedAt', {
                time: format.dateTime(report.generated_at),
                price: format.number(report.price_tolerance_pct),
                qty: format.number(report.qty_tolerance_pct),
            }) : ''}>
                <div className="audit-toolbar" hidden={trades.length === 0}>
                    <Segmented role="tablist" value={filter} onPick={selectFilter}
                               options={FILTERS.map((f) => ({ value: f, label: `${t(`audit.filter.${f}`)} · ${format.number(counts[f])}` }))} />
                    <div className="audit-legend">
                        <span>{MARK_OK} <span>{t('audit.legend.ok')}</span></span>
                        <span>{MARK_NEAR} <span>{t('audit.legend.near')}</span></span>
                        <span>{MARK_BAD} <span>{t('audit.legend.bad')}</span></span>
                    </div>
                    <span className="spacer" />
                    <button type="button" className="btn" onClick={() => setAllOpen(true)}>{t('audit.expandAll')}</button>
                    <button type="button" className="btn" onClick={() => setAllOpen(false)}>{t('audit.collapseAll')}</button>
                </div>
                <div>{content}</div>
            </Panel>

            <PageFooter>{t('audit.footer')}</PageFooter>
        </>
    );
}
