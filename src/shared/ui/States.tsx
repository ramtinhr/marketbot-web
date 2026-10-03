import type { CSSProperties, ReactNode } from 'react';

/** Placeholder while a section's first load is in flight. */
export function Skeleton({ children }: { children: ReactNode }) {
    return <div className="skeleton">{children}</div>;
}

export interface EmptyContent {
    icon?: string;
    text: ReactNode;
}

/** Shown when a load succeeded and there is nothing to list. */
export function EmptyState({ icon, text, style }: EmptyContent & { style?: CSSProperties }) {
    return <div className="empty-state" style={style}>{icon && <span className="big">{icon}</span>}{text}</div>;
}
