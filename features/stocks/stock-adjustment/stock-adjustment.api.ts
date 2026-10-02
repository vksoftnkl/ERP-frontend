/**
 * Stock Adjustment — server endpoints, injected into the shared `baseApi`
 * (paths WITHOUT `/api/v1`, which the base URL carries).
 *
 * Every name is prefixed `stockAdjustment…` / `stockReason…`: injected
 * endpoints share one namespace, and a generic `getItemByBarcode` here would
 * silently replace another feature's under `overrideExisting`.
 *
 * Nothing that reads the balance is cached: pick-stock is "live, never cached"
 * on the server, and a holding read a minute ago is not what is on the shelf.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  CONFIGURED_GRID_RUN_ENDPOINT,
  ITEM_BY_BARCODE_ENDPOINT,
  ITEM_PICKER_GRID_KEY,
  LEDGER_ROLES_ENDPOINT,
  STOCK_ADJUSTMENT_CANCEL_ENDPOINT,
  STOCK_ADJUSTMENT_ENDPOINT,
  STOCK_ADJUSTMENT_PICK_STOCK_ENDPOINT,
  STOCK_ADJUSTMENT_POST_ENDPOINT,
  STOCK_ADJUSTMENT_VALIDATE_ENDPOINT,
  STOCK_ITEM_LOOKUP_ENDPOINT,
  STOCK_REASONS_ENDPOINT,
  type SaveKind,
} from "./stock-adjustment.constants";
import type {
  BarcodeItemLookup,
  CancelStockAdjustmentArgs,
  ConfiguredGridPage,
  ItemPickerRow,
  LedgerRoleRow,
  PickStockQuery,
  PickStockRow,
  SaveStockAdjustmentDto,
  StockAdjustmentDocKey,
  StockAdjustmentPayload,
  StockAdjustmentSaveResult,
  StockItemLookup,
  StockItemLookupQuery,
  StockReasonRow,
  StockVoucherLineProblem,
} from "./stock-adjustment.types";

/** The four fields a stored document is addressed by, as the routes spell them. */
function refParams(key: StockAdjustmentDocKey) {
  return {
    svhId: key.svhId,
    accYear: key.accYear,
    companyId: key.companyId,
    branchId: key.branchId,
  };
}

