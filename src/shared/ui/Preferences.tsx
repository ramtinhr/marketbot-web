import type { ComponentType } from 'react';

import { useI18n } from '../../i18n';
import { cx } from '../lib/cx';
import { useTheme, type Theme } from '../stores/theme';
import { MoonIcon, SunIcon } from './icons';

/** The language switcher; hidden while only one language is registered. */
export function LanguageToggle() {
    const { t, locale, available, setLocale } = useI18n();
    const languages = available();
    if (languages.length < 2) return null;
    return (
        <div className="lang-toggle" role="group" aria-label={t('shell.languageLabel')}>
            {languages.map((lang) => (
                <button key={lang.code} type="button" lang={lang.code} dir={lang.dir} title={lang.englishName}
                        className={cx(lang.code === locale && 'active')} onClick={() => setLocale(lang.code)}>{lang.name}</button>
            ))}
        </div>
    );
}

const THEMES: Array<{ value: Theme; label: string; icon: ComponentType }> = [
    { value: 'dark', label: 'shell.theme.dark', icon: MoonIcon },
    { value: 'light', label: 'shell.theme.light', icon: SunIcon },
];

export function ThemeToggle({ icons = true }: { icons?: boolean }) {
    const { t } = useI18n();
    const { theme, setTheme } = useTheme();
    return (
        <div className="theme-toggle" role="group" aria-label={t('shell.themeLabel')}>
            {THEMES.map(({ value, label, icon: ThemeIcon }) => (
                <button key={value} type="button" className={cx(theme === value && 'active')} onClick={() => setTheme(value)}>
                    {icons && <ThemeIcon />}
                    <span>{t(label)}</span>
                </button>
            ))}
        </div>
    );
}
