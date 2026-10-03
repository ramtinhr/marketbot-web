import type { Key, ReactNode } from 'react';

import type { ListView } from '../hooks/useListControls';
import { cx } from '../lib/cx';
import type { EmptyContent } from './States';

/** What a header cell needs: shared by DataTable and the hand-built expandable tables. */
export interface HeaderSpec {
    /** Unique within the table; also the sort key when the column is sortable. */
    key: string;
    header: ReactNode;
    headerClassName?: string;
    headerTitle?: string;
    sortable?: boolean;
}

export interface Column<T> extends HeaderSpec {
    cell: (row: T, index: number) => ReactNode;
    className?: string | ((row: T) => string | undefined);
}

/** Where sorting lives for a sortable table: the current order and how to change it. */
export interface TableSort {
    view: Pick<ListView, 'sort' | 'dir'>;
    onSort: (key: string) => void;
}

function HeaderCell({ column, sort }: { column: HeaderSpec; sort?: TableSort }) {
    if (!column.sortable || !sort) {
        return <th className={column.headerClassName} title={column.headerTitle}>{column.header}</th>;
    }
    const active = sort.view.sort === column.key;
    return (
        <th className={cx('sortable', column.headerClassName)} title={column.headerTitle} onClick={() => sort.onSort(column.key)}>
            {column.header}
            {active && <span className="sort-caret">{sort.view.dir === 'asc' ? '▲' : '▼'}</span>}
        </th>
    );
}

export function TableHead({ columns, sort }: { columns: HeaderSpec[]; sort?: TableSort }) {
    return (
        <thead>
            <tr>{columns.map((c) => <HeaderCell key={c.key} column={c} sort={sort} />)}</tr>
        </thead>
    );
}

/** The full-width row under an expandable row; kept in the DOM, hidden when closed. */
export function DetailRow({ open, span, children }: { open: boolean; span: number; children: ReactNode }) {
    return (
        <tr className={cx('detail-row', !open && 'hidden')}>
            <td colSpan={span}>{open && children}</td>
        </tr>
    );
}

interface DataTableProps<T> {
    columns: Column<T>[];
    /** Undefined while the first load is in flight. */
    rows: T[] | undefined;
    rowKey: (row: T, index: number) => Key;
    loading: ReactNode;
    empty: EmptyContent;
    className?: string;
    rowClassName?: (row: T) => string | undefined;
    onRowClick?: (row: T) => void;
    sort?: TableSort;
}

/** A scrollable `.data-table` with its loading and empty states as full-width rows. */
export function DataTable<T>({ columns, rows, rowKey, loading, empty, className, rowClassName, onRowClick, sort }: DataTableProps<T>) {
    const span = columns.length;
    return (
        <div className="table-scroll">
            <table className={cx('data-table', className)}>
                <TableHead columns={columns} sort={sort} />
                <tbody>
                    {rows === undefined ? (
                        <tr><td colSpan={span} className="skeleton">{loading}</td></tr>
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={span} className="empty-state">{empty.icon && <span className="big">{empty.icon}</span>}{empty.text}</td></tr>
                    ) : rows.map((row, i) => (
                        <tr key={rowKey(row, i)} className={rowClassName?.(row)} onClick={onRowClick && (() => onRowClick(row))}>
                            {columns.map((c) => (
                                <td key={c.key} className={typeof c.className === 'function' ? c.className(row) : c.className}>
                                    {c.cell(row, i)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
