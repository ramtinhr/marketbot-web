import { useState } from 'react';

import { useInterval } from './useInterval';

/** The current time in ms, re-read every `ms`, for countdowns and "n seconds ago". */
export function useNow(ms = 1000): number {
    const [now, setNow] = useState(() => Date.now());
    useInterval(() => setNow(Date.now()), ms);
    return now;
}
