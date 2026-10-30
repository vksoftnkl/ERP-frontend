/**
 * The routes every purchase screen shares — Cancel, the charge master, the
 * purchase.* settings — injected into the shared
 * `baseApi` (paths WITHOUT `/api/v1`). Each document's own routes live in its
 * own `<doc>.api.ts`; injected endpoint names share one namespace, so every name
 * there is prefixed by the document (`purchaseInvoice…`, `grn…`).
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import { PURCHASE_CHARGE_MODULE, PURCHASE_CHARGES_ENDPOINT, type PurchaseChargeMasterRow } from "./purchase-charges";
import { PURCHASE_SETTINGS_DEFAULTS, type PurchaseSettings } from "./purchase-dialogs.types";

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
    /**
     * The purchase charge master (module P + B) — configuration, read once a session
     * (Qt `purchaseChargeCache`): Purchase Entry's picker and auto-apply seed, the PO's
     * estimated charges, the GRN's off-bill picker and its coolie charge.
     */
    getPurchaseChargeMaster: builder.query<PurchaseChargeMasterRow[], void>({
      query: () => ({ url: PURCHASE_CHARGES_ENDPOINT, params: { chgModule: PURCHASE_CHARGE_MODULE } }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseChargeMasterRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 300,
    }),
    /** The purchase.* settings in force for a branch (needs View on menu 24). */
    getPurchaseSettings: builder.query<PurchaseSettings, { companyId: string; branchId: string }>({
      query: (params) => ({ url: "/purchase/invoices/settings", method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<Partial<PurchaseSettings>>) => ({
        ...PURCHASE_SETTINGS_DEFAULTS,
        ...(payload?.data ?? {}),
      }),
    }),
  }),
});

export const { useCancelPurchaseDocumentMutation, useGetPurchaseChargeMasterQuery, useGetPurchaseSettingsQuery } = purchaseSharedApi;
