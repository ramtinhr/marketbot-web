import { useI18n } from '../../../i18n';
import { cx, providerColor, providerLabel } from '../../../shared/lib';
import { Field, Panel, Segmented, SelectField } from '../../../shared/ui';
import type { DeskConfig } from '../api';
import { baseAsset, fmtQty } from '../format';
import type { Mode, OrderTicket } from '../useOrderTicket';

// Buy and sell get separate sentences rather than one with the verb
// substituted in: a language that inflects around the object cannot be
// translated a word at a time.
const MODE_KEYS: Record<Mode, string> = {
    price_and_volume: 'manual.mode.priceAndVolume',
    volume_only: 'manual.mode.volumeOnly',
    price_only: 'manual.mode.priceOnly',
};

const CANCEL_AFTER: Array<[string, string]> = [
    ['0', 'manual.cancelAfter.never'],
    ['30', 'manual.cancelAfter.30s'],
    ['60', 'manual.cancelAfter.1m'],
    ['300', 'manual.cancelAfter.5m'],
    ['900', 'manual.cancelAfter.15m'],
];

function VenueChips({ ticket, config }: { ticket: OrderTicket; config: DeskConfig | undefined }) {
    const { t, format } = useI18n();
    const { venues } = ticket.form;
    return (
        <Field label={<>
            <span>{t('manual.venues')}</span>{' '}
            <span className="mt-label-note">
                {venues.size === 0 ? t('manual.venues.all') : t('manual.venues.selected', { count: format.number(venues.size) })}
            </span>
        </>}>
            <div className="series-toggles">
                {(config?.providers || []).map((p) => {
                    const on = venues.size === 0 || venues.has(p.code);
                    return (
                        <label key={p.code} className={cx('series-chip', !on && 'off')} onClick={() => ticket.toggleVenue(p.code)}>
                            <span className="series-swatch" style={{ background: providerColor(p.code) }} />
                            {providerLabel(p.code)}
                            {p.order_circuit_state === 'open' && <> <span className="chip circuit-open">{t('manual.venues.ordersPaused')}</span></>}
                        </label>
                    );
                })}
            </div>
        </Field>
    );
}

/** Why the place button is disabled, or '' when it is not. */
function useBlockReason(ticket: OrderTicket, config: DeskConfig | undefined, configTried: boolean): string {
    const { t } = useI18n();
    const plan = ticket.preview?.plan;
    if (!configTried) return t('manual.hint.default');
    if (!config?.available) return t('manual.hint.noDesk');
    if (!config.enabled) return t('manual.hint.disabled');
    if (!plan) return t('manual.hint.default');
    if (plan.blockers?.length) return t('manual.hint.blocked');
    if (!ticket.fresh) return t('manual.hint.stale');
    return '';
}

function TicketActions({ ticket, config, configTried }: { ticket: OrderTicket; config: DeskConfig | undefined; configTried: boolean }) {
    const { t, plural, format } = useI18n();
    const { confirming, placing, previewing } = ticket;
    const plan = ticket.preview?.plan;
    const reason = useBlockReason(ticket, config, configTried);

    let placeLabel = t('manual.place');
    if (placing) placeLabel = t('manual.placing');
    else if (confirming && plan) {
        placeLabel = t('manual.confirm.button', {
            side: plan.side.toUpperCase(),
            qty: fmtQty(plan.total_qty),
            asset: baseAsset(plan.symbol),
            venues: plan.legs.length === 1 ? providerLabel(plan.legs[0].provider) : t('manual.confirm.venues', { count: format.number(plan.legs.length) }),
        });
    }
    const hint = confirming
        ? t(config?.simulate_orders ? 'manual.confirm.simulation' : 'manual.confirm.live')
        : reason || plural('manual.hint.ready', plan!.legs.length, {
            count: format.number(plan!.legs.length),
            simulation: config?.simulate_orders ? t('manual.hint.simulationSuffix') : '',
        });

    return (
        <div className="mt-actions">
            <button className="btn primary" type="button" hidden={confirming} disabled={previewing} onClick={() => void ticket.runPreview()}>
                {t(previewing ? 'manual.previewing' : 'manual.preview')}
            </button>
            <button className={cx('btn mt-place', confirming && plan && `mt-confirm ${plan.side}`)} type="button"
                    disabled={placing || (!confirming && Boolean(reason))} onClick={() => void ticket.place()}>
                {placeLabel}
            </button>
            <button className="btn" type="button" hidden={!confirming || placing} onClick={ticket.cancelConfirm}>{t('manual.back')}</button>
            <span className="panel-hint">{hint}</span>
        </div>
    );
}

