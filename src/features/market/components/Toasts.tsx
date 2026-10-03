import { useI18n } from '../../../i18n';
import { cx } from '../../../shared/lib';
import type { MarketSession } from '../session';

export function Toasts({ market }: { market: MarketSession }) {
    const { t } = useI18n();
    return (
        <div className="mk-toasts" aria-live="polite">
            {market.s.toasts.map((toast) => (
                <div key={toast.id} className={cx('mk-toast', toast.kind, toast.leaving && 'leaving')}>
                    <div className="mk-toast-body">
                        <strong>{toast.title}</strong>
                        {toast.body ? <span>{toast.body}</span> : null}
                    </div>
                    <button type="button" className="mk-toast-close" aria-label={t('market.toast.close')}
                            onClick={() => market.dismissToast(toast.id)}>&times;</button>
                </div>
            ))}
        </div>
    );
}
