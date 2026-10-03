import { QueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../features/auth/store';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Polled pages retry on their next tick; a retry storm in between
            // only delays the red pill that says the API is gone.
            retry: false,
            refetchOnWindowFocus: false,
        },
        mutations: { retry: false },
    },
});

// One admin's data must not be on screen for the next one to sign in.
useAuthStore.subscribe((state, prev) => {
    if (prev.session.status === 'signedIn' && state.session.status !== 'signedIn') queryClient.clear();
});