export const stockAdjustmentApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    // -- the document ------------------------------------------------------
    /** POST — create or update a DRAFT; header.status POSTED saves AND posts in one transaction. */
    saveStockAdjustment: builder.mutation<StockAdjustmentSaveResult, SaveStockAdjustmentDto>({
      query: (body) => ({ url: STOCK_ADJUSTMENT_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<StockAdjustmentSaveResult>) => payload.data,
    }),
    /** GET — one document with item, lot, reason and godown names, plus the `kind` the Type selector shows. */
    getStockAdjustment: builder.query<StockAdjustmentPayload, StockAdjustmentDocKey>({
      query: (key) => ({ url: STOCK_ADJUSTMENT_ENDPOINT, params: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<StockAdjustmentPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),
    /** GET validate — one row per line; problem null means clean. */
    validateStockAdjustment: builder.query<StockVoucherLineProblem[], StockAdjustmentDocKey>({
      query: (key) => ({ url: STOCK_ADJUSTMENT_VALIDATE_ENDPOINT, params: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<StockVoucherLineProblem[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 0,
    }),
    /**
     * POST post — the engine, the accounts voucher and the trail for a saved
     * DRAFT. The screen posts through the save (Save F5 sends status POSTED, as
     * the Qt screen does, so the posted document is exactly what is on screen);
     * this is the route for a draft posted as it stands.
     */
    postStockAdjustment: builder.mutation<StockAdjustmentSaveResult, StockAdjustmentDocKey>({
      query: (key) => ({ url: STOCK_ADJUSTMENT_POST_ENDPOINT, method: "POST", body: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<StockAdjustmentSaveResult>) => payload.data,
    }),
    /** POST cancel — a DRAFT moves to CANCELLED; a POSTED one is mirrored and its Stock Journal reversed. */
    cancelStockAdjustment: builder.mutation<unknown, CancelStockAdjustmentArgs>({
      query: (body) => ({ url: STOCK_ADJUSTMENT_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload.data,
    }),
    /** DELETE — soft delete a DRAFT. Load and delete share the one URL. */
    deleteStockAdjustment: builder.mutation<unknown, StockAdjustmentDocKey>({
      query: (key) => ({ url: STOCK_ADJUSTMENT_ENDPOINT, method: "DELETE", params: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload.data,
    }),

    // -- the pickers ---------------------------------------------------------
    /** The holdings an outward line is picked from, available > 0. No bucket = every bucket. */
    stockAdjustmentPickStock: builder.query<PickStockRow[], PickStockQuery>({
      query: ({ companyId, branchId, godownId, bucket, itemId, search, limit }) => ({
        url: STOCK_ADJUSTMENT_PICK_STOCK_ENDPOINT,
        params: {
          companyId,
          branchId,
          godownId,
          ...(bucket ? { bucket } : {}),
          ...(itemId ? { itemId } : {}),
          ...(search?.trim() ? { search: search.trim() } : {}),
          limit: limit ?? 200,
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<PickStockRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 0,
    }),
    /**
     * The reason picker for one save kind: shared and company rows merged,
     * filtered to the txn types the kind posts. BUCKET_MOVE lists move reasons
     * only.
     */
    stockReasonsForKind: builder.query<StockReasonRow[], { companyId: string; voucherType: SaveKind }>({
      query: (params) => ({ url: STOCK_REASONS_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<StockReasonRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 60,
    }),
    /** The stock module's item lookup: unit, base unit, factor, tracking signature on the document date. */
    stockAdjustmentItemLookup: builder.query<StockItemLookup, StockItemLookupQuery>({
      query: ({ companyId, branchId, itemId, uomId, onDate }) => ({
        url: STOCK_ITEM_LOOKUP_ENDPOINT,
        params: {
          companyId,
          branchId,
          itemId,
          ...(uomId ? { uomId } : {}),
          onDate,
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<StockItemLookup>) => payload.data,
      keepUnusedDataFor: 0,
    }),
    /** A scanned code resolved to its item and unit, scoped to this company. */
    stockAdjustmentItemByBarcode: builder.query<BarcodeItemLookup, { barcode: string; companyId: string }>({
      query: ({ barcode, companyId }) => ({
        url: ITEM_BY_BARCODE_ENDPOINT,
        params: { barcode, ...(companyId ? { company_id: companyId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<BarcodeItemLookup>) => payload.data,
      keepUnusedDataFor: 0,
    }),
    /**
     * Grid 71 "POPUP - ITEMS" — one row per item × unit, scoped to the
     * document's company and branch (`iitem_company_id` / `iitem_branch_id`,
     * both NULLIF-guarded in its SQL, as the Qt popup binds them).
     */
    stockAdjustmentItemSearch: builder.query<
      ConfiguredGridPage<ItemPickerRow>,
      { search?: string; page?: number; limit?: number; companyId: string; branchId: string }
    >({
      query: ({ search, page = 1, limit = 20, companyId, branchId }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId(ITEM_PICKER_GRID_KEY),
          page,
          limit,
          ...(search?.trim() ? { search: search.trim() } : {}),
          grid_param: JSON.stringify({
            iitem_company_id: companyId,
            iitem_branch_id: branchId,
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<ItemPickerRow>>) => payload.data,
      keepUnusedDataFor: 60,
    }),
    /** The ledger behind each posting role — the accounts card's names. */
    stockAdjustmentLedgerRoles: builder.query<LedgerRoleRow[], void>({
      query: () => ({ url: LEDGER_ROLES_ENDPOINT }),
      transformResponse: (payload: ApiSuccessResponse<LedgerRoleRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 300,
    }),
  }),
});

export const {
  useSaveStockAdjustmentMutation,
  useLazyGetStockAdjustmentQuery,
  useLazyValidateStockAdjustmentQuery,
  usePostStockAdjustmentMutation,
  useCancelStockAdjustmentMutation,
  useDeleteStockAdjustmentMutation,
  useLazyStockAdjustmentPickStockQuery,
  useStockAdjustmentPickStockQuery,
  useStockReasonsForKindQuery,
  useLazyStockAdjustmentItemLookupQuery,
  useLazyStockAdjustmentItemByBarcodeQuery,
  useStockAdjustmentItemSearchQuery,
  useStockAdjustmentLedgerRolesQuery,
} = stockAdjustmentApi;
