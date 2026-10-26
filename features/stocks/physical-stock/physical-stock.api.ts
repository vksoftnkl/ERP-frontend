/**
 * `/stock/physical/*` and the lookups the count grid needs, injected into the
 * shared `baseApi`. Paths are relative to the base query's `/api/v1`.
 *
 * NOTHING HERE IS CACHED for longer than the call: a cached count sheet is a
 * book figure from before the last sale (the server sets no TTL either), and a
 * document read back stale would repaint the wrong status.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  LOTS_BY_BATCH_ENDPOINT,
  lotsByBatchParams,
  type LotByBatchRow,
  type LotsByBatchQuery,
} from "@/features/stocks/shared/batch-detail";
import { PHYSICAL_STOCK_ENDPOINTS } from "./physical-stock.constants";
import { sheetRowsOf } from "./physical-stock.payload";
import type {
  BarcodeLookup,
  CountSheetQuery,
  CountSheetRow,
  PhysicalStockCancelResult,
  PhysicalStockDocKey,
  PhysicalStockDocument,
  PhysicalStockLineProblem,
  PhysicalStockSaveResult,
  SavePhysicalStockPayload,
} from "./physical-stock.types";

export type PickerGridPage = {
  items: Record<string, unknown>[];
  meta: { page: number; limit: number; total: number };
};

export type PickerGridQuery = {
  gridId: string;
  search?: string;
  page?: number;
  limit?: number;
  /** The grid SQL's bare tokens (`iitem_company_id`, …). */
  params?: Record<string, string>;
};

function scopeParams(key: PhysicalStockDocKey): Record<string, string> {
  return {
    companyId: key.companyId,
    branchId: key.branchId,
    accYear: key.accYear,
    svhId: key.svhId,
  };
}

function postBody(key: PhysicalStockDocKey): Record<string, string> {
  return {
    svhId: key.svhId,
    accYear: key.accYear,
    companyId: key.companyId,
    branchId: key.branchId,
  };
}

export const physicalStockApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** One page of the godown's holdings — lineNo continues across pages. */
    physicalStockCountSheet: builder.query<CountSheetRow[], CountSheetQuery>({
      query: (query) => ({
        url: PHYSICAL_STOCK_ENDPOINTS.countSheet,
        params: {
          companyId: query.companyId,
          branchId: query.branchId,
          accYear: query.accYear,
          godownId: query.godownId,
          ...(query.bucket ? { bucket: query.bucket } : {}),
          ...(query.itemGroupId ? { itemGroupId: query.itemGroupId } : {}),
          ...(query.includeZero !== undefined ? { includeZero: String(query.includeZero) } : {}),
          ...(query.limit !== undefined ? { limit: String(query.limit) } : {}),
          ...(query.offset !== undefined ? { offset: String(query.offset) } : {}),
        },
      }),
      transformResponse: (payload: unknown) => sheetRowsOf(payload),
      keepUnusedDataFor: 0,
    }),

    /** One count, header + lines — `/get` with `svhId` loads rather than lists. */
    physicalStockDocument: builder.query<PhysicalStockDocument, PhysicalStockDocKey>({
      query: (key) => ({ url: PHYSICAL_STOCK_ENDPOINTS.get, params: scopeParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<PhysicalStockDocument>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** The preflight — every line, `problem` null on the clean ones. */
    physicalStockValidate: builder.query<PhysicalStockLineProblem[], PhysicalStockDocKey>({
      query: (key) => ({ url: PHYSICAL_STOCK_ENDPOINTS.validate, params: scopeParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<PhysicalStockLineProblem[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 0,
    }),

    /**
     * Create or update (by header.svhId presence) — a full replace of the
     * lines. A DRAFT, unless header.status is "POSTED": then the same call
     * posts it too, in one transaction (notes 106). Posting has no route of
     * its own on this screen any more — a refusal there would have left a
     * saved draft behind.
     */
    physicalStockSave: builder.mutation<PhysicalStockSaveResult, SavePhysicalStockPayload>({
      query: (body) => ({ url: PHYSICAL_STOCK_ENDPOINTS.create, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PhysicalStockSaveResult>) => payload.data,
      invalidatesTags: ["PhysicalStock"],
    }),

    /** Cancel a DRAFT or a POSTED count — never a delete. The reason is required. */
    physicalStockCancel: builder.mutation<
      PhysicalStockCancelResult,
      PhysicalStockDocKey & { reason: string }
    >({
      query: ({ reason, ...key }) => ({
        url: PHYSICAL_STOCK_ENDPOINTS.cancel,
        method: "POST",
        body: { ...postBody(key), reason },
      }),
      transformResponse: (payload: ApiSuccessResponse<PhysicalStockCancelResult>) => payload.data,
      invalidatesTags: ["PhysicalStock"],
    }),

    /** A popup grid (71 items, 102 reasons) through the configured-grid runner. */
    physicalStockPickerGrid: builder.query<PickerGridPage, PickerGridQuery>({
      query: ({ gridId, search, page = 1, limit = 20, params }) => ({
        url: PHYSICAL_STOCK_ENDPOINTS.gridRun,
        params: {
          grid_id: gridId,
          page,
          limit,
          ...(search?.trim() ? { search: search.trim() } : {}),
          ...(params && Object.keys(params).length > 0
            ? { grid_param: JSON.stringify(params) }
            : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<PickerGridPage>) => ({
        items: Array.isArray(payload?.data?.items) ? payload.data.items : [],
        meta: payload?.data?.meta ?? { page: 1, limit: 20, total: 0 },
      }),
      keepUnusedDataFor: 60,
    }),

    /**
     * The scan's first hop. Scoped to the company on purpose: unscoped, a scan
     * resolves against every company's EAN rows.
     */
    physicalStockItemByBarcode: builder.query<
      BarcodeLookup | null,
      { barcode: string; companyId: string }
    >({
      query: ({ barcode, companyId }) => ({
        url: PHYSICAL_STOCK_ENDPOINTS.itemByBarcode,
        params: { barcode, ...(companyId ? { company_id: companyId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<BarcodeLookup | null>) => payload?.data ?? null,
      keepUnusedDataFor: 0,
    }),

    /**
     * The scan's second hop on a textile company (`stock.auto_batch_no`): a
     * code that is no item's barcode may be a batch LABEL, which names the
     * holding itself. The lots carrying it — asked with `bucket=ALL` (a count
     * reaches the QUARANTINE and DAMAGED holdings of a batch too, notes 150
     * #10), the godown being counted, and `includeEmpty` (a holding the book
     * says is empty can still be on the shelf). 404 STOCK_BATCH_NOT_FOUND when
     * no lot carries it. Never cached: the scan must see the last bill's stock.
     */
    physicalStockLotsByBatch: builder.query<LotByBatchRow[], LotsByBatchQuery>({
      query: (query) => ({ url: LOTS_BY_BATCH_ENDPOINT, params: lotsByBatchParams(query) }),
      transformResponse: (payload: ApiSuccessResponse<LotByBatchRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  usePhysicalStockPickerGridQuery,
  usePhysicalStockSaveMutation,
  usePhysicalStockCancelMutation,
} = physicalStockApi;
