// MarketBot i18n runtime.
//
// A page never hardcodes a user-visible string: components call `t()` and read
// from the catalogues in ./locales, so a key can only ever be translated in
// one place. This module holds the active locale; React re-renders off the
// provider in ./I18nProvider, and non-React code (chart builders) calls the
// same functions.

export interface LocaleDef {
    name?: string;          // endonym, shown in the switcher
    englishName?: string;
    dir?: 'ltr' | 'rtl';
    // Number and date formatting are locale properties, not string lookups:
    // Persian text with en-US dates reads as a half translation.
    numberLocale?: string;
    dateLocale?: string;
    // Persian needs both faces: the monospace stack is Latin-only, so a status
    // line set in it would fall through to a generic monospace and shape badly.
    font?: string | null;
    monoFont?: string | null;
    strings: Record<string, string>;
}

interface Locale {
    code: string;
    name: string;
    englishName: string;
    dir: 'ltr' | 'rtl';
    numberLocale: string;
    dateLocale: string;
    font: string | null;
    monoFont: string | null;
    strings: Record<string, string>;
}

export type Vars = Record<string, string | number> | null | undefined;

const STORAGE_KEY = 'marketbot-lang';
const QUERY_PARAM = 'lang';
// The catalogue every other locale is measured against: a key missing from a
// translation falls back here rather than showing the raw key to a user.
const FALLBACK = 'en';

const locales: Record<string, Locale> = Object.create(null);
const listeners = new Set<(detail: { locale: string; dir: string }) => void>();
const formatterCache = new Map<string, unknown>();
let active: Locale | null = null;

/** Registering is what makes a language exist: the switcher lists whatever is registered, in order. */
export function register(code: string, def: LocaleDef): void {
    locales[code] = {
        code,
        name: def.name || code,
        englishName: def.englishName || def.name || code,
        dir: def.dir || 'ltr',
        numberLocale: def.numberLocale || code,
        dateLocale: def.dateLocale || def.numberLocale || code,
        font: def.font || null,
        monoFont: def.monoFont || null,
        strings: def.strings || {},
    };
}

// Browsers report tags like "fa-IR"; catalogues are keyed by the primary subtag.
const normalize = (tag: string | null | undefined) => String(tag || '').toLowerCase().split('-')[0];
const isKnownTag = (tag: string | null | undefined) => Boolean(locales[normalize(tag)]);

function readQuery(): string | null {
    try { return new URLSearchParams(window.location.search).get(QUERY_PARAM); } catch { return null; }
}
function readStorage(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeStorage(code: string): void {
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* private mode */ }
}

function preferredCode(): string {
    const fromQuery = readQuery();
    if (fromQuery && isKnownTag(fromQuery)) return normalize(fromQuery);
    const stored = readStorage();
    if (stored && isKnownTag(stored)) return normalize(stored);
    for (const tag of (navigator.languages || [navigator.language || ''])) {
        if (isKnownTag(tag)) return normalize(tag);
    }
    return FALLBACK;
}

function setVar(name: string, value: string | null): void {
    const root = document.documentElement;
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
}

function activate(code: string, silent = false): void {
    const locale = locales[code];
    if (!locale || (active && active.code === code)) return;
    active = locale;
    formatterCache.clear();

    const root = document.documentElement;
    root.setAttribute('lang', locale.code);
    root.setAttribute('dir', locale.dir);
    // Latin and Persian faces disagree about x-height and line spacing, so the
    // stacks are locale properties rather than fixed rules in app.css.
    setVar('--sans', locale.font);
    setVar('--mono', locale.monoFont);

    if (silent) return;
    const detail = { locale: locale.code, dir: locale.dir };
    listeners.forEach(fn => {
        try { fn(detail); } catch (e) { console.error('[i18n] listener failed', e); }
    });
}

/** Called once after every catalogue has registered. */
export function init(): void {
    if (!active) activate(preferredCode(), true);
    if (!active) activate(FALLBACK, true);
}

export function setLocale(code: string): void {
    const normalized = normalize(code);
    if (!locales[normalized]) {
        console.warn('[i18n] unknown locale', code);
        return;
    }
    writeStorage(normalized);
    activate(normalized);
}

