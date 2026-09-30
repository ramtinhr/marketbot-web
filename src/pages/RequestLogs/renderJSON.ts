// Text-content escaping only: quotes must stay literal for the string/key
// pattern below to see them, and the result never lands in an attribute.
const escapeText = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

/**
 * Pretty-prints a JS value as syntax-highlighted JSON markup for a `.json-view`.
 * The JSON text is escaped before any span is added, so the result is safe for
 * dangerouslySetInnerHTML.
 */
export function renderJSON(value: unknown): string {
    if (value === null || value === undefined) return '<span class="json-null">null</span>';
    const json = JSON.stringify(value, null, 2);
    if (json === undefined) return '<span class="json-null">null</span>';
    return escapeText(json).replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        (match) => {
            if (/^"/.test(match)) return `<span class="${/:$/.test(match) ? 'json-key' : 'json-string'}">${match}</span>`;
            if (/true|false/.test(match)) return `<span class="json-bool">${match}</span>`;
            if (/null/.test(match)) return `<span class="json-null">${match}</span>`;
            return `<span class="json-number">${match}</span>`;
        },
    );
}
