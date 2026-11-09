import { afterEach, expect, test, vi } from 'vitest';

vi.mock('../shared/ui', () => ({ Icon: () => null }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test('backoffice shares the admin API with separate navigation and home', async () => {
    vi.stubEnv('VITE_PANEL', 'backoffice');
    vi.stubEnv('VITE_API_BASE', '');
    const { NAV, normalizePath } = await import('./layout/nav');
    const { API_BASE } = await import('../shared/api/client');
    const { HOME_PATH } = await import('./panel');
    const paths = NAV.flatMap(group => group.items.map(item => item.href));
    expect(paths).toEqual(['/customers', '/bank-accounts', '/withdrawals', '/deposits', '/payments', '/ledger', '/auctions', '/p2p', '/admins']);
    expect(API_BASE).toBe('/backoffice/v1');
    expect(normalizePath('/')).toBe('/customers');
    expect(HOME_PATH).toBe('/customers');
});

test('trading panel excludes customer operations and retains its API', async () => {
    vi.stubEnv('VITE_PANEL', 'trading');
    vi.stubEnv('VITE_API_BASE', '');
    const { NAV, normalizePath } = await import('./layout/nav');
    const { API_BASE } = await import('../shared/api/client');
    const paths = NAV.flatMap(group => group.items.map(item => item.href));
    expect(paths).toContain('/market');
    expect(paths).not.toContain('/customers');
    expect(paths).not.toContain('/withdrawals');
    expect(API_BASE).toBe('/backoffice/v1');
    expect(normalizePath('/')).toBe('/dashboard');
});
