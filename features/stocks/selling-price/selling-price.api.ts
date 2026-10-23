/**
 * Change Selling Price — server endpoints, injected into the shared API.
 *
 * Nothing here is cached for long, on purpose: the screen reads live stock
 * beside live prices and then writes them back, so a stale bucket list is a
 * save aimed at a row that has moved (the server module carries no
 * `@CacheTTL` for the same reason). The grid and bucket reads are fired
 * imperatively with `forceRefetch`, and keep nothing once answered.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  BRANCH_MASTER_GET_ENDPOINT,
  CONFIGURED_GRID_RUN_ENDPOINT,
  ITEM_BY_BARCODE_ENDPOINT,
  ITEM_PICKER_BRANCH_TOKEN,
  ITEM_PICKER_COMPANY_TOKEN,
  ITEM_TRACK_LOOKUP_ENDPOINT,
  PRICE_LEVEL_MASTERS_ENDPOINT,
  SELLING_PRICE_BUCKETS_ENDPOINT,
  SELLING_PRICE_GRID_ENDPOINT,
  SELLING_PRICE_SAVE_ENDPOINT,
  SELLING_PRICE_SCHEDULE_CANCEL_ENDPOINT,
  SELLING_PRICE_SCHEDULE_ENDPOINT,
} from "./selling-price.constants";
import type {
  BarcodeItem,
  BranchNames,
  ItemPickerRow,
  PriceLevelMasterRow,
  SaveSellingPriceBulkPayload,
  SellingPriceGridQuery,
  SellingPricePage,
  SellingPriceRow,
  SellingPriceSaveResult,
  SellingPriceSavedRow,
  SellingPriceScheduleCancelResult,
  SellingPriceScheduleRow,
} from "./selling-price.types";

const EMPTY_PAGE: SellingPricePage = { items: [], meta: { limit: 0, offset: 0, count: 0 } };

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export const sellingPriceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** The grid — one row per item × unit × live bucket, paged. */
    listSellingPriceRows: builder.query<SellingPricePage, SellingPriceGridQuery>({
      query: (params) => ({ url: SELLING_PRICE_GRID_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<SellingPricePage>) => {
        const data = payload?.data;
        if (!data || !Array.isArray(data.items)) {
          return EMPTY_PAGE;
        }
        return data;
      },
      keepUnusedDataFor: 0,
    }),
    /** F12 — every live price row of one item this branch can see, and its unpriced buckets. */
    listSellingPriceBuckets: builder.query<
      SellingPriceRow[],
      { itemId: string; companyId: string; branchId: string }
    >({
      query: ({ itemId, companyId, branchId }) => ({
        url: `${SELLING_PRICE_BUCKETS_ENDPOINT}/${encodeURIComponent(itemId)}`,
        params: { companyId, branchId },
      }),
      transformResponse: (payload: ApiSuccessResponse<SellingPriceRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 0,
    }),
    /** The save — changed rows, one transaction; may answer needsConfirm. */
    saveSellingPriceRows: builder.mutation<SellingPriceSaveResult, SaveSellingPriceBulkPayload>({
      query: (body) => ({ url: SELLING_PRICE_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<SellingPriceSaveResult>) => ({
        saved: Number(payload?.data?.saved) || 0,
        effectiveFrom: text(payload?.data?.effectiveFrom).slice(0, 10),
        rows: Array.isArray(payload?.data?.rows)
          ? payload.data.rows.map(
              (row): SellingPriceSavedRow => ({
                lineNo: Number(row?.lineNo) || 0,
                bucketId: text(row?.bucketId),
                scheduled: row?.scheduled === true,
                effectiveFrom: text(row?.effectiveFrom).slice(0, 10),
                effectiveTo: text(row?.effectiveTo).slice(0, 10),
              }),
            )
          : [],
        masterRowsSaved: Number(payload?.data?.masterRowsSaved) || 0,
        noStock: Array.isArray(payload?.data?.noStock) ? payload.data.noStock : [],
        needsConfirm: payload?.data?.needsConfirm === true,
        problems: Array.isArray(payload?.data?.problems) ? payload.data.problems : [],
        belowCostPolicy: text(payload?.data?.belowCostPolicy),
      }),
    }),
    /**
     * Notes 140 B — the prices saved to start after today that this branch can
     * see (its own and the chain's). `itemId` narrows to one item. Never cached:
     * a list opened after a save or a cancel must show it.
     */
    listPriceSchedule: builder.query<
      SellingPriceScheduleRow[],
      { companyId: string; branchId: string; itemId?: string }
    >({
      query: ({ companyId, branchId, itemId }) => ({
        url: SELLING_PRICE_SCHEDULE_ENDPOINT,
        params: { companyId, branchId, ...(itemId ? { itemId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<SellingPriceScheduleRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 0,
    }),
    /**
     * Notes 140 B — take a scheduled price off before it starts; the row in
     * force today runs on to the cancelled row's end. 409
     * STOCK_PRICE_SCHEDULE_STARTED once it is in force, 403
     * STOCK_PRICE_CHAIN_HQ_ONLY for a chain row from a non-HQ branch.
     */
    cancelPriceSchedule: builder.mutation<SellingPriceScheduleCancelResult, { ipmId: string }>({
      query: (body) => ({ url: SELLING_PRICE_SCHEDULE_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<SellingPriceScheduleCancelResult>) => ({
        bucketId: text(payload?.data?.bucketId),
        restoredId: payload?.data?.restoredId ? text(payload.data.restoredId) : null,
        restoredTo: payload?.data?.restoredTo ? text(payload.data.restoredTo).slice(0, 10) : null,
      }),
    }),
    /** The price levels' names (1..4 are the four columns). */
    getSellingPriceLevelNames: builder.query<PriceLevelMasterRow[], void>({
      query: () => ({ url: PRICE_LEVEL_MASTERS_ENDPOINT }),
      transformResponse: (payload: ApiSuccessResponse<PriceLevelMasterRow[]>) =>
        Array.isArray(payload?.data)
          ? payload.data.map((row) => ({
              priceLvlId: Number(row?.priceLvlId) || 0,
              priceLvlName: row?.priceLvlName ?? null,
              priceLvlShort: row?.priceLvlShort ?? null,
              priceLvlIsActive: row?.priceLvlIsActive !== false,
            }))
          : [],
      keepUnusedDataFor: 300,
    }),
    /** This branch's full and short names. */
    getSellingPriceBranchNames: builder.query<BranchNames, string>({
      query: (brId) => ({ url: BRANCH_MASTER_GET_ENDPOINT, params: { brId } }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => ({
        brName: text(payload?.data?.brName),
        brShort: text(payload?.data?.brShort),
      }),
      keepUnusedDataFor: 300,
    }),
    /** A scanned EAN → its item (company-scoped: an unscoped scan resolves across companies). */
    getSellingPriceItemByBarcode: builder.query<BarcodeItem, { barcode: string; companyId: string }>({
      query: ({ barcode, companyId }) => ({
        url: ITEM_BY_BARCODE_ENDPOINT,
        params: { barcode, ...(companyId ? { company_id: companyId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => ({
        itemId: text(payload?.data?.itemId),
        itemName: text(payload?.data?.itemName),
      }),
      keepUnusedDataFor: 0,
    }),
    /**
     * The item's track signature as of today — which of MRP ("M") and sale
     * price ("P") a NEW bucket row may carry. Read off the opening-stock item
     * lookup, the route that answers it.
     */
    getSellingPriceTrackSignature: builder.query<
      string,
      { itemId: string; uomId: string; onDate: string; companyId: string; branchId: string }
    >({
      query: ({ itemId, uomId, onDate, companyId, branchId }) => ({
        url: ITEM_TRACK_LOOKUP_ENDPOINT,
        params: {
          companyId,
          branchId,
          itemId,
          ...(uomId ? { uomId } : {}),
          onDate,
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) =>
        text(payload?.data?.trackSignature),
      keepUnusedDataFor: 0,
    }),
    /**
     * The item picker — configured grid 71, scoped to this company and branch
     * through the two tokens its SQL binds (an empty token is "no bound").
     */
    searchSellingPriceItems: builder.query<
      ConfiguredGridPage<ItemPickerRow>,
      { gridId: string; search: string; page: number; limit: number; companyId: string; branchId: string }
    >({
      query: ({ gridId, search, page, limit, companyId, branchId }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: gridId,
          page,
          limit,
          ...(search.trim() ? { search: search.trim() } : {}),
          grid_param: JSON.stringify({
            [ITEM_PICKER_COMPANY_TOKEN]: companyId,
            [ITEM_PICKER_BRANCH_TOKEN]: branchId,
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<ItemPickerRow>>) =>
        payload?.data ?? { items: [], meta: { page: 1, limit: 0, total: 0 } },
      keepUnusedDataFor: 30,
    }),
  }),
  overrideExisting: false,
});

export const {
  useCancelPriceScheduleMutation,
  useListPriceScheduleQuery,
  useLazyListPriceScheduleQuery,
  useSaveSellingPriceRowsMutation,
  useGetSellingPriceLevelNamesQuery,
  useGetSellingPriceBranchNamesQuery,
  useSearchSellingPriceItemsQuery,
} = sellingPriceApi;
