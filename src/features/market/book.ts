import type { ExchangeOrder } from './api';
import { num } from './format';

export type Side = 'buy' | 'sell';
export type BookSide = 'bid' | 'ask';

/** A published level: its size, the part users' orders make up, and the venues behind the rest. */
export interface BookLevel { price: unknown; quantity: unknown; user_quantity?: unknown; venues?: string[] }
export interface BookRow { price: number; quantity: number; user: number; venues: string[] }

export const isOpen = (o: ExchangeOrder) => o.status === 'open' || o.status === 'partial';

/** Levels aggregated to the grouping step: bids down, asks up, so a row never promises a better price. */
export function groupLevels(levels: BookLevel[], side: BookSide, step: number): BookRow[] {
    if (!step) return levels.map((l) => ({ price: num(l.price), quantity: num(l.quantity), user: num(l.user_quantity), venues: l.venues || [] }));
    const out = new Map<string, BookRow>();
    for (const l of levels) {
        const p = num(l.price);
        const k = side === 'bid' ? Math.floor(p / step + 1e-9) * step : Math.ceil(p / step - 1e-9) * step;
        const key = k.toFixed(8);
        const agg = out.get(key) || { price: Number(key), quantity: 0, user: 0, venues: [] };
        agg.quantity += num(l.quantity);
        agg.user += num(l.user_quantity);
        for (const v of l.venues || []) if (!agg.venues.includes(v)) agg.venues.push(v);
        out.set(key, agg);
    }
    return [...out.values()];
}

/** The running total down a side of the book. */
export function cumulative(rows: BookRow[]): number[] {
    let c = 0;
    return rows.map((r) => (c += r.quantity));
}

/** Whether an open order at `price` on the row's side falls inside the row. */
export function rowCovers(side: BookSide, row: BookRow, price: number, step: number): boolean {
    if (!step) return price === row.price;
    return side === 'bid' ? price >= row.price && price < row.price + step : price <= row.price && price > row.price - step;
}

export interface Walk {
    /** How much would fill against the book. */
    filled: number;
    /** What the fills would cost (or yield), in Toman. */
    cost: number;
    /** The part of the fills that venues' liquidity, rather than users', would supply. */
    fromVenues: number;
}

/**
 * What an order would take from the book on screen: the same walk the engine
 * makes, price by price, up to the limit. An estimate - the book moves, and a
 * published depth stops at its deepest levels.
 */
export function walkBook(levels: BookLevel[], side: Side, limit: number, qty: number): Walk {
    let filled = 0;
    let cost = 0;
    let fromVenues = 0;
    for (const l of levels) {
        const p = num(l.price);
        if (filled >= qty - 1e-12 || (side === 'buy' ? p > limit : p < limit)) break;
        const size = num(l.quantity);
        const take = Math.min(qty - filled, size);
        filled += take;
        cost += take * p;
        fromVenues += take * Math.max(0, size - num(l.user_quantity)) / Math.max(size, 1e-12);
    }
    return { filled, cost, fromVenues };
}
