import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { ApiError, request } from './client';
import { financialRequest } from './financial';

vi.mock('./client', async importOriginal => ({ ...await importOriginal<typeof import('./client')>(), request: vi.fn() }));
const mock = vi.mocked(request);
let values: Map<string,string>;
beforeEach(() => {
    values = new Map();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) || null, setItem: (k: string,v: string) => values.set(k,v), removeItem: (k: string) => values.delete(k) });
    mock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
const options = { method: 'POST' as const, body: { amount: '1', destination: 'private-destination' } };

test('network failure retains identity for retry; terminal success allows a new instruction', async () => {
    mock.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ order: {} });
    await expect(financialRequest('/exchange/orders',options)).rejects.toThrow('network');
    const first = mock.mock.calls[0][1]?.headers?.['Idempotency-Key'];
    expect(values.size).toBe(1);
    expect(JSON.stringify([...values])).not.toContain('private-destination');
    await financialRequest('/exchange/orders',options);
    expect(mock.mock.calls[1][1]?.headers?.['Idempotency-Key']).toBe(first);
    expect(values.size).toBe(0);
    await financialRequest('/exchange/orders',options);
    expect(mock.mock.calls[2][1]?.headers?.['Idempotency-Key']).not.toBe(first);
});

test('an unknown order is not shown as success and retains the same request identity', async () => {
    mock.mockResolvedValueOnce({ status:'unknown', request_id:'receipt', message:'not confirmed' }).mockResolvedValueOnce({ order:{} });
    await expect(financialRequest('/exchange/orders',options)).rejects.toBeInstanceOf(ApiError);
    expect(values.size).toBe(1);
    await financialRequest('/exchange/orders',options);
    expect(mock.mock.calls[0][1]?.headers?.['Idempotency-Key']).toBe(mock.mock.calls[1][1]?.headers?.['Idempotency-Key']);
});

test('financial submission stops if its identity cannot be retained',async()=>{
    vi.stubGlobal('localStorage',{getItem(){throw new Error('storage unavailable');}});
    await expect(financialRequest('/exchange/orders',options)).rejects.toThrow('storage unavailable');
    expect(mock).not.toHaveBeenCalled();
});