/** Subscribe to language changes. Returns an unsubscribe function. */
export function onChange(fn: (detail: { locale: string; dir: string }) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

function lookup(key: string): string | null {
    if (active && key in active.strings) return active.strings[key];
    const fallback = locales[FALLBACK];
    if (fallback && key in fallback.strings) {
        if (active && active.code !== FALLBACK) console.warn('[i18n] missing', active.code, 'string for', key);
        return fallback.strings[key];
    }
    console.warn('[i18n] unknown key', key);
    return null;
}

/**
 * t('dashboard.providers.circuit', { state: 'open' }) -> "circuit: open"
 *
 * Placeholders are `{name}`, substituted verbatim. `t()` returns text; React
 * escapes it. The few catalogue strings that carry markup are rendered with
 * <Html> (components/Html.tsx), which is only ever given catalogue output.
 */
export function t(key: string, vars?: Vars): string {
    const template = lookup(key);
    if (template === null) return key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => (
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    ));
}

/** True if the key resolves in the active or fallback catalogue, without warning. */
export function has(key: string): boolean {
    return Boolean((active && key in active.strings) || (locales[FALLBACK] && key in locales[FALLBACK].strings));
}

function cached<T>(kind: string, opts: object, build: (loc: Locale) => T): T {
    const code = active ? active.code : FALLBACK;
    const cacheKey = `${code}|${kind}|${JSON.stringify(opts)}`;
    if (!formatterCache.has(cacheKey)) {
        const loc = active || locales[FALLBACK] || ({ code: 'en', numberLocale: 'en', dateLocale: 'en' } as Locale);
        formatterCache.set(cacheKey, build(loc));
    }
    return formatterCache.get(cacheKey) as T;
}

/**
 * Plural form of `key`, chosen by the active locale's own rules rather than
 * by `count === 1`: plural('row', 2) reads `row.other`.
 */
export function plural(key: string, count: number, vars?: Vars): string {
    const rules = cached('plural', {}, (loc) => new Intl.PluralRules(loc.code));
    const category = rules.select(Number(count) || 0);
    const withCount = Object.assign({ count: format.number(count) }, vars || {});
    const candidate = `${key}.${category}`;
    return has(candidate) ? t(candidate, withCount) : t(`${key}.other`, withCount);
}

const isBlank = (v: unknown) =>
    v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v));

type Num = number | string | null | undefined;

function formatDate(value: unknown, opts: Intl.DateTimeFormatOptions): string {
    const d = value instanceof Date ? value : new Date(value as string);
    if (!value || Number.isNaN(d.getTime())) return t('common.na');
    return cached('date', opts, (loc) => new Intl.DateTimeFormat(loc.dateLocale, opts)).format(d);
}

export const format = {
    /** Grouped number. `t('common.na')` stands in for anything unusable. */
    number(value: Num, opts?: Intl.NumberFormatOptions): string {
        const n = Number(value);
        if (isBlank(value) || Number.isNaN(n)) return t('common.na');
        return cached('number', opts || {}, (loc) => new Intl.NumberFormat(loc.numberLocale, opts || {})).format(n);
    },
    /** Fixed decimals, e.g. a price or a spread. */
    decimal(value: Num, digits: number): string {
        return format.number(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    },
    /** A percentage already in percent units (2.5 -> "2.50%"), as every API field reports one. */
    percent(value: Num, digits?: number): string {
        const n = Number(value);
        if (isBlank(value) || Number.isNaN(n)) return t('common.na');
        return t('common.percent', { value: format.decimal(n, digits === undefined ? 2 : digits) });
    },
    /** Seconds, as an age or a duration. */
    seconds(value: Num, digits?: number): string {
        const n = Number(value);
        if (isBlank(value) || Number.isNaN(n)) return t('common.na');
        return t('common.seconds', { value: format.decimal(n, digits === undefined ? 1 : digits) });
    },
    date(value: unknown, opts?: Intl.DateTimeFormatOptions): string {
        return formatDate(value, opts || { year: 'numeric', month: 'short', day: 'numeric' });
    },
    time(value: unknown, opts?: Intl.DateTimeFormatOptions): string {
        return formatDate(value, opts || { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
    dateTime(value: unknown, opts?: Intl.DateTimeFormatOptions): string {
        return formatDate(value, opts || {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    },
};

export function getLocale(): string { return active ? active.code : FALLBACK; }
export function getDir(): 'ltr' | 'rtl' { return active ? active.dir : 'ltr'; }
export function isRTL(): boolean { return getDir() === 'rtl'; }

/** Registration-ordered, for the language switcher. */
export function available() {
    return Object.keys(locales).map(code => ({
        code,
        name: locales[code].name,
        englishName: locales[code].englishName,
        dir: locales[code].dir,
    }));
}
