import type { ReactNode } from 'react';

/**
 * A translated template whose `{name}` placeholders are filled by React nodes
 * (a <bdi> around a signed number, a highlighted id). Call t() without the
 * node-valued vars so their placeholders survive into `template`.
 */
export default function Template({ template, nodes }: { template: string; nodes: Record<string, ReactNode> }) {
    const parts = template.split(/\{(\w+)\}/g);
    return (
        <>
            {parts.map((part, i) => (i % 2 === 1
                ? <span key={i}>{Object.prototype.hasOwnProperty.call(nodes, part) ? nodes[part] : `{${part}}`}</span>
                : part))}
        </>
    );
}
