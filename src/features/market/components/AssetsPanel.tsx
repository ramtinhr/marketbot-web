import { useI18n } from '../../../i18n';
import { providerLabel } from '../../../shared/lib';
import type { Balance } from '../api';
import { baseOf, fmtAsset, num, quoteLabel } from '../format';
import type { MarketSession } from '../session';

function Balances({ market }: { market: MarketSession }) {
    const { t } = useI18n();
    const s = market.s;
    const live = market.isLive();
    const balances = market.shownBalances();
    if (!live && !s.userId) return <div><div className="mk-empty">{t('market.orders.selectUser')}</div></div>;
    if (!balances.length) return <div><div className="mk-empty">{t('market.balances.empty')}</div></div>;
    const base = baseOf(s.symbol);
    // Live: where each total sits - an order on one venue is paid from that
    // venue's wallet, not from the sum - and which venues could not be read.
    const venueTip = (b: Balance) => ((b.venues || []) as Balance[])
        .map((v) => `${providerLabel(v.provider)}: ${fmtAsset(v.available, b.asset, { floor: true })}`).join('\n');
    const rank = (x: Balance) => (x.asset === base ? 0 : x.asset === 'IRT' ? 1 : 2);
    const rows = [...balances].sort((a, b) => rank(a) - rank(b) || a.asset.localeCompare(b.asset));
    return (
        <div>
            <table className="mk-balances">
                <thead><tr><th>{t('market.balances.asset')}</th><th>{t('market.balances.available')}</th><th>{t('market.balances.locked')}</th></tr></thead>
                <tbody>
                    {rows.map((b) => {
                        const irt = b.asset === 'IRT';
                        const f = (v: unknown) => fmtAsset(v, b.asset, { floor: true });
                        return (
                            <tr key={b.asset} className={b.asset === base || irt ? '' : 'mk-dim'} title={venueTip(b)}>
                                <td>{irt ? quoteLabel() : b.asset}</td>
                                <td>{f(b.available)}</td>
                                <td>{num(b.locked) > 0 ? f(b.locked) : '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {live && s.real && s.real.unavailable.length > 0 && (
                <div className="mk-dim mk-note">{t('market.balances.unavailable', { venues: s.real.unavailable.map(providerLabel).join(', ') })}</div>
            )}
        </div>
    );
}

/** What the page trades against: test funds in demo mode, the bot's real balances live. */
export function AssetsPanel({ market }: { market: MarketSession }) {
    const { t } = useI18n();
    const s = market.s;
    const live = market.isLive();
    return (
        <section className="panel mk-assets">
            <div className="mk-panel-head">
                <h2 title={live ? t('market.balances.liveHint') : ''}>
                    {t(live ? 'market.balances.titleLive' : 'market.balances.title')}
                </h2>
                {/* Test funds exist only in demo mode: live orders spend real money. */}
                <button className="btn mt-small" type="button" title={t('market.faucet.hint')} hidden={live}
                        disabled={!s.userId || live || s.faucetBusy} onClick={() => void market.topUp()}>
                    {t('market.faucet')}
                </button>
            </div>
            <Balances market={market} />
        </section>
    );
}