export function OrderForm({ ticket, config, configTried }: { ticket: OrderTicket; config: DeskConfig | undefined; configTried: boolean }) {
    const { t } = useI18n();
    const { form, edit, mode, restAllowed } = ticket;

    return (
        <Panel title={t('manual.order.title')} hint={mode ? t(`${MODE_KEYS[mode]}.title`) : ''}>
            <div className="mt-form">
                <div className="mt-row">
                    <Field label={t('manual.side')}>
                        <Segmented className="mt-side" dataKey="side" value={form.side} onPick={(side) => edit({ side })}
                                   options={(['buy', 'sell'] as const).map((s) => ({ value: s, label: t(`manual.side.${s}`) }))} />
                    </Field>
                    <SelectField id="symbolSelect" label={t('manual.pair')} value={form.symbol} onChange={(symbol) => edit({ symbol })}
                                 options={(config?.traded_symbols || []).map((s) => ({ value: s, label: s.replace('_', ' / ') }))} />
                </div>

                <VenueChips ticket={ticket} config={config} />

                <div className="mt-row">
                    <Field id="priceInput" className="mt-grow"
                           label={<><span>{t('manual.price')}</span> <span className="mt-label-note">{t('manual.price.note')}</span></>}>
                        <input type="number" id="priceInput" min="0" step="any" inputMode="decimal" placeholder={t('manual.price.placeholder')}
                               value={form.price} onChange={(e) => edit({ price: e.target.value })} />
                    </Field>
                    <Field id="qtyInput" className="mt-grow" label={<>
                        <span>{t('manual.volume')}</span>{' '}
                        <span className="mt-label-note">{t('manual.volume.unit', { asset: baseAsset(form.symbol) || t('manual.volume.baseAsset') })}</span>
                    </>}>
                        <input type="number" id="qtyInput" min="0" step="any" inputMode="decimal" placeholder={t('manual.volume.placeholder')}
                               value={form.qty} onChange={(e) => edit({ qty: e.target.value })} />
                    </Field>
                </div>

                <div className="mt-mode">
                    {mode
                        ? <><strong>{t(`${MODE_KEYS[mode]}.title`)}</strong><span>{t(`${MODE_KEYS[mode]}.${form.side}`)}</span></>
                        : <><strong>{t('manual.mode.none.title')}</strong><span>{t('manual.mode.none.text')}</span></>}
                </div>

                <div className="mt-row mt-options">
                    <label className={cx('switch', !restAllowed && 'mt-disabled')}>
                        <input type="checkbox" checked={form.rest && restAllowed} disabled={!restAllowed} onChange={(e) => edit({ rest: e.target.checked })} />
                        <span className="track" />
                        <span>{t('manual.rest')}</span>
                    </label>
                    <SelectField id="cancelAfterSelect" label={t('manual.cancelAfter')} value={form.cancelAfter} onChange={(cancelAfter) => edit({ cancelAfter })}
                                 options={CANCEL_AFTER.map(([value, key]) => ({ value, label: t(key) }))} />
                    <Field id="slippageInput" label={t('manual.slippage')}>
                        <input type="number" id="slippageInput" min="0.01" max="5" step="0.05" value={form.slippage} onChange={(e) => edit({ slippage: e.target.value })} />
                    </Field>
                </div>

                <TicketActions ticket={ticket} config={config} configTried={configTried} />
            </div>
        </Panel>
    );
}
