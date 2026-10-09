/**
 * The pages of one server-sorted list, as far as they have been loaded
 * (plan §8.2). Used by the party grid and the Bill-wise tab.
 *
 * The SERVER sorts and pages. Nothing here sorts, filters or sums: an unloaded
 * page is a hole of placeholders, the totals come with the response (`meta`),
 * and a page is only ever added to the state of the key it was asked under.
 */
import type { PageInfo } from "../wire/types";

export type PagedState<Row, Meta> = {
  /** The list's identity: report filters + sort (`partiesKey` / `billWiseKey`). */
  key: string;
  pageSize: number;
  /** From the latest page to arrive; sizes the scrollbar from the start. */
  totalRows: number;
  /** What every page carries about the WHOLE list: head, tiles, totals. */
  meta: Meta;
  pages: ReadonlyMap<number, readonly Row[]>;
};

export function firstPaged<Row, Meta>(key: string, rows: readonly Row[], page: PageInfo, meta: Meta): PagedState<Row, Meta> {
  return withPage({ key, pageSize: page.pageSize || 1, totalRows: page.totalRows, meta, pages: new Map() }, rows, page);
}

export function withPage<Row, Meta>(
  state: PagedState<Row, Meta>,
  rows: readonly Row[],
  page: PageInfo,
): PagedState<Row, Meta> {
  const pages = new Map(state.pages);
  pages.set(page.page, rows);
  return { ...state, pageSize: page.pageSize || state.pageSize, totalRows: page.totalRows, pages };
}

export function pageCount(state: PagedState<unknown, unknown>): number {
  return Math.max(1, Math.ceil(state.totalRows / state.pageSize));
}

/** 1-based page that holds row `index` (0-based). */
export function pageOf(state: PagedState<unknown, unknown>, index: number): number {
  return Math.floor(index / state.pageSize) + 1;
}

export function rowAt<Row>(state: PagedState<Row, unknown>, index: number): Row | undefined {
  return state.pages.get(pageOf(state, index))?.[index % state.pageSize];
}

/** The pages still missing to show rows `first..last` (inclusive, clamped). */
export function pagesNeeded(state: PagedState<unknown, unknown>, first: number, last: number): number[] {
  if (state.totalRows === 0) return [];
  const lo = pageOf(state, Math.max(0, first));
  const hi = pageOf(state, Math.min(state.totalRows - 1, Math.max(0, last)));
  const needed: number[] = [];
  for (let p = lo; p <= hi; p += 1) if (!state.pages.has(p)) needed.push(p);
  return needed;
}

/** Index of the first loaded row matching `test`, or -1. Loaded rows only, by nature. */
export function findLoaded<Row>(state: PagedState<Row, unknown>, test: (row: Row) => boolean): number {
  for (const [pageNo, rows] of state.pages) {
    const at = rows.findIndex(test);
    if (at >= 0) return (pageNo - 1) * state.pageSize + at;
  }
  return -1;
}
