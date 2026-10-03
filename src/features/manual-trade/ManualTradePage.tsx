import { useEffect } from 'react';

import { useI18n } from '../../i18n';
import { usePageStatus } from '../../shared/stores/pageStatus';
import { useTheme } from '../../shared/stores/theme';
import { cx } from '../../shared/lib';
import { useDeskConfig } from './api';
import { OrderForm } from './components/OrderForm';
import { OrdersPanel } from './components/OrdersPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { useDeskMode } from './useDeskMode';
import { useOrderTicket } from './useOrderTicket';

export default function ManualTradePage() {
    const { t } = useI18n();
    // Venue colours follow the theme.
    useTheme();
    const { showError } = usePageStatus();

    const desk = useDeskConfig();
    // A failed refresh means the desk is unreachable now, whatever it said before.
    const config = desk.isError ? undefined : desk.data;
    const configTried = desk.isFetched || desk.isError;
    useEffect(() => {
        if (desk.error) showError(desk.error.message);
    }, [desk.error, desk.errorUpdatedAt, showError]);

    const { notice } = useDeskMode(config, configTried);
    const ticket = useOrderTicket(config);

    return (
        <>
            <div className={cx('mt-notice', notice?.tone)} hidden={!notice}>{notice ? t(notice.key) : ''}</div>

            <div className="mt-layout">
                <OrderForm ticket={ticket} config={config} configTried={configTried} />
                <PreviewPanel ticket={ticket} />
            </div>

            <OrdersPanel />

            <footer className="page-footer">{t('manual.footer')}</footer>
        </>
    );
}
