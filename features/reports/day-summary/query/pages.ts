/**
 * The voucher pages of ONE list, as far as they have been loaded (plan §8.1).
 *
 * `key` is the list's `vouchersKey`: a page is only ever added to the state
 * of the key it was asked under. An unloaded page is a hole of placeholders,
 * and a jump to the end asks for the last page directly. The footer's totals
 * are the response's own, for the whole filtered set: nothing here adds.
 */
import type { VoucherPage, VoucherRow } from "../wire/types";

export const PAGE_SIZE = 200;

export type PagesState = {
  key: string;
  pageSize: number;
  totalRows: number;
  totals: VoucherPage["totals"];
  pages: ReadonlyMap<number, VoucherPage>;
};

export function firstPages(key: string, page: VoucherPage): PagesState {
  return withPage(
    { key, pageSize: page.page.pageSize || PAGE_SIZE, totalRows: 0, totals: page.totals, pages: new Map() },
    page,
  );
}

export function withPage(state: PagesState, page: VoucherPage): PagesState {
  const pages = new Map(state.pages);
  pages.set(page.page.page, page);
  return {
    ...state,
    pageSize: page.page.pageSize || state.pageSize,
    totalRows: page.page.totalRows,
    totals: page.totals,
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
  return state.pages.get(pageOf(state, index))?.rows[index % state.pageSize];
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

/** Index of the first loaded row matching `test`, or -1. */
export function findLoaded(state: PagesState, test: (row: VoucherRow) => boolean): number {
  for (const [pageNo, page] of [...state.pages.entries()].sort(([a], [b]) => a - b)) {
    const at = page.rows.findIndex(test);
    if (at >= 0) return (pageNo - 1) * state.pageSize + at;
  }
  return -1;
}

/** Do the loaded pages carry legs? (They were asked `withLegs=true`.) */
export function hasLegs(state: PagesState): boolean {
  for (const page of state.pages.values()) if (page.rows.some((row) => row.legs !== null)) return true;
  return false;
}
