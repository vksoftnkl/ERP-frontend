/**
 * Every page of a configured grid, read as one answer — for the directories
 * (Grid Master, Dropdown Master, UI Table Master) the registries resolve names
 * through. Pure apart from the `baseQuery` it is handed, so it is tested alone.
 */
import type { FetchArgs } from "@reduxjs/toolkit/query";

/**
 * The runner caps `limit` at 100 per page, and Grid Master is already past it
 * (109 Desktop grids in dev, 2026-10-15). A one-page directory silently lost
 * every grid after the 100th — the till, expense and settlement grids — which
 * then fell back to their DEV ids, naming the wrong grid (or none) on any other
 * database. So every directory reads page after page until the list is whole.
 */
const DIRECTORY_PAGE_SIZE = 100;
/** A guard, not a limit anyone should reach: 2,000 masters of one kind. */
const DIRECTORY_MAX_PAGES = 20;

function pageItems(payload: unknown): { items: unknown[]; total: number | null } {
  if (Array.isArray(payload)) return { items: payload, total: null };
  const data = (payload as { data?: { items?: unknown; meta?: { total?: unknown } } | unknown[] } | null)?.data;
  if (Array.isArray(data)) return { items: data, total: null };
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = Number(data?.meta?.total);
  return { items, total: Number.isFinite(total) ? total : null };
}

/**
 * Every row of one configured grid, every page of it, as one array the
 * directory normalizers read like a single answer. A page after the first that
 * fails keeps what was read: a partial directory still resolves those names,
 * and the registries keep their fallbacks for the rest.
 */
export async function runAllPages<E>(
  gridId: number | string,
  baseQuery: (arg: FetchArgs) => PromiseLike<{ data?: unknown; error?: E }> | { data?: unknown; error?: E },
): Promise<{ data: unknown[]; error?: undefined } | { error: E; data?: undefined }> {
  const rows: unknown[] = [];
  for (let page = 1; page <= DIRECTORY_MAX_PAGES; page += 1) {
    const result = await baseQuery({
      url: "/configured-grid-sql/run",
      params: { grid_id: gridId, page, limit: DIRECTORY_PAGE_SIZE },
    });
    if (result.error !== undefined) {
      if (page === 1) return { error: result.error };
      console.warn(`Directory grid ${gridId}: page ${page} could not be read; keeping ${rows.length} rows.`);
      break;
    }
    const { items, total } = pageItems(result.data);
    rows.push(...items);
    if (items.length < DIRECTORY_PAGE_SIZE || (total !== null && rows.length >= total)) break;
  }
  return { data: rows };
}
