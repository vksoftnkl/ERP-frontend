/**
 * Till masters (menu 275) — the server's `till-masters.controller`.
 *
 *   GET  /configured-grid-sql/run grids 133–136   the four lists
 *   POST /till/<master>/create                    create, or update by id presence
 *   GET  /till/denominations/list?companyId=      the notes and coins a count offers
 *
 * The lists are untagged on purpose: the server caches a grid run for about a
 * second, so a refetch straight after a save can answer the old rows. The
 * screen re-reads once the cache has turned over.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type { ApiSuccessResponse } from "@/utils/types";

const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";
const DENOMINATION_LIST_ENDPOINT = "/till/denominations/list";
/** The runner caps `limit` at 100. */
const GRID_PAGE_LIMIT = 100;
/** A guard, not a business limit: 2,000 rows of a master is already absurd. */
const GRID_MAX_PAGES = 20;

export type TillMaster = "counters" | "safes" | "reasons" | "denominations";

export type TillGridArgs = {
  grid: ConfiguredGridKey;
  /** The grid's tokens (`icompany_id`, `ibranch_id`), sent as `grid_param`. */
  params: Record<string, string>;
};

/** `/till/denominations/list` — one note or coin, in screen order. */
export type TillDenomination = {
  tdnId: string;
  tdnCompanyId: string | null;
  tdnCurrency: string;
  tdnValue: number;
  tdnKind: "NOTE" | "COIN";
  tdnLabel: string;
  tdnBundleQty: number;
  tdnSortOrder: number;
  tdnValidTo: string | null;
  tdnIsActive: boolean;
  shipped?: boolean;
};

export const tillApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** Every row of one till master grid — every page of it. */
    getTillGridRows: builder.query<Record<string, unknown>[], TillGridArgs>({
      async queryFn({ grid, params }, _api, _extra, baseQuery) {
        const rows: Record<string, unknown>[] = [];
        for (let page = 1; page <= GRID_MAX_PAGES; page += 1) {
          const result = await baseQuery({
            url: CONFIGURED_GRID_RUN_ENDPOINT,
            params: {
              grid_id: getGridId(grid),
              page,
              limit: GRID_PAGE_LIMIT,
              grid_param: JSON.stringify(params),
            },
          });
          if (result.error) {
            return { error: result.error };
          }
          const data = (result.data as ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>)?.data;
          const items = Array.isArray(data?.items) ? data.items : [];
          rows.push(...items);
          const total = Number(data?.meta?.total ?? rows.length);
          if (items.length < GRID_PAGE_LIMIT || rows.length >= total) {
            break;
          }
        }
        return { data: rows };
      },
      keepUnusedDataFor: 0,
    }),

    /** `/till/<master>/create` — no id in the body creates, an id updates. */
    saveTillMaster: builder.mutation<Record<string, unknown>, { master: TillMaster; body: Record<string, unknown> }>({
      query: ({ master, body }) => ({ url: `/till/${master}/create`, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload?.data ?? {},
    }),

    /** What Open Session / End Shift will offer — the server's own list. */
    getTillDenominations: builder.query<TillDenomination[], string>({
      query: (companyId) => ({ url: DENOMINATION_LIST_ENDPOINT, params: { companyId } }),
      transformResponse: (payload: ApiSuccessResponse<TillDenomination[] | { items?: TillDenomination[] }>) => {
        const data = payload?.data;
        if (Array.isArray(data)) return data;
        return Array.isArray(data?.items) ? data.items : [];
      },
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useGetTillGridRowsQuery, useSaveTillMasterMutation, useGetTillDenominationsQuery } = tillApi;
