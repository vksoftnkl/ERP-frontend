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
  PURCHASE_ORDER_CANCEL_ENDPOINT,
  PURCHASE_ORDER_DROPDOWN_RUN_ENDPOINT,
  PURCHASE_ORDER_GET_ENDPOINT,
  PURCHASE_ORDER_ITEM_BY_BARCODE_ENDPOINT,
  PURCHASE_ORDER_ITEM_LOOKUP_ENDPOINT,
  PURCHASE_ORDER_SAVE_ENDPOINT,
  PURCHASE_ORDER_SHORT_CLOSE_ENDPOINT,
  PURCHASE_ORDER_VALIDATE_ENDPOINT,
} from "./purchase-order.constants";
import type {
  PurchaseOrderBarcodeItem,
  PurchaseOrderCalc,
  PurchaseOrderItemLookup,
  PurchaseOrderItemLookupArgs,
  PurchaseOrderPayload,
  PurchaseOrderReasonArgs,
  PurchaseOrderRefArgs,
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
    purchaseOrderGet: builder.mutation<PurchaseOrderPayload, PurchaseOrderRefArgs>({
      query: ({ poId, accYear }) => ({ url: PURCHASE_ORDER_GET_ENDPOINT, method: "GET", params: { poId, accYear } }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** POST — cancel an order nothing has been received against. */
    purchaseOrderCancel: builder.mutation<PurchaseOrderPayload, PurchaseOrderReasonArgs>({
      query: (body) => ({ url: PURCHASE_ORDER_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
    }),
    /** POST — close what is still pending, every line (Qt sends no lineIds). */
    purchaseOrderShortClose: builder.mutation<PurchaseOrderPayload, PurchaseOrderReasonArgs>({
      query: (body) => ({ url: PURCHASE_ORDER_SHORT_CLOSE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseOrderPayload>) => payload.data,
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
} = purchaseOrderApi;
