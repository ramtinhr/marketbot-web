import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import en from './locales/en';
import fa from './locales/fa';

// Nothing type-checks a translation key, so a rename or a new string reaches
// the browser as the literal key on screen - in the language the person cannot
// read, which is exactly where nobody is looking. These tests are that check.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'src');
const catalogues: Record<string, typeof en> = { en, fa };
const FALLBACK = 'en';

const placeholders = (s: string) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('catalogues', () => {
    test('every locale carries the metadata the runtime reads', () => {
        for (const [code, def] of Object.entries(catalogues)) {
            expect(def.name, `${code}: needs an endonym for the switcher`).toBeTruthy();
            expect(['ltr', 'rtl'], `${code}: dir`).toContain(def.dir);
            expect(Object.keys(def.strings).length, `${code}: has no strings`).toBeGreaterThan(0);
        }
    });

    test('every locale covers the English catalogue exactly', () => {
        const base = Object.keys(en.strings);
        for (const [code, def] of Object.entries(catalogues)) {
            if (code === FALLBACK) continue;
            expect(base.filter((k) => !(k in def.strings)), `${code}: missing keys`).toEqual([]);
            // An extra key is a key nothing reads - usually a typo.
            expect(Object.keys(def.strings).filter((k) => !(k in en.strings)), `${code}: extra keys`).toEqual([]);
        }
    });

    test('translations keep the placeholders their English original has', () => {
        for (const [code, def] of Object.entries(catalogues)) {
            if (code === FALLBACK) continue;
            for (const [key, value] of Object.entries(def.strings)) {
                expect(placeholders(value), `${code}: ${key}`).toBe(placeholders(en.strings[key]));
            }
        }
    });
});

// Every namespace the catalogue defines. A *whole* quoted literal shaped like
// one of these is a translation key; matching the whole literal is what keeps
// `providers.length` and file paths out of the results.
const NAMESPACES = [...new Set(Object.keys(en.strings).map((k) => k.split('.')[0]))];
const LITERAL_RE = /'([^'\n]+)'|"([^"\n]+)"|`([^`\n$]+)`/g;
const KEY_RE = new RegExp(`^(?:${NAMESPACES.join('|')})(?:\\.[A-Za-z0-9]+)+$`);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === 'locales' ? [] : sourceFiles(path);
        return /\.(tsx?)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
    });
}

/**
 * A key resolves if the catalogue has it outright, has its `.other` plural
 * form, or has anything beneath it - a prefix a caller completes at run time.
 */
function resolves(key: string): boolean {
    if (key in en.strings || `${key}.other` in en.strings) return true;
    return Object.keys(en.strings).some((k) => k.startsWith(`${key}.`));
}

test('every key the source uses exists in the catalogue', () => {
    const unknown: string[] = [];
    for (const file of sourceFiles(SRC)) {
        const text = readFileSync(file, 'utf8');
        for (const match of text.matchAll(LITERAL_RE)) {
            const literal = match[1] ?? match[2] ?? match[3];
            if (!KEY_RE.test(literal) || resolves(literal)) continue;
            unknown.push(`${file.slice(SRC.length + 1)}: ${literal}`);
        }
    }
    expect(unknown).toEqual([]);
});

// ---- The shipped font ------------------------------------------------------

const css = readFileSync(join(SRC, 'styles', 'app.css'), 'utf8');

test('every asset the stylesheet references is in public/', () => {
    const assets = [...new Set([...css.matchAll(/url\(['"]?(\/[^'")]+)['"]?\)/g)].map((m) => m[1]))];
    expect(assets.length, 'expected app.css to reference at least the Persian font').toBeGreaterThan(0);
    for (const url of assets) {
        expect(existsSync(join(ROOT, 'public', decodeURIComponent(url))), `app.css points at ${url}`).toBe(true);
    }
});

test('the Persian locale asks for a face the app actually ships', () => {
    const declared = [...css.matchAll(/@font-face\s*{[^}]*font-family:\s*'([^']+)'/g)].map((m) => m[1]);
    for (const key of ['font', 'monoFont'] as const) {
        const stack = String(fa[key] || '');
        expect(stack, `fa.${key} must name a stack`).toBeTruthy();
        // The first name in --sans decides how Persian looks; if it is not
        // shipped, the page is back to hoping the reader has it.
        if (key === 'font') expect(declared).toContain(stack.split(',')[0].replaceAll("'", '').trim());
        expect(stack, `fa.${key} should fall back to the shipped face`).toContain('Vazirmatn');
    }
});
