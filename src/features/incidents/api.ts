import { request } from '../../shared/api';
import { useLiveQuery } from '../../shared/hooks';

export interface HealthEvent {
    id: number;
    created_at: string;
    provider_code: string;
    /** Circuit states are the bot's own vocabulary, shown as recorded. */
    from_state: string;
    to_state: string;
    reason: string | null;
}

export interface HealthEventsResponse {
    events: HealthEvent[];
    count: number;
}

export const incidentsApi = {
    healthEvents: (limit: number, signal?: AbortSignal) =>
        request<HealthEventsResponse>('/providers/health-events', { params: { limit }, signal }),
};

const LIMIT = 100;

export function useHealthEvents() {
    return useLiveQuery({
        queryKey: ['providers', 'health-events', LIMIT],
        queryFn: ({ signal }) => incidentsApi.healthEvents(LIMIT, signal),
        refetchInterval: 5000,
    });
}
