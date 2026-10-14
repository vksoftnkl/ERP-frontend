/**
 * The live line's reads (Qt `TillLiveCash`, a449b8c) — on Till Sessions and
 * Business Day, again on every load of their list:
 *
 *   GET /configured-grid-sql/run  MAIN LIST - TILL SESSIONS, once per live status
 *   GET /till/sessions/expected   each live session's expected cash (273 OVERRIDE)
 *
 * QUERY endpoints dispatched as `initiate(arg, { subscribe: false,
 * forceRefetch: true })`, like Business Day's — NOT the GET-as-mutation of
 * `useTillSessionClient`: every fulfilled mutation is announced through the
 * store's `announceMutations` as a data change, so 4 + N background reads per
 * list load would make this tab's `useDataRefresh` subscribers re-read and
 * every other tab drop its whole RTK cache, each time. Nothing here aborts, so
 * the pending-key dedupe only ever shares one honest answer; a superseded one
 * is dropped by generation in `useLiveCash`.
 */
import { useMemo } from "react";
import { getGridId } from "@/lib/configured-grids";
import { baseApi } from "@/store/api/baseApi";
import { useAppDispatch } from "@/store/hooks";
import type { AppDispatch } from "@/store/store";
import type { LiveCashReader } from "../live-cash";
import type { GridRow, TillSessionPayload } from "../wire/types";

const GRID_RUN = "/configured-grid-sql/run";
/** The runner caps `limit` at 100. */
const GRID_PAGE_LIMIT = 100;
/** A guard, not a business limit: a branch does not keep 1,000 drawers out. */
const GRID_MAX_PAGES = 10;

type GridRunArgs = { gridId: string; page: number; params: Record<string, string> };
type Envelope<T> = { data?: T } | null | undefined;

export const tillLiveCashApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    tillLiveGridRun: builder.query<unknown, GridRunArgs>({
      query: ({ gridId, page, params }) => ({
        url: GRID_RUN,
        params: { grid_id: gridId, page, limit: GRID_PAGE_LIMIT, grid_param: JSON.stringify(params) },
      }),
      keepUnusedDataFor: 0,
    }),
    tillLiveExpected: builder.query<unknown, Record<string, string>>({
      query: (params) => ({ url: "/till/sessions/expected", params }),
      keepUnusedDataFor: 0,
    }),
  }),
});

/** A fresh read every time, held by nothing once it has answered. */
const READ = { subscribe: false, forceRefetch: true } as const;

export function createLiveCashReader(dispatch: AppDispatch): LiveCashReader {
  const endpoints = tillLiveCashApi.endpoints;
  return {
    gridRows: async (grid, params) => {
      const gridId = getGridId(grid);
      const rows: GridRow[] = [];
      for (let page = 1; page <= GRID_MAX_PAGES; page += 1) {
        const raw = await dispatch(endpoints.tillLiveGridRun.initiate({ gridId, page, params }, READ)).unwrap();
        const data = (raw as Envelope<{ items?: unknown; meta?: { total?: unknown } }>)?.data;
        const items = Array.isArray(data?.items) ? (data.items as GridRow[]) : [];
        rows.push(...items);
        const total = Number(data?.meta?.total ?? rows.length);
        if (items.length < GRID_PAGE_LIMIT || rows.length >= total) break;
      }
      return rows;
    },
    expected: async ({ companyId, branchId, accYear, tssId }) => {
      const raw = await dispatch(
        endpoints.tillLiveExpected.initiate({ companyId, branchId, accYear, tssId }, READ),
      ).unwrap();
      return (raw as Envelope<TillSessionPayload>)?.data as TillSessionPayload;
    },
  };
}

export function useLiveCashReader(): LiveCashReader {
  const dispatch = useAppDispatch();
  return useMemo(() => createLiveCashReader(dispatch), [dispatch]);
}
