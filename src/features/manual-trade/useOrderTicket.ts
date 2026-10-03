import { useEffect, useRef, useState } from 'react';

import { msg } from '../../i18n';
import { ApiError } from '../../shared/api';
import { useNow } from '../../shared/hooks';
import { usePageStatus } from '../../shared/stores/pageStatus';
import { usePlaceOrder, usePreviewOrder, type DeskConfig, type OrderRequest, type Plan, type Side } from './api';

// A preview is consent to a price the books showed at that moment. Past this
// age the page asks for a fresh one rather than confirming a stale route.
const PREVIEW_MAX_AGE_MS = 30_000;
const CONFIRM_WINDOW_MS = 10_000;

export type Mode = 'price_and_volume' | 'volume_only' | 'price_only';

export interface TicketForm {
    side: Side;
    symbol: string;
    /** Empty means every venue. */
    venues: ReadonlySet<string>;
    price: string;
    qty: string;
    rest: boolean;
    cancelAfter: string;
    slippage: string;
}

const INITIAL_FORM: TicketForm = {
    side: 'buy', symbol: '', venues: new Set(), price: '', qty: '', rest: false, cancelAfter: '60', slippage: '0.5',
};

export interface Preview {
    plan: Plan;
    request: OrderRequest;
    at: number;
    /** Sent with the order so a retried click cannot place it twice. */
    requestId: string;
}

/** What the preview panel shows when there is no live plan in it. */
export type PreviewNote =
    | { kind: 'prompt' }
    | { kind: 'error'; message: string }
    | { kind: 'placed'; id: string; status: string; legs: number };

export function modeOf(req: Pick<OrderRequest, 'price' | 'quantity'>): Mode | null {
    if (req.price > 0 && req.quantity > 0) return 'price_and_volume';
    if (req.quantity > 0) return 'volume_only';
    if (req.price > 0) return 'price_only';
    return null;
}

const num = (raw: string) => (raw.trim() === '' ? 0 : Number(raw.trim()));

function toRequest(form: TicketForm): OrderRequest {
    const price = num(form.price);
    const quantity = num(form.qty);
    return {
        symbol: form.symbol,
        side: form.side,
        price,
        quantity,
        providers: [...form.venues].sort(),
        // Resting a remainder needs both a price to rest at and a volume to stop at.
        rest_remainder: form.rest && modeOf({ price, quantity }) === 'price_and_volume',
        cancel_after_seconds: Number(form.cancelAfter),
    };
}

/** The pair the ticket starts on: the one chosen if still traded, else USDT_IRT, else the first. */
const pickSymbol = (current: string, traded: string[]) =>
    traded.includes(current) ? current : traded.includes('USDT_IRT') ? 'USDT_IRT' : traded[0] || '';

/**
 * The order ticket: the form, its preview, and the two-step place (one click
 * arms a confirm button for a few seconds, a second places). Any edit to the
 * form throws the preview away, since it no longer describes the order.
 */
export function useOrderTicket(config: DeskConfig | undefined) {
    const status = usePageStatus();
    const now = useNow(1000);
    const previewOrder = usePreviewOrder();
    const placeOrder = usePlaceOrder();

    const [form, setForm] = useState<TicketForm>(INITIAL_FORM);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [note, setNote] = useState<PreviewNote>({ kind: 'prompt' });
    // The form moved since the last preview: the panel says so and dims it.
    const [changed, setChanged] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const confirmTimer = useRef<number | undefined>(undefined);

    const traded = config?.traded_symbols ?? [];
    const tradedKey = traded.join(',');
    useEffect(() => {
        if (traded.length) setForm((f) => ({ ...f, symbol: pickSymbol(f.symbol, traded) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tradedKey]);
    useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

    const request = toRequest(form);
    const mode = modeOf(request);
    const fresh = Boolean(preview && now - preview.at < PREVIEW_MAX_AGE_MS);

    function resetConfirm() {
        setConfirming(false);
        window.clearTimeout(confirmTimer.current);
    }

    /** Applies an edit; any edit but the slippage tolerance invalidates the preview. */
    function edit(patch: Partial<TicketForm>) {
        setForm((f) => {
            const next = { ...f, ...patch };
            return modeOf({ price: num(next.price), quantity: num(next.qty) }) === 'price_and_volume' ? next : { ...next, rest: false };
        });
        if (preview && !('slippage' in patch && Object.keys(patch).length === 1)) {
            setPreview(null);
            resetConfirm();
            setChanged(true);
        }
    }

    function toggleVenue(code: string) {
        const all = (config?.providers || []).map((p) => p.code);
        let next: Set<string>;
        if (form.venues.size === 0) {
            // From "all", a click means "only this one".
            next = new Set([code]);
        } else {
            next = new Set(form.venues);
            if (next.has(code)) next.delete(code); else next.add(code);
        }
        edit({ venues: next.size === all.length ? new Set() : next });
    }

    async function runPreview() {
        if (!modeOf(request)) {
            status.showError(msg('manual.preview.needInput'));
            return;
        }
        resetConfirm();
        try {
            const plan = await previewOrder.mutateAsync(request);
            setPreview({ plan, request, at: Date.now(), requestId: crypto.randomUUID() });
            setChanged(false);
            status.hideError();
        } catch (err) {
            const message = (err as Error).message;
            setPreview(null);
            status.showError(message);
            setNote({ kind: 'error', message });
        }
    }

    async function place() {
        if (!confirming) {
            if (fresh && !preview!.plan.blockers?.length) {
                setConfirming(true);
                window.clearTimeout(confirmTimer.current);
                confirmTimer.current = window.setTimeout(resetConfirm, CONFIRM_WINDOW_MS);
            }
            return;
        }
        if (!preview) return;
        window.clearTimeout(confirmTimer.current);
        const { plan, request: previewed, requestId } = preview;
        try {
            const result = await placeOrder.mutateAsync({
                ...previewed,
                client_request_id: requestId,
                expected_avg_price: plan.avg_price,
                expected_quantity: plan.total_qty,
                max_slippage_pct: Number(form.slippage) || 0.5,
            });
            status.hideError();
            setPreview(null);
            setChanged(false);
            setNote({ kind: 'placed', id: result.order.id.slice(0, 8), status: result.order.status, legs: result.legs.length });
        } catch (err) {
            const code = err instanceof ApiError ? err.status : 0;
            const message = (err as Error).message;
            status.showError(code === 504 ? msg('manual.place.timeout') : message);
            if (code === 409) {
                // The books moved: show the new route instead of the one
                // confirmed - and keep the refusal on screen, since a fresh
                // preview clears the banner.
                await runPreview();
                status.showError(message);
            }
        } finally {
            resetConfirm();
        }
    }

    return {
        form,
        edit,
        toggleVenue,
        mode,
        restAllowed: mode === 'price_and_volume',
        preview,
        note,
        fresh,
        /** Seconds since the preview was taken. */
        previewAge: preview ? Math.floor((now - preview.at) / 1000) : 0,
        changed,
        confirming,
        previewing: previewOrder.isPending,
        placing: placeOrder.isPending,
        runPreview,
        place,
        cancelConfirm: resetConfirm,
    };
}

export type OrderTicket = ReturnType<typeof useOrderTicket>;
