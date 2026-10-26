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
 *
 * The textile reads (the Size / Colour lists, an item's earlier models) are
 * GET MUTATIONS: asked once per screen or per item, from effects, so every call
 * is its own request — a query endpoint would hand a second call for a pending
 * key the first one's promise — and the store's write announcer ignores a GET.
 */
import { ITEM_COLOUR_SPEC, ITEM_SIZE_SPEC } from "@/features/masters/inventory/item-attribute/item-attribute";
import { BATCH_MODELS_ENDPOINT } from "@/features/stocks/shared/batch-detail";
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  CHOICE_PAGE_SIZE,
  CONFIGURED_GRID_RUN_ENDPOINT,
  DROPDOWN_RUN_ENDPOINT,
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

/** One page of the Size or Colour list (dropdown 70 / 71), bound to the company. */
export type BatchDetailChoicePageQuery = {
  dropdownId: string;
  companyId: string;
  page: number;
};

/** A row of dropdown 70 / 71 or of a quick-add's answer, by column name (`isz_*` / `icl_*`). */
export type BatchDetailChoiceRow = Record<string, unknown>;

/** The quick-add: a size or colour created from the line, for the document's company. */
export type BatchDetailQuickAddArgs = {
  kind: "size" | "colour";
  name: string;
  companyId: string;
};

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
     * signature in force on `onDate`, and whether the item is already opened —
     * in the line's godown (and bucket) when they are sent. Deliberately NO
     * cost. A 404 is an answer and names its cause.
     */
    getOpeningStockItemLookup: builder.query<OpeningStockItemLookup, OpeningStockItemLookupQuery>({
      query: ({ companyId, branchId, itemId, uomId, onDate, godownId, bucket }) => ({
        url: OPENING_STOCK_ITEM_LOOKUP_ENDPOINT,
        params: {
          companyId,
          branchId,
          itemId,
          ...(uomId ? { uomId } : {}),
          onDate,
          ...(godownId ? { godownId } : {}),
          ...(bucket ? { bucket } : {}),
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

    /**
     * One page of the Size or Colour list. Both SELECTs bind a QUOTED
     * `'icompany_id'` (this company's rows and the shared ones), so the param
     * always travels.
     */
    runOpeningStockChoicePage: builder.mutation<BatchDetailChoiceRow[], BatchDetailChoicePageQuery>({
      query: ({ dropdownId, companyId, page }) => ({
        url: DROPDOWN_RUN_ENDPOINT,
        method: "GET",
        params: {
          dropdown_id: dropdownId,
          page,
          limit: CHOICE_PAGE_SIZE,
          dropdown_param: JSON.stringify({ icompany_id: companyId }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ items?: unknown } | null>) => {
        const items = payload.data?.items;
        return Array.isArray(items)
          ? items.filter((row): row is BatchDetailChoiceRow => typeof row === "object" && row !== null)
          : [];
      },
    }),

    /** `GET /stock/batch-detail/models` — the item's earlier models, newest first, at most 20. */
    getOpeningStockBatchModels: builder.mutation<string[], { companyId: string; itemId: string }>({
      query: ({ companyId, itemId }) => ({
        url: BATCH_MODELS_ENDPOINT,
        method: "GET",
        params: { companyId, itemId },
      }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) =>
        Array.isArray(payload.data)
          ? payload.data.filter((model): model is string => typeof model === "string")
          : [],
    }),

    /**
     * The quick-add (Qt `quickAddChoice()`): the masters' own `/create`, with
     * only the name, the company, sort 0 and active — what the Size / Colour
     * master would save for a name typed there. Answers the row (`isz_*` /
     * `icl_*`); a name already live is a 409, shown as it comes.
     */
    quickAddOpeningStockChoice: builder.mutation<BatchDetailChoiceRow, BatchDetailQuickAddArgs>({
      query: ({ kind, name, companyId }) => {
        const spec = kind === "size" ? ITEM_SIZE_SPEC : ITEM_COLOUR_SPEC;
        const p = spec.prefix;
        return {
          url: spec.endpoints.create,
          method: "POST",
          body: {
            [`${p}_name`]: name,
            [`${p}_company_id`]: companyId,
            [`${p}_sort`]: 0,
            [`${p}_is_active`]: true,
          },
        };
      },
      transformResponse: (payload: ApiSuccessResponse<BatchDetailChoiceRow | null>) => payload.data ?? {},
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
  useRunOpeningStockChoicePageMutation,
  useGetOpeningStockBatchModelsMutation,
  useQuickAddOpeningStockChoiceMutation,
} = openingStockApi;
