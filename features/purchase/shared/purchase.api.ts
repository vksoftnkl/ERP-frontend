/**
 * The one route every purchase list shares — Cancel — injected into the shared
 * `baseApi` (paths WITHOUT `/api/v1`). Each document's own routes live in its
 * own `<doc>.api.ts`; injected endpoint names share one namespace, so every name
 * there is prefixed by the document (`purchaseInvoice…`, `grn…`).
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";

export type CancelPurchaseDocumentArgs = {
  /** e.g. "/purchase/invoices/cancel" (PURCHASE_DOC_TYPES[…].cancel.endpoint). */
  endpoint: string;
  /** e.g. "piId". */
  idKey: string;
  id: string;
  accYear: string;
  reason: string;
};

export const purchaseSharedApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** POST `{ [idKey]: id, accYear, reason }` — Qt `confirmAndCancel`. */
    cancelPurchaseDocument: builder.mutation<unknown, CancelPurchaseDocumentArgs>({
      query: ({ endpoint, idKey, id, accYear, reason }) => ({
        url: endpoint,
        method: "POST",
        body: { [idKey]: id, accYear, reason },
      }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload?.data,
    }),
  }),
});

export const { useCancelPurchaseDocumentMutation } = purchaseSharedApi;
