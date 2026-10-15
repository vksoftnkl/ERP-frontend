import {
  normalizeGridColumnsPayload,
  type GridColumnConfig,
} from "@/store/slices/gridColumnsSlice";
import {
  normalizeUiTableDirectoryPayload,
  primeUiTableDirectory,
  type UiTableDirectoryRow,
} from "@/lib/ui-tables/ui-table-registry";
import {
  getGridId,
  normalizeGridDirectoryPayload,
  primeGridDirectory,
  type GridDirectoryRow,
} from "@/lib/configured-grids/grid-registry";
import {
  normalizeDropdownDirectoryPayload,
  primeDropdownDirectory,
  type DropdownDirectoryRow,
} from "@/lib/configured-dropdowns/dropdown-registry";
import { baseApi } from "@/store/api/baseApi";
import { runAllPages } from "@/store/api/run-all-pages";
export type GridColumnsQueryArg = {
  gridId: number;
};
/**
 * The two bootstrap grid ids — the only two `grid_id`s the app still spells out,
 * because every other one is looked up THROUGH them.
 *
 * `GRID_MASTER_LIST_GRID_ID` is Grid Master's own list ("GRID MASTER LIST"): id,
 * name, device type, sort and status for every Desktop grid. `UI_TABLE_MASTER_GRID_ID`
 * is the same thing for UI Table Master ("MAIN LIST - UI TABLES"). Both are
 * Desktop rows whose SQL already filters to Desktop, and both answer in one small
 * response where the module endpoints would drag every column definition along.
 */
export const GRID_MASTER_LIST_GRID_ID = 34;
export const UI_TABLE_MASTER_GRID_ID = 38;
export const metadataApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getGridColumns: builder.query<GridColumnConfig[], GridColumnsQueryArg>({
      query: ({ gridId }) => ({
        url: "/configured-grid-sql/columns",
        params: {
          grid_id: gridId,
        },
      }),
      transformResponse: (payload: unknown) => normalizeGridColumnsPayload(payload),
      providesTags: (_result, _error, arg) => [{ type: "GridColumns", id: arg.gridId }],
      keepUnusedDataFor: 300,
    }),
    /**
     * UI Table Master, as a name → id directory. Every grid in the app resolves
     * the table its layout lives in through this (see `lib/ui-tables`), so the
     * ids are never hardcoded per screen.
     */
    getUiTableDirectory: builder.query<UiTableDirectoryRow[], void>({
      queryFn: async (_arg, _api, _extra, baseQuery) => {
        const result = await runAllPages(UI_TABLE_MASTER_GRID_ID, baseQuery);
        if (result.error !== undefined) return { error: result.error };
        const rows = normalizeUiTableDirectoryPayload(result.data);
        // Screens read ids through React; the builders that assemble a grid's
        // save payload cannot. Priming the registry here is what lets those read
        // the same answer synchronously.
        primeUiTableDirectory(rows);
        return { data: rows };
      },
      providesTags: ["UiTableDirectory"],
      // Tables are created and renamed in the master screen, not during entry,
      // so this is as static as configuration gets.
      keepUnusedDataFor: 600,
    }),
    /**
     * Grid Master, as a name → id directory. Every configured list in the app
     * resolves its grid through this (see `lib/configured-grids`).
     */
    getGridDirectory: builder.query<GridDirectoryRow[], void>({
      queryFn: async (_arg, _api, _extra, baseQuery) => {
        const result = await runAllPages(GRID_MASTER_LIST_GRID_ID, baseQuery);
        if (result.error !== undefined) return { error: result.error };
        const rows = normalizeGridDirectoryPayload(result.data);
        primeGridDirectory(rows);
        return { data: rows };
      },
      providesTags: ["GridDirectory"],
      keepUnusedDataFor: 600,
    }),
    /**
     * Dropdown Master, as a name → id directory, for the same reason as the two
     * above (see `lib/configured-dropdowns`). Its own list is a configured grid,
     * so this is the one directory that needs no id of its own — the grid
     * registry has already resolved "MAIN LIST - DROPDOWN".
     */
    getDropdownDirectory: builder.query<DropdownDirectoryRow[], void>({
      queryFn: async (_arg, _api, _extra, baseQuery) => {
        const result = await runAllPages(getGridId("dropdownMasterList"), baseQuery);
        if (result.error !== undefined) return { error: result.error };
        const rows = normalizeDropdownDirectoryPayload(result.data);
        primeDropdownDirectory(rows);
        return { data: rows };
      },
      providesTags: ["DropdownDirectory"],
      keepUnusedDataFor: 600,
    }),
  }),
});
export const {
  useGetDropdownDirectoryQuery,
  useGetGridColumnsQuery,
  useGetGridDirectoryQuery,
  useGetUiTableDirectoryQuery,
} = metadataApi;
