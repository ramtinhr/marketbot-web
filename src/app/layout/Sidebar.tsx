import { Link } from 'react-router-dom';

import { useI18n } from '../../i18n';
import { useAuthStore, useCurrentAdmin } from '../../features/auth/store';
import { cx, initial } from '../../shared/lib';
import { LanguageToggle, LogoutIcon, ThemeToggle } from '../../shared/ui';
import { NAV } from './nav';
import { useShellStore } from './shellStore';

export function Sidebar({ activeHref }: { activeHref: string }) {
    const { t } = useI18n();
    const close = () => useShellStore.getState().setSidebarOpen(false);
    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <div className="brand-mark" aria-hidden="true">M</div>
                <div>
                    <h1>MarketBot</h1>
                    <div className="sub">{t('shell.brandSub')}</div>
                </div>
            </div>
            <nav className="nav">
                {NAV.map(group => (
                    <div className="nav-group" key={group.label}>
                        <div className="nav-label">{t(group.label)}</div>
                        {group.items.map(item => {
                            const active = item.href === activeHref;
                            return (
                                <Link key={item.href} to={item.href} onClick={close}
                                      className={cx('nav-link', active && 'active')} aria-current={active ? 'page' : undefined}>
                                    {item.icon}
                                    <span>{t(item.label)}</span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>
            <div className="sidebar-footer">
                <SidebarUser />
                <LanguageToggle />
                <ThemeToggle />
                <div className="sidebar-meta">{t('shell.tagline')}</div>
            </div>
        </aside>
    );
}

function SidebarUser() {
    const { t } = useI18n();
    const admin = useCurrentAdmin();
    const logout = useAuthStore((s) => s.logout);
    if (!admin) return null;
    return (
        <div className="sidebar-user">
            <span className="sidebar-user-avatar" aria-hidden="true">{initial(admin.username)}</span>
            <div className="sidebar-user-text">
                <span className="sidebar-user-name">{admin.username}</span>
                <span className="sidebar-user-role">{t('shell.role')}</span>
            </div>
            <button type="button" className="sidebar-logout" onClick={() => void logout()}
                    title={t('shell.signOut')} aria-label={t('shell.signOut')}>
                <LogoutIcon />
            </button>
        </div>
    );
}
