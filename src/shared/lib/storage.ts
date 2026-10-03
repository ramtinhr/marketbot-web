/** localStorage that never throws: every stored choice is a per-browser nicety only. */
export function readStore(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStore(key: string, value: string): void {
    try { localStorage.setItem(key, value); } catch { /* per-browser nicety only */ }
}
