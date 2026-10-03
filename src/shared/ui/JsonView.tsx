import { renderJSON } from '../lib/renderJSON';

/** A value as syntax-highlighted, pretty-printed JSON. */
export function JsonView({ value }: { value: unknown }) {
    return <div className="json-view" dangerouslySetInnerHTML={{ __html: renderJSON(value) }} />;
}
