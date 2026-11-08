import { ApiError, request, type RequestOptions } from './client';

function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)]));
    return value;
}

/** Retain the instruction's identity across network failures, page reloads and browser restarts.
 * Storage contains only a payload digest and UUID, never destination/profile data.
 */
export async function financialRequest<T>(path: string, options: RequestOptions): Promise<T> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([path, options.method || 'POST', sorted(options.body)])));
    const slot = 'marketbot:financial:' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    let key = localStorage.getItem(slot);
    if (!key) { key = crypto.randomUUID(); localStorage.setItem(slot, key); }
    try {
        const result = await request<T>(path, { ...options, headers: { ...options.headers, 'Idempotency-Key': key } });
        const pending = result as { status?: string; message?: string; request_id?: string };
        if (pending.status === 'unknown') {
            throw new ApiError(202, { ...pending, error: pending.message || 'The order outcome is not confirmed. Check the existing order before trying again.' });
        }
        localStorage.removeItem(slot);
        return result;
    } catch (err) {
        // Unknown, network and server failures may follow a committed operation.
        if (err instanceof ApiError && [400, 403, 404, 409, 422].includes(err.status)) localStorage.removeItem(slot);
        throw err;
    }
}
