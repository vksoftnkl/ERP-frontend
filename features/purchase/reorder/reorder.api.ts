/**
 * Reorder → PO — server endpoints, injected into the shared `baseApi` (paths
 * WITHOUT `/api/v1`). Every name is prefixed `purchaseReorder…`: injected
 * endpoints share one namespace.
 *
 * The suggestions are a GET MUTATION: a one-shot uncached read fired from the
 * screen's handlers (Refresh, a filter change) and its open effect — a query's
 * cache key would dedupe a refresh onto a pending read (memory
 * erp-rtk-pending-query-dedupe-abort), and the list changes with every PO.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import { REORDER_CREATE_POS_ENDPOINT, REORDER_SUGGESTIONS_ENDPOINT } from "./reorder.constants";
import type { CreateReorderPosDto, ReorderMadePo, ReorderSuggestion, ReorderSuggestionsQuery } from "./reorder.types";

export const purchaseReorderApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** GET — the branch's reorder rows with stock, on order, the suggested qty and supplier. */
    purchaseReorderSuggestions: builder.mutation<ReorderSuggestion[], ReorderSuggestionsQuery>({
      query: ({ companyId, branchId, supplierId, belowOnly }) => ({
        url: REORDER_SUGGESTIONS_ENDPOINT,
        method: "GET",
        params: { companyId, branchId, ...(supplierId ? { supplierId } : {}), belowOnly: belowOnly ? "true" : "false" },
      }),
      transformResponse: (payload: ApiSuccessResponse<ReorderSuggestion[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** POST — the ticked rows → one DRAFT PO per supplier. */
    purchaseReorderCreatePos: builder.mutation<ReorderMadePo[], CreateReorderPosDto>({
      query: (body) => ({ url: REORDER_CREATE_POS_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReorderMadePo[]>) => (Array.isArray(payload?.data) ? payload.data : []),
    }),
  }),
});

export const { usePurchaseReorderSuggestionsMutation, usePurchaseReorderCreatePosMutation } = purchaseReorderApi;
