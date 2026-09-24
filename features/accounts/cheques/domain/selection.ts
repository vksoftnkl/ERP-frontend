/**
 * What an action acts on.
 *
 * ONE notion of the target set:
 *
 *     the ticked rows if any are ticked, otherwise the current row.
 *
 * The ticks are keyed by `apdId`, not by row index, and they survive paging —
 * a deposit slip can span two pages. That is an improvement on the Qt screen,
 * where ticks lived on the page. What keeps it safe:
 *
 *  - the ticks are CLEARED whenever the filters change (the screen compares
 *    `filterSignature`), so a row a filter has hidden is never acted on unseen;
 *  - the ticked ROW is kept, not just its id, so the action dialog can name
 *    every target even when it is on another page.
 */
import type { ChequeRow } from "./types";

/** Insertion-ordered: the dialog lists rows in the order they were ticked. */
export type TickSet = ReadonlyMap<string, ChequeRow>;

export const EMPTY_TICKS: TickSet = new Map();

export function toggleTick(ticks: TickSet, row: ChequeRow): TickSet {
  const next = new Map(ticks);
  if (next.has(row.apdId)) {
    next.delete(row.apdId);
  } else {
    next.set(row.apdId, row);
  }
  return next;
}

/** Tick every row of the page, or untick them all if every one already is. */
export function togglePage(ticks: TickSet, page: readonly ChequeRow[]): TickSet {
  const next = new Map(ticks);
  const allTicked = page.length > 0 && page.every((row) => next.has(row.apdId));
  for (const row of page) {
    if (allTicked) {
      next.delete(row.apdId);
    } else {
      next.set(row.apdId, row);
    }
  }
  return next;
}

/**
 * Refresh the ticked rows from a freshly read page, so a tick never carries a
 * status the register no longer shows. Rows on other pages are kept as they
 * were read.
 */
export function refreshTicks(ticks: TickSet, page: readonly ChequeRow[]): TickSet {
  if (ticks.size === 0) {
    return ticks;
  }
  let changed = false;
  const next = new Map(ticks);
  for (const row of page) {
    const held = next.get(row.apdId);
    if (held && held !== row) {
      next.set(row.apdId, row);
      changed = true;
    }
  }
  return changed ? next : ticks;
}

export function targetRows(ticks: TickSet, current: ChequeRow | null): ChequeRow[] {
  if (ticks.size > 0) {
    return Array.from(ticks.values());
  }
  return current ? [current] : [];
}
