import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';

import { useI18n } from '../../i18n';
import { cx } from '../lib/cx';
import { QuestionIcon, WarningIcon } from './icons';

/** `danger` for what cannot be undone, `warning` for real money, `default` for the rest. */
export type ConfirmTone = 'danger' | 'warning' | 'default';

export interface ConfirmOptions {
    title: ReactNode;
    message?: ReactNode;
    confirmLabel?: ReactNode;
    cancelLabel?: ReactNode;
    tone?: ConfirmTone;
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean) => void }

const useConfirmStore = create<{ pending: Pending | null }>(() => ({ pending: null }));

/**
 * Asks before doing something, and resolves true only on an explicit yes.
 * A plain function rather than a hook so non-React code (the market session)
 * can await it too; `ConfirmHost` must be mounted once for it to show.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
        useConfirmStore.getState().pending?.resolve(false);
        useConfirmStore.setState({ pending: { ...options, resolve } });
    });
}

function settle(ok: boolean) {
    const pending = useConfirmStore.getState().pending;
    if (!pending) return;
    useConfirmStore.setState({ pending: null });
    pending.resolve(ok);
}

/** The one dialog every `confirmDialog` call renders into. */
export function ConfirmHost() {
    const { t } = useI18n();
    const pending = useConfirmStore((s) => s.pending);
    const dialog = useRef<HTMLDialogElement>(null);
    const cancel = useRef<HTMLButtonElement>(null);
    const confirm = useRef<HTMLButtonElement>(null);
    const tone = pending?.tone ?? 'default';

    useEffect(() => {
        const d = dialog.current;
        if (!d) return;
        if (pending && !d.open) {
            d.showModal();
            // Enter on a risky dialog should be the safe answer.
            (tone === 'default' ? confirm : cancel).current?.focus();
        } else if (!pending && d.open) {
            d.close();
        }
    }, [pending, tone]);

    return (
        <dialog
            ref={dialog}
            className={cx('confirm', tone)}
            aria-labelledby="confirm-title"
            aria-describedby={pending?.message ? 'confirm-message' : undefined}
            onCancel={(e) => { e.preventDefault(); settle(false); }}
            onClick={(e) => { if (e.target === e.currentTarget) settle(false); }}
        >
            {pending && (
                <div className="confirm-panel">
                    <div className="confirm-icon">{tone === 'default' ? <QuestionIcon /> : <WarningIcon />}</div>
                    <div className="confirm-text">
                        <h2 id="confirm-title">{pending.title}</h2>
                        {pending.message && <div id="confirm-message" className="confirm-message">{pending.message}</div>}
                    </div>
                    <div className="confirm-actions">
                        <button ref={cancel} type="button" className="btn" onClick={() => settle(false)}>
                            {pending.cancelLabel ?? t('common.cancel')}
                        </button>
                        <button ref={confirm} type="button" className={cx('btn', 'confirm-ok', tone)} onClick={() => settle(true)}>
                            {pending.confirmLabel ?? t('common.confirm')}
                        </button>
                    </div>
                </div>
            )}
        </dialog>
    );
}
