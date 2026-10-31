/**
 * A list route answers ≤ 200 rows a page: walk the pages, keep the FIRST
 * page's summary (it is over the whole filtered set, never the page) — Qt
 * `LoyaltyStatusEntry::fetchAll`.
 *
 * Stops when a page comes back short, when every row is in, or at the 20,000
 * cap the export shares. `stillWanted` is asked after every page, so a load
 * that has been superseded stops walking (its answer is dropped by the caller
 * all the same).
 */
import { LOYALTY_MAX_ROWS, LOYALTY_PAGE_LIMIT } from "../wire/types";

export type PageAnswer<T, S> = { items: T[]; total: number; summary: S };
export type AllPages<T, S> = { items: T[]; total: number; summary: S | null };

export async function fetchAllPages<T, S>(
  fetchPage: (page: number, limit: number) => Promise<PageAnswer<T, S>>,
  options: { limit?: number; maxRows?: number; stillWanted?: () => boolean } = {},
): Promise<AllPages<T, S>> {
  const limit = options.limit ?? LOYALTY_PAGE_LIMIT;
  const maxRows = options.maxRows ?? LOYALTY_MAX_ROWS;
  let items: T[] = [];
  let summary: S | null = null;
  let total = 0;
  for (let page = 1; ; page += 1) {
    const answer = await fetchPage(page, limit);
    const got = Array.isArray(answer?.items) ? answer.items : [];
    items = items.concat(got);
    if (page === 1) summary = answer?.summary ?? null;
    total = typeof answer?.total === "number" ? answer.total : items.length;
    if (options.stillWanted && !options.stillWanted()) break;
    if (got.length === limit && items.length < total && items.length < maxRows) continue;
    break;
  }
  return { items, total, summary };
}
