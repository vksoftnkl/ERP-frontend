/**
 * Query builders for the two configured-dropdown endpoints. Pure — the RTK Query
 * endpoints that use them live in `store/api/dropdownApi.ts`.
 */
import type { DropdownParams } from "./types";

/**
 * The configuration. A *list* endpoint filtered by id, so the response is
 * `{ data: [detail] }` even for one dropdown; `extractDropdownDetail` unwraps it.
 */
export const DROPDOWN_CONFIG_ENDPOINT = "/dropdown-details/get";

/** The rows. Searched, paged and filtered server-side. */
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";

/**
 * Rows per request.
 *
 * Deliberately NOT `maxVisibleItems`: that is a popup height, and using it as the
 * request limit — which the Qt widget does — makes a dropdown configured to show
 * 10 rows unable to reach its 11th match no matter what the operator types. The
 * popup pages instead (`page + 1` on scroll-end). The server caps `limit` at 100.
 */
export const DROPDOWN_PAGE_SIZE = 25;

/** Applied to the search text only; opening the popup fires immediately. */
export const DROPDOWN_SEARCH_DEBOUNCE_MS = 250;

export function buildDropdownConfigQuery(dropdownId: string): Record<string, string> {
  return { dropdownId: String(dropdownId).trim() };
}

/**
 * Drop the keys with nothing to bind.
 *
 * The substitution into `dropdown_sql` is textual, so an empty string is not
 * "unfiltered" — it lands in the statement as `''::uuid` and fails the run. A
 * parameter that has no value yet is better left out, so the failure names the
 * placeholder instead of the cast.
 */
function usableParams(params: DropdownParams | undefined): Record<string, string | number | boolean> {
  const usable: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string" && !value.trim()) {
      continue;
    }
    usable[key] = value;
  }
  return usable;
}

/**
 * A stable key for a params object, for cache keys and change detection.
 * Sorted, so `{a,b}` and `{b,a}` are the same request.
 */
export function dropdownParamsKey(params: DropdownParams | undefined): string {
  const usable = usableParams(params);
  const keys = Object.keys(usable).sort();
  if (keys.length === 0) {
    return "";
  }
  return JSON.stringify(Object.fromEntries(keys.map((key) => [key, usable[key]])));
}

export type DropdownRunQueryArgs = {
  dropdownId: string;
  search?: string;
  page?: number;
  limit?: number;
  params?: DropdownParams;
};

export function buildDropdownRunQuery({
  dropdownId,
  search,
  page = 1,
  limit = DROPDOWN_PAGE_SIZE,
  params,
}: DropdownRunQueryArgs): Record<string, string | number> {
  const query: Record<string, string | number> = {
    dropdown_id: String(dropdownId).trim(),
    page,
    limit,
  };
  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    query.search = trimmedSearch;
  }
  const paramsKey = dropdownParamsKey(params);
  if (paramsKey) {
    query.dropdown_param = paramsKey;
  }
  return query;
}
