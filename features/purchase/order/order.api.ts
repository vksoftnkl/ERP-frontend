/**
 * Purchase Order — server endpoints, injected into the shared `baseApi` (paths
 * WITHOUT `/api/v1`). Every name is prefixed `purchaseOrder…`: injected
 * endpoints share one namespace.
 *
 * The reads are GET MUTATIONS, not queries: each is a one-shot, uncached read
 * the screen fires from handlers and its open effect, and a query's cache key
 * dedupes a second `initiate` onto a pending (or aborted) first one — the
 * opened document then never arrives (memory erp-rtk-pending-query-dedupe-abort).
 */
import { getDropdownId } from "@/lib/configured-dropdowns";
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  GODOWN_DROPDOWN_KEY,
  PO_ITEM_CONTEXT_ENDPOINT,
  PO_REORDER_SUGGESTIONS_ENDPOINT,
  PO_SUPPLIER_CONTEXT_ENDPOINT,
  PURCHASE_ORDER_APPROVE_ENDPOINT,
  PURCHASE_ORDER_CANCEL_ENDPOINT,
  PURCHASE_ORDER_CLONE_ENDPOINT,
  PURCHASE_ORDER_DROPDOWN_RUN_ENDPOINT,
  PURCHASE_ORDER_GET_ENDPOINT,
  PURCHASE_ORDER_ITEM_BY_BARCODE_ENDPOINT,
  PURCHASE_ORDER_ITEM_LOOKUP_ENDPOINT,
  PURCHASE_ORDER_MERGE_ENDPOINT,
  PURCHASE_ORDER_PENDING_LINES_ENDPOINT,
  PURCHASE_ORDER_REVISIONS_ENDPOINT,
  PURCHASE_ORDER_SAVE_ENDPOINT,
  PURCHASE_ORDER_SHORT_CLOSE_ENDPOINT,
  PURCHASE_ORDER_VALIDATE_ENDPOINT,
} from "./purchase-order.constants";
import type {
  PurchaseOrderApproveArgs,
  PurchaseOrderBarcodeItem,
  PurchaseOrderCalc,
  PurchaseOrderCloneArgs,
  PurchaseOrderItemLookup,
  PurchaseOrderItemLookupArgs,
  PurchaseOrderMergeArgs,
  PurchaseOrderPayload,
  PurchaseOrderPendingLine,
  PurchaseOrderReasonArgs,
  PurchaseOrderRefArgs,
  PurchaseOrderRevision,
  SavePurchaseOrderDto,
} from "./purchase-order.types";

