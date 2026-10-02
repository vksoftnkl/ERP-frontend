/**
 * Opening Stock — the server endpoints this screen calls, injected into the
 * shared `baseApi` (paths are relative to API_BASE, which already ends in
 * `/api/v1`).
 *
 * The `stock/opening` routes take camelCase; the configured-grid runner and the
 * barcode lookup take snake_case. Each endpoint spells what its own route
 * accepts — the save DTO runs under `forbidNonWhitelisted`, so an extra key is
 * a 400, not a no-op.
 *
 * No cache on the document or the lookup: these are live balances and live
 * statuses, and a stale "this item has no opening yet" is worse than none.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  CONFIGURED_GRID_RUN_ENDPOINT,
  ITEM_BY_BARCODE_ENDPOINT,
  OPENING_STOCK_CANCEL_ENDPOINT,
  OPENING_STOCK_CREATE_ENDPOINT,
  OPENING_STOCK_GET_ENDPOINT,
  OPENING_STOCK_ITEM_LOOKUP_ENDPOINT,
} from "./opening-stock.constants";
import type {
  BarcodeItem,
  CancelOpeningStockDto,
  ConfiguredGridPage,
  GridRow,
  OpeningStockCancelResult,
  OpeningStockDocKey,
  OpeningStockDocumentPayload,
  OpeningStockItemLookup,
  OpeningStockItemLookupQuery,
  OpeningStockSaveResult,
  SaveOpeningStockDto,
} from "./opening-stock.types";

/** A page of a configured popup grid, with the grid's own tokens bound. */
export type PickerGridQuery = {
  gridId: string;
  search?: string;
  page?: number;
  limit?: number;
  /** The SELECT's named tokens; sent as `grid_param` only when given. */
  params?: Record<string, string>;
};

export const openingStockApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** One document, header + lines, in its OWN scope (stock_voucher is partitioned by year). */
    getOpeningStockVoucher: builder.query<OpeningStockDocumentPayload, OpeningStockDocKey>({
      query: ({ svhId, companyId, branchId, accYear }) => ({
        url: OPENING_STOCK_GET_ENDPOINT,
        params: { companyId, branchId, accYear, svhId },
      }),
      transformResponse: (payload: ApiSuccessResponse<OpeningStockDocumentPayload>) => payload.data,
      providesTags: (_result, _error, key) => [{ type: "OpeningStock", id: key.svhId }],
      keepUnusedDataFor: 0,
    }),

    /**
     * Create (no `header.svhId`) or update (with one) — a full replace of the
     * lines. `header.status: 'POSTED'` saves and posts in one transaction.
     */
    saveOpeningStockVoucher: builder.mutation<OpeningStockSaveResult, SaveOpeningStockDto>({
      query: (body) => ({ url: OPENING_STOCK_CREATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<OpeningStockSaveResult>) => payload.data,
      invalidatesTags: ["OpeningStock"],
    }),

    /** Cancels a DRAFT or a POSTED opening — never a delete. `reason` is required. */
    cancelOpeningStockVoucher: builder.mutation<OpeningStockCancelResult, CancelOpeningStockDto>({
      query: (body) => ({ url: OPENING_STOCK_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<OpeningStockCancelResult>) => payload.data,
      invalidatesTags: ["OpeningStock"],
    }),

    /**
     * Fills a line from one item: unit, base unit, factor, tax, the tracking
     * signature in force on `onDate`, and whether the item is already opened.
     * Deliberately NO cost. A 404 is an answer and names its cause.
     */
    getOpeningStockItemLookup: builder.query<OpeningStockItemLookup, OpeningStockItemLookupQuery>({
      query: ({ companyId, branchId, itemId, uomId, onDate }) => ({
        url: OPENING_STOCK_ITEM_LOOKUP_ENDPOINT,
        params: {
          companyId,
          branchId,
          itemId,
          ...(uomId ? { uomId } : {}),
          onDate,
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<OpeningStockItemLookup>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /**
     * A scanned EAN → its item and the unit it was registered against (an
     * iuc_id). Scoped to the DOCUMENT's company: unscoped, a code unique in this
     * shop can resolve to another company's item.
     */
    getOpeningStockItemByBarcode: builder.query<BarcodeItem, { barcode: string; companyId: string }>({
      query: ({ barcode, companyId }) => ({
        url: ITEM_BY_BARCODE_ENDPOINT,
        params: { barcode, ...(companyId ? { company_id: companyId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<BarcodeItem>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** One page of a configured popup grid (items 71, suppliers 100). */
    runOpeningStockPickerGrid: builder.query<ConfiguredGridPage<GridRow>, PickerGridQuery>({
      query: ({ gridId, search, page = 1, limit = 20, params }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: gridId,
          page,
          limit,
          ...(search?.trim() ? { search: search.trim() } : {}),
          ...(params ? { grid_param: JSON.stringify(params) } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<GridRow>>) =>
        payload.data ?? { items: [], meta: { page: 1, limit: 20, total: 0 } },
      keepUnusedDataFor: 30,
    }),
  }),
});

export const {
  useLazyGetOpeningStockVoucherQuery,
  useSaveOpeningStockVoucherMutation,
  useCancelOpeningStockVoucherMutation,
  useLazyGetOpeningStockItemLookupQuery,
  useLazyGetOpeningStockItemByBarcodeQuery,
  useRunOpeningStockPickerGridQuery,
} = openingStockApi;
