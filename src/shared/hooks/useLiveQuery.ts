import { useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Message } from '../../i18n';
import { usePageStatus, type ErrorBanner } from '../stores/pageStatus';

export type LiveQueryOptions<T> = UseQueryOptions<T, Error, T, QueryKey> & {
    /**
     * What the error banner says when a fetch fails: that the API is
     * unreachable (the default, right for read-only reports), or the API's own
     * message (right where a refusal means something, like a forbidden list),
     * a page-specific message built from the error, or none at all (the page
     * shows the failure in place).
     */
    errorBanner?: 'unreachable' | 'message' | 'none' | ((error: Error) => Message);
};

function bannerFor(choice: NonNullable<LiveQueryOptions<unknown>['errorBanner']>, error: Error): ErrorBanner | null {
    if (choice === 'none') return null;
    if (choice === 'unreachable') return { kind: 'unreachable' };
    if (choice === 'message') return { kind: 'text', text: error.message };
    return { kind: 'message', message: choice(error) };
}

/**
 * A query whose outcome is the page's health: every success stamps the
 * topbar pill "Updated hh:mm:ss" and clears the banner, every failure turns
 * the pill red and raises the banner. Pass `refetchInterval` to poll.
 */
export function useLiveQuery<T>({ errorBanner = 'unreachable', ...options }: LiveQueryOptions<T>): UseQueryResult<T, Error> {
    const query = useQuery(options);
    const { reportUpdated, reportLost } = usePageStatus();
    const { dataUpdatedAt, errorUpdatedAt, error } = query;

    useEffect(() => {
        if (dataUpdatedAt) reportUpdated(dataUpdatedAt);
    }, [dataUpdatedAt, reportUpdated]);

    useEffect(() => {
        if (!errorUpdatedAt || !error) return;
        reportLost(bannerFor(errorBanner, error));
        // Only a new failure should raise the banner, not a re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [errorUpdatedAt]);

    return query;
}
