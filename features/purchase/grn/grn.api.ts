/**
 * GRN (menu 196) — server routes, injected into the shared `baseApi` (paths
 * WITHOUT `/api/v1`). Every name is prefixed `grn…`: injected endpoints share
 * one namespace.
 *
 * The reads are one-shot GET MUTATIONS, not queries: each runs from a click or
 * a load, owns no cache entry, and so can never be handed another screen's
 * pending request (memory: RTK pending-query dedupe).
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  GRN_CANCEL_ENDPOINT,
  GRN_GET_ENDPOINT,
  GRN_ITEM_BY_BARCODE_ENDPOINT,
  GRN_ITEM_LOOKUP_ENDPOINT,
  GRN_PENDING_PO_LINES_ENDPOINT,
  GRN_POST_ENDPOINT,
  GRN_SAVE_ENDPOINT,
} from "./grn.constants";
import type {
  CancelGrnArgs,
  GrnBarcodeItem,
  GrnItemLookup,
  GrnPayload,
  GrnRefArgs,
  PendingPoLine,
  SaveGrnDto,
} from "./grn.types";

export const grnApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** POST — create or replace a DRAFT; `header.post` posts it in the same call. */
    grnSave: builder.mutation<GrnPayload, SaveGrnDto>({
      query: (body) => ({ url: GRN_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<GrnPayload>) => payload.data,
    }),
    /** POST — post a saved draft as it stands (Post right only). */
    grnPost: builder.mutation<GrnPayload, GrnRefArgs>({
      query: (body) => ({ url: GRN_POST_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<GrnPayload>) => payload.data,
    }),
    /** GET — one document with its lines and allocation rows. */
    grnGet: builder.mutation<GrnPayload, GrnRefArgs>({
      query: (params) => ({ url: GRN_GET_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<GrnPayload>) => payload.data,
    }),
    /** POST — reverse a posted, un-billed GRN. Answers the document as it now stands. */
    grnCancel: builder.mutation<GrnPayload, CancelGrnArgs>({
      query: (body) => ({ url: GRN_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<GrnPayload>) => payload.data,
    }),
    /** GET — the supplier's confirmed PO lines with qty still pending. */
    grnPendingPoLines: builder.mutation<PendingPoLine[], { companyId: string; branchId: string; supplierId: string }>({
      query: (params) => ({ url: GRN_PENDING_PO_LINES_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<PendingPoLine[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** GET — a scanned code's item (and unit). 404 = not a barcode. */
    grnItemByBarcode: builder.mutation<GrnBarcodeItem, { barcode: string; companyId: string }>({
      query: ({ barcode, companyId }) => ({
        url: GRN_ITEM_BY_BARCODE_ENDPOINT,
        method: "GET",
        params: { barcode, ...(companyId ? { company_id: companyId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<GrnBarcodeItem>) => payload.data,
    }),
    /** GET — the item's unit (the one asked for, else its default) and MRP. */
    grnItemLookup: builder.mutation<
      GrnItemLookup,
      { companyId: string; branchId: string; itemId: string; uomId?: string; onDate: string; godownId?: string }
    >({
      query: ({ uomId, godownId, ...rest }) => ({
        url: GRN_ITEM_LOOKUP_ENDPOINT,
        method: "GET",
        params: { ...rest, ...(uomId ? { uomId } : {}), ...(godownId ? { godownId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<GrnItemLookup>) => payload.data,
    }),
  }),
});

export const {
  useGrnSaveMutation,
  useGrnPostMutation,
  useGrnGetMutation,
  useGrnCancelMutation,
  useGrnPendingPoLinesMutation,
  useGrnItemByBarcodeMutation,
  useGrnItemLookupMutation,
} = grnApi;
