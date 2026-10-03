import type { CSSProperties } from 'react';

import { useI18n } from '../../../i18n';
import { escapeHtml } from '../../../shared/lib';
import { Html } from '../../../shared/ui';
import { walkBook, type Side } from '../book';
import { baseOf, fmtAsset, fmtToman, num, parseAmount, quoteLabel } from '../format';
import type { FormRole, MarketSession } from '../session';

const SLIDER_MARKS = [0, 25, 50, 75, 100];

/** What the order would do against the book on screen, before it is sent. */
function Preview({ market, side }: { market: MarketSession; side: Side }) {
    const { t } = useI18n();
    const s = market.s;
    const f = s.forms[side];
    const base = baseOf(s.symbol);
    const priceS = parseAmount(f.price);
    const qtyS = parseAmount(f.amount);
    if (!priceS || !qtyS) return <span className="mk-dim">{t('market.preview.empty')}</span>;

    const limit = num(priceS);
    const qty = num(qtyS);
    const { filled, cost } = walkBook(market.takerLevels(side), side, limit, qty);
    const bold = (text: string) => `<b>${escapeHtml(text)}</b>`;
    const amountOf = (v: number) => (side === 'buy' ? fmtToman(v) : market.fmtQty(v));

    let funds: string | null = null;
    if (s.userId) {
        const need = side === 'buy' ? limit * qty : qty;
        const have = market.balanceOf(market.fundingAsset(side)).available;
        if (need > have + 1e-9) {
            funds = t('market.preview.funds', { amount: amountOf(need), asset: side === 'buy' ? quoteLabel() : base, available: amountOf(have) });
        }
    }

    return (
        <>
            {filled <= 0 ? (
                <div>{t('market.preview.none', { price: market.fmtPrice(limit) })}</div>
            ) : (
                <>
                    <Html as="div" k="market.preview.fills" vars={{
                        qty: bold(market.fmtQty(filled)), base: escapeHtml(base), avg: bold(market.fmtPrice(cost / filled)),
                    }} />
                    {filled >= qty - 1e-12
                        ? <div>{t('market.preview.allFills')}</div>
                        : <Html as="div" k="market.preview.rests" vars={{
                            qty: bold(market.fmtQty(qty - filled)), base: escapeHtml(base), price: bold(market.fmtPrice(limit)),
                        }} />}
                </>
            )}
            {funds && <div><span className="mk-warn">{funds}</span></div>}
        </>
    );
}

/** The share of the available balance the order would use, as a slider that also sets it. */
function BalanceSlider({ market, side }: { market: MarketSession; side: Side }) {
    const { t, format } = useI18n();
    const s = market.s;
    const f = s.forms[side];
    const available = market.balanceOf(market.fundingAsset(side)).available;
    const price = num(parseAmount(f.price)) || market.bestFor(side) || 0;
    const amount = num(parseAmount(f.amount));
    const used = side === 'buy' ? amount * price : amount;
    const pct = available > 0 ? Math.min(100, (used / available) * 100) : 0;

    return (
        <div className="mk-slider" style={{ '--pct': `${pct.toFixed(1)}%` } as CSSProperties}>
            <input type="range" min={0} max={100} step={1} value={Math.round(pct)} disabled={!s.userId}
                   aria-label={t('market.form.percent')} aria-valuetext={format.percent(pct, 0)}
                   onChange={(e) => market.fillPercent(side, Number(e.target.value))} />
            <div className="mk-slider-marks">
                {SLIDER_MARKS.map((p) => (
                    <button key={p} type="button" className={pct >= p ? 'on' : ''} disabled={!s.userId}
                            title={format.percent(p, 0)} aria-label={format.percent(p, 0)}
                            onClick={() => market.fillPercent(side, p)} />
                ))}
            </div>
        </div>
    );
}

function TradeForm({ market, side }: { market: MarketSession; side: Side }) {
    const { t } = useI18n();
    const s = market.s;
    const base = baseOf(s.symbol);
    const f = s.forms[side];
    const asset = market.fundingAsset(side);
    const busy = s.busy[side];
    const input = (role: FormRole) => (
        <input type="text" inputMode="decimal" autoComplete="off" aria-label={t(`market.form.${role}`)}
               value={f[role]} onChange={(e) => market.setField(side, role, e.target.value)} />
    );

    return (
        <form className={`mk-form ${side}`} data-side={side} noValidate onSubmit={(e) => { e.preventDefault(); void market.placeOrder(side); }}>
            <div className="mk-field">
                <label>{t('market.form.price')}</label>
                {input('price')}
                <button type="button" className="mk-best" title={t(`market.form.best.${side}`)} onClick={() => market.bestClick(side)}>
                    {t('market.form.best')}
                </button>
                <span className="unit">{quoteLabel()}</span>
            </div>
            <div className="mk-field">
                <label>{t('market.form.amount')}</label>
                {input('amount')}
                <span className="unit">{base}</span>
            </div>
            <BalanceSlider market={market} side={side} />
            <div className="mk-field">
                <label>{t('market.form.total')}</label>
                {input('total')}
                <span className="unit">{quoteLabel()}</span>
            </div>
            <div className="mk-avail">
                <span>{t('market.form.available')}</span>
                <b>{s.userId
                    ? <><bdi>{fmtAsset(market.balanceOf(asset).available, asset, { floor: true })}</bdi> {side === 'buy' ? quoteLabel() : base}</>
                    : '—'}</b>
            </div>
            <div className="mk-preview" aria-live="polite"><Preview market={market} side={side} /></div>
            <button type="submit" className={`mk-submit ${side}`} disabled={busy || !s.userId}>
                {busy ? t('market.form.placing') : t(side === 'buy' ? 'market.form.buy' : 'market.form.sell', { base })}
            </button>
        </form>
    );
}

/** The buy and sell forms side by side. */
export function TradePanel({ market }: { market: MarketSession }) {
    const { t } = useI18n();
    return (
        <section className="panel mk-trade">
            <div className="mk-panel-head">
                <div className="mk-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected="true" className="active">{t('market.form.title')}</button>
                </div>
                <span className="panel-hint">{t('market.form.hint')}</span>
            </div>
            <div className="mk-forms">
                <TradeForm market={market} side="buy" />
                <TradeForm market={market} side="sell" />
            </div>
        </section>
    );
}
