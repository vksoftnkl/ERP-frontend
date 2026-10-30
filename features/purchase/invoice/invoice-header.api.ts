/**
 * Purchase Entry (menu 24) — the header / side routes (Qt NexERP 88cd3f2,
 * 8f2a1f4, 348957f, 4c09536): the purchase charge master, the supplier
 * context, payment hold, sister company bills and the autosave list.
 * Injected into the shared `baseApi` (paths WITHOUT `/api/v1`); every name is
 * prefixed `purchaseInvoice…` — injected endpoints share one namespace. The
 * charge master is shared/purchase.api.ts `useGetPurchaseChargeMasterQuery`.
 *
 * The per-document reads are GET MUTATIONS: each answer belongs to the
 * supplier / bill on screen at the time it was asked, and nothing here is worth
 * caching. The charge master is configuration, fetched once a session (Qt
 * `purchaseChargeCache`).
 */
import { baseApi } from "@/store/api/baseApi";
import type { TxnHoldPayload } from "@/features/sales/quotation/quotation.types";
import type { ApiSuccessResponse } from "@/utils/types";
import type { PurchaseInvoicePayload } from "./invoice.types";
import type {
  SisterBill,
  SisterBillPull,
  SupplierContext,
  SupplierContextQuery,
} from "./invoice-header.types";

export const PURCHASE_SUPPLIER_CONTEXT_ENDPOINT = "/purchase/lookup/supplier-context";
export const PURCHASE_INVOICE_HOLD_ENDPOINT = "/purchase/invoices/hold";
export const PURCHASE_SISTER_BILLS_ENDPOINT = "/purchase/sister-bills";
export const PURCHASE_SISTER_BILL_LINES_ENDPOINT = "/purchase/sister-bills/lines";
const TXN_HOLD_LIST_ENDPOINT = "/txn-holds/list";

export type PurchaseInvoiceHoldArgs = { piId: string; accYear: string; hold: boolean; reason: string };

export type PurchaseAutosaveListArgs = {
  txhCompanyId: string;
  txhBranchId: string;
  txhAccYear: string;
  txhDocType: string;
};

export const purchaseInvoiceHeaderApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** GET — GSTIN, MSME pay-by, note, pending POs, outstanding, licence warnings. */
    purchaseInvoiceSupplierContext: builder.mutation<SupplierContext, SupplierContextQuery>({
      query: ({ companyId, branchId, supplierId, onDate }) => ({
        url: PURCHASE_SUPPLIER_CONTEXT_ENDPOINT,
        method: "GET",
        params: { companyId, branchId, supplierId, ...(onDate ? { onDate } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<SupplierContext>) => payload.data,
    }),
    /** POST — hold (Edit right) or release (Override right) a posted bill; answers the bill. */
    purchaseInvoiceHold: builder.mutation<PurchaseInvoicePayload, PurchaseInvoiceHoldArgs>({
      query: (body) => ({ url: PURCHASE_INVOICE_HOLD_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseInvoicePayload>) => payload.data,
    }),
    /** GET — sister companies' posted sale bills raised on this company, each with what would stop a pull. */
    purchaseInvoiceSisterBills: builder.mutation<SisterBill[], { companyId: string; branchId: string }>({
      query: (params) => ({ url: PURCHASE_SISTER_BILLS_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<SisterBill[]>) => (Array.isArray(payload?.data) ? payload.data : []),
    }),
    /** GET — one sister bill in the purchase line shape (each line keeps its sale line). */
    purchaseInvoiceSisterBillLines: builder.mutation<
      SisterBillPull,
      { companyId: string; branchId: string; sbId: string; accYear: string }
    >({
      query: (params) => ({ url: PURCHASE_SISTER_BILL_LINES_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<SisterBillPull>) => payload.data,
    }),
    /**
     * GET — this screen's live AUTOSAVE snapshots (Qt `offerRecovery`). A GET
     * mutation: it is asked once, from the mount, where a lazy query trigger
     * never reaches the network.
     */
    purchaseInvoiceAutosaveList: builder.mutation<TxnHoldPayload[], PurchaseAutosaveListArgs>({
      query: (params) => ({
        url: TXN_HOLD_LIST_ENDPOINT,
        method: "GET",
        params: { ...params, txhKind: "AUTOSAVE", txhStatus: "HELD", page: 1, limit: 50 },
      }),
      transformResponse: (payload: ApiSuccessResponse<TxnHoldPayload[]>) => (Array.isArray(payload?.data) ? payload.data : []),
    }),
  }),
});

export const {
  usePurchaseInvoiceSupplierContextMutation,
  usePurchaseInvoiceHoldMutation,
  usePurchaseInvoiceSisterBillsMutation,
  usePurchaseInvoiceSisterBillLinesMutation,
  usePurchaseInvoiceAutosaveListMutation,
} = purchaseInvoiceHeaderApi;
