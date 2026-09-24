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
 * Drop the keys with nothing to bind — except the ones the caller says the SQL
 * GUARDS.
 *
 * The substitution into `dropdown_sql` is textual, and the two shapes in use
 * disagree about what an empty value means:
 *
 *   · **Unguarded** — `emp_branch_id = iemp_branch_id::uuid` (dropdown 38).
 *     An empty string lands as `''::uuid` and fails the run, so the key is
 *     better left out: the failure then names the placeholder rather than the
 *     cast.
 *   · **Guarded** — `NULLIF('iarea_id','') IS NULL OR cus_area_id =
 *     NULLIF('iarea_id','')::uuid` (dropdown 54, CUSTOMERS BY AREA). An empty
 *     string is exactly how that SQL spells "no filter" — and LEAVING IT OUT is
 *     the thing that breaks it, because the literal word `iarea_id` stays in
 *     the statement and the whole run answers 400.
 *
 * Nothing about a dropdown id says which shape it has, so the caller names the
 * guarded placeholders in `keepEmptyParams`. Verified live on dropdown 54:
 * `{"iarea_id":""}` returns every customer; omitting it answers
 * *Invalid dropdown SQL configuration*.
 */
function usableParams(
  params: DropdownParams | undefined,
  keepEmptyParams?: readonly string[],
): Record<string, string | number | boolean> {
  const keepEmpty = new Set(keepEmptyParams ?? []);
  const usable: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined) {
      // Even a guarded placeholder needs SOMETHING to send; an absent value
      // becomes the empty string the guard reads as "no bound".
      if (keepEmpty.has(key)) {
        usable[key] = "";
      }
      continue;
    }
    if (typeof value === "string" && !value.trim()) {
      if (keepEmpty.has(key)) {
        usable[key] = "";
      }
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
export function dropdownParamsKey(
  params: DropdownParams | undefined,
  keepEmptyParams?: readonly string[],
): string {
  const usable = usableParams(params, keepEmptyParams);
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
  /** Placeholders the SQL guards, which must travel even when blank. */
  keepEmptyParams?: readonly string[];
};

export function buildDropdownRunQuery({
  dropdownId,
  search,
  page = 1,
  limit = DROPDOWN_PAGE_SIZE,
  params,
  keepEmptyParams,
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
  const paramsKey = dropdownParamsKey(params, keepEmptyParams);
  if (paramsKey) {
    query.dropdown_param = paramsKey;
  }
  return query;
}
