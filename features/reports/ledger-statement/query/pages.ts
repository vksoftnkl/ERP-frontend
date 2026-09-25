/**
 * The voucher pages of ONE report, as far as they have been loaded (plan §8.2).
 *
 * Each page is self-sufficient: it carries its own `broughtForward`, and every
 * row its own `balance`. So nothing here ever derives a balance. An unloaded
 * page is a hole of placeholders, and a jump to the end loads the last page
 * directly. There is no "fill the gap" sum anywhere.
 *
 * `key` is the report's `reportKey`. A page is only ever added to the state of
 * the key it was requested under.
 */
import type { VoucherPage, VoucherRow } from "../wire/types";

export const PAGE_SIZE = 200;

export type PagesState = {
  key: string;
  pageSize: number;
  /** From the first page that arrived; sizes the scrollbar from the start. */
  totalRows: number;
  pages: ReadonlyMap<number, VoucherPage>;
};

export function emptyPages(key: string, pageSize = PAGE_SIZE): PagesState {
  return { key, pageSize, totalRows: 0, pages: new Map() };
}

/** A fresh state from the first page to arrive for `key`. */
export function firstPages(key: string, page: VoucherPage): PagesState {
  return withPage(emptyPages(key, page.page.pageSize || PAGE_SIZE), page);
}

export function withPage(state: PagesState, page: VoucherPage): PagesState {
  const pages = new Map(state.pages);
  pages.set(page.page.page, page);
  return {
    ...state,
    pageSize: page.page.pageSize || state.pageSize,
    totalRows: page.page.totalRows,
    pages,
  };
}

export function pageCount(state: PagesState): number {
  return Math.max(1, Math.ceil(state.totalRows / state.pageSize));
}

/** 1-based page that holds row `index` (0-based). */
export function pageOf(state: PagesState, index: number): number {
  return Math.floor(index / state.pageSize) + 1;
}

export function rowAt(state: PagesState, index: number): VoucherRow | undefined {
  const page = state.pages.get(pageOf(state, index));
  return page?.rows[index % state.pageSize];
}

/** The pages still missing to show rows `first..last` (inclusive, clamped). */
export function pagesNeeded(state: PagesState, first: number, last: number): number[] {
  if (state.totalRows === 0) return [];
  const lo = pageOf(state, Math.max(0, first));
  const hi = pageOf(state, Math.min(state.totalRows - 1, Math.max(0, last)));
  const needed: number[] = [];
  for (let p = lo; p <= hi; p += 1) if (!state.pages.has(p)) needed.push(p);
  return needed;
}

export function loadedRowCount(state: PagesState): number {
  let count = 0;
  for (const page of state.pages.values()) count += page.rows.length;
  return count;
}

/** The last page is in hand: the Total and Closing rows may now be drawn. */
export function isLastPageLoaded(state: PagesState): boolean {
  return state.totalRows === 0 || state.pages.has(pageCount(state));
}

/** The server's last balance of the report, when the last page is loaded. */
export function lastRow(state: PagesState): VoucherRow | undefined {
  if (state.totalRows === 0) return undefined;
  return rowAt(state, state.totalRows - 1);
}

/** Every loaded row, in order. For the pair-hover lookup, which is loaded-only by nature. */
export function loadedRows(state: PagesState): VoucherRow[] {
  return [...state.pages.entries()].sort(([a], [b]) => a - b).flatMap(([, page]) => page.rows);
}