export const purchaseOrderApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** POST — create / update a draft; `header.post` confirms it. Answers the stored PO. */
    purchaseOrderSave: builder.mutation<PurchaseOrderPayload, SavePurchaseOrderDto>({
      query: (body) => ({ url: PURCHASE_ORDER_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** POST — the server's figures for the PO being keyed. Writes nothing. */
    purchaseOrderValidate: builder.mutation<PurchaseOrderCalc, SavePurchaseOrderDto>({
      query: (body) => ({ url: PURCHASE_ORDER_VALIDATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderCalc>) => payload.data,
    }),
    /** GET — one PO with received / pending per line. */
    /** GET — the supplier's credit days and default godown (Qt loadSupplierContext). */
    purchaseOrderSupplierContext: builder.mutation<Record<string, unknown>, { companyId: string; branchId: string; supplierId: string }>({
      query: (params) => ({ url: PO_SUPPLIER_CONTEXT_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data ?? {},
    }),
    /** GET — a new line's last rate and stock (Qt fetchItemContext). */
    purchaseOrderItemContext: builder.mutation<
      Record<string, unknown>,
      { companyId: string; branchId: string; itemId: string; supplierId?: string }
    >({
      query: (params) => ({ url: PO_ITEM_CONTEXT_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data ?? {},
    }),
    /** GET — items at or below their reorder level (F7). */
    purchaseOrderReorderSuggestions: builder.mutation<unknown[], { companyId: string; branchId: string; supplierId?: string }>({
      query: (params) => ({ url: PO_REORDER_SUGGESTIONS_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<unknown[]>) => (Array.isArray(payload.data) ? payload.data : []),
    }),
    purchaseOrderGet: builder.mutation<PurchaseOrderPayload, PurchaseOrderRefArgs>({
      query: ({ poId, accYear }) => ({ url: PURCHASE_ORDER_GET_ENDPOINT, method: "GET", params: { poId, accYear } }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** POST — cancel an order nothing has been received against. */
    purchaseOrderCancel: builder.mutation<PurchaseOrderPayload, PurchaseOrderReasonArgs>({
      query: (body) => ({ url: PURCHASE_ORDER_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** POST — close what is still pending: `lineIds` = those lines, none = every line (the whole PO). */
    purchaseOrderShortClose: builder.mutation<PurchaseOrderPayload, PurchaseOrderReasonArgs & { lineIds?: string[] }>({
      query: (body) => ({ url: PURCHASE_ORDER_SHORT_CLOSE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** POST — approve (or, `approve: false` with a reason, refuse) a PO waiting for approval. */
    purchaseOrderApprove: builder.mutation<PurchaseOrderPayload, PurchaseOrderApproveArgs>({
      query: (body) => ({ url: PURCHASE_ORDER_APPROVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** POST — a new DRAFT with the lines of this PO. Answers the new PO. */
    purchaseOrderClone: builder.mutation<PurchaseOrderPayload, PurchaseOrderCloneArgs>({
      query: (body) => ({ url: PURCHASE_ORDER_CLONE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** POST — what is pending on two or more confirmed POs → one new draft; the sources short-close. */
    purchaseOrderMerge: builder.mutation<PurchaseOrderPayload, PurchaseOrderMergeArgs>({
      query: (body) => ({ url: PURCHASE_ORDER_MERGE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** GET — every saved version of the PO, newest first. */
    purchaseOrderRevisions: builder.mutation<PurchaseOrderRevision[], PurchaseOrderRefArgs>({
      query: ({ poId, accYear }) => ({ url: PURCHASE_ORDER_REVISIONS_ENDPOINT, method: "GET", params: { poId, accYear } }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderRevision[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** GET — the supplier's confirmed PO lines with something pending (approved / not needing it). */
    purchaseOrderPendingLines: builder.mutation<
      PurchaseOrderPendingLine[],
      { companyId: string; branchId: string; supplierId: string }
    >({
      query: (params) => ({ url: PURCHASE_ORDER_PENDING_LINES_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPendingLine[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** GET — the item's unit (default, or the given iuc_id), GST % and MRP. */
    purchaseOrderItemLookup: builder.mutation<PurchaseOrderItemLookup, PurchaseOrderItemLookupArgs>({
      query: ({ companyId, branchId, itemId, uomId, onDate, godownId }) => ({
        url: PURCHASE_ORDER_ITEM_LOOKUP_ENDPOINT,
        method: "GET",
        params: { companyId, branchId, itemId, ...(uomId ? { uomId } : {}), onDate, ...(godownId ? { godownId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderItemLookup>) => payload.data,
    }),
    /** GET — a scanned code, scoped to the company (unscoped it can answer another company's item). */
    purchaseOrderItemByBarcode: builder.mutation<PurchaseOrderBarcodeItem, { barcode: string; companyId: string }>({
      query: ({ barcode, companyId }) => ({
        url: PURCHASE_ORDER_ITEM_BY_BARCODE_ENDPOINT,
        method: "GET",
        params: { barcode, company_id: companyId },
      }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderBarcodeItem>) => payload.data,
    }),
    /**
     * GET — the branch's godowns (dropdown 26), to name the Deliver-to godown of
     * a loaded PO: /purchase/orders/get carries only its id.
     */
    purchaseOrderGodowns: builder.mutation<{ id: string; name: string }[], { branchId: string }>({
      query: ({ branchId }) => ({
        url: PURCHASE_ORDER_DROPDOWN_RUN_ENDPOINT,
        method: "GET",
        params: {
          dropdown_id: getDropdownId(GODOWN_DROPDOWN_KEY),
          page: 1,
          // The runner refuses anything above 100; a branch has a handful of godowns.
          limit: 100,
          dropdown_param: JSON.stringify({ ibranch_id: branchId }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ items?: Record<string, unknown>[] }>) =>
        (payload.data?.items ?? []).map((row) => ({ id: String(row.gdl_id ?? ""), name: String(row.gdl_name ?? "") })),
    }),
  }),
});

export const {
  usePurchaseOrderSaveMutation,
  usePurchaseOrderValidateMutation,
  usePurchaseOrderGetMutation,
  usePurchaseOrderCancelMutation,
  usePurchaseOrderShortCloseMutation,
  usePurchaseOrderItemLookupMutation,
  usePurchaseOrderItemByBarcodeMutation,
  usePurchaseOrderGodownsMutation,
  usePurchaseOrderApproveMutation,
  usePurchaseOrderCloneMutation,
  usePurchaseOrderMergeMutation,
  usePurchaseOrderRevisionsMutation,
  usePurchaseOrderPendingLinesMutation,
  usePurchaseOrderSupplierContextMutation,
  usePurchaseOrderItemContextMutation,
  usePurchaseOrderReorderSuggestionsMutation,
} = purchaseOrderApi;
