/**
 * The till master screens (menus 275 / 280 / 281 / 282) — the server's
 * `till-masters.controller`.
 *
 *   GET  /configured-grid-sql/run   the four lists (CrudMasterPage reads them itself)
 *   POST /till/<master>/create      create, or update by id presence
 *
 * The popup is filled from the grid row, as the Qt screens do, so `/get` is not
 * called. Endpoint names carry the `tillMasters` prefix: the other till screens
 * inject their own endpoints from their own files.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";

const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

export type TillMasterRoute = "counters" | "safes" | "reasons" | "denominations";

export type TillMastersGridTotalArgs = {
  grid: ConfiguredGridKey;
  /** The grid's tokens, as the list sends them (`grid_param`). */
  params: Record<string, string>;
};

type GridRunPage = {
  items?: unknown[];
  meta?: { total?: number | string | null };
};

export const tillApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** `/till/<master>/create` — no id in the body creates, an id updates. */
    tillMastersSave: builder.mutation<Record<string, unknown>, { master: TillMasterRoute; body: Record<string, unknown> }>({
      query: ({ master, body }) => ({ url: `/till/${master}/create`, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload?.data ?? {},
    }),

    /**
     * How many rows a list holds under the given tokens — a new counter's sort
     * order and a branch's first safe follow it. A GET as a mutation: fired on
     * Add, uncached, never deduped onto an earlier pending read.
     */
    tillMastersGridTotal: builder.mutation<number, TillMastersGridTotalArgs>({
      query: ({ grid, params }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        method: "GET",
        params: {
          grid_id: getGridId(grid),
          page: 1,
          limit: 1,
          grid_param: JSON.stringify(params),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<GridRunPage>) => {
        const page = payload?.data;
        const total = Number(page?.meta?.total);
        if (Number.isFinite(total) && total >= 0) return total;
        return Array.isArray(page?.items) ? page.items.length : 0;
      },
    }),
  }),
});

export const { useTillMastersSaveMutation, useTillMastersGridTotalMutation } = tillApi;
