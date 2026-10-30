/**
 * Purchase Entry (menu 24) — server endpoints, injected into the shared
 * `baseApi` (paths WITHOUT `/api/v1`). Every name is prefixed
 * `purchaseInvoice…`: injected endpoints share one namespace.
 *
 * The reads are GET MUTATIONS, not queries: the document is opened from the
 * route's mount effect (a lazy query trigger fired there never reaches the
 * network), a loaded bill looks its items up one line at a time (two lines of
 * one item must not be deduped onto one pending read), and nothing here is worth
 * caching — a bill on screen is re-read whenever it is opened.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  PURCHASE_INVOICE_CANCEL_ENDPOINT,
  PURCHASE_INVOICE_EAN_CREATE_ENDPOINT,
  PURCHASE_INVOICE_GET_ENDPOINT,
  PURCHASE_INVOICE_GRN_LINES_ENDPOINT,
  PURCHASE_INVOICE_ITEM_BY_BARCODE_ENDPOINT,
  PURCHASE_INVOICE_ITEM_CONTEXT_ENDPOINT,
  PURCHASE_INVOICE_ITEM_LOOKUP_ENDPOINT,
  PURCHASE_INVOICE_PO_LINES_ENDPOINT,
  PURCHASE_INVOICE_SAVE_ENDPOINT,
  PURCHASE_INVOICE_SWITCH_UOM_ENDPOINT,
  PURCHASE_INVOICE_VALIDATE_ENDPOINT,
} from "./invoice.constants";
import type {
  PurchaseBarcodeItem,
  PurchaseCalcAnswer,
  PurchaseGrnLine,
  PurchaseInvoicePayload,
  PurchaseItemContext,
  PurchaseItemContextQuery,
  PurchaseItemLookup,
  PurchaseItemLookupQuery,
  PurchasePoPendingLine,
  SavePurchaseInvoiceDto,
} from "./invoice.types";

function rowsOf<T>(payload: ApiSuccessResponse<T[] | null | undefined>): T[] {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function defined(params: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      out[key] = value;
    }
  }
  return out;
}

/** A write's answer: the document, and the server's own sentence (it names any warning). */
export type PurchaseInvoiceWriteResult = { data: PurchaseInvoicePayload; message: string };

export const purchaseInvoiceApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** POST — save a draft; `header.post` saves and posts in one transaction. */
    purchaseInvoiceSave: builder.mutation<PurchaseInvoiceWriteResult, SavePurchaseInvoiceDto>({
      query: (body) => ({ url: PURCHASE_INVOICE_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseInvoicePayload>) => ({
        data: payload.data,
        message: String(payload.message ?? ""),
      }),
    }),
    /** POST — the server's calculation of the bill; nothing is written. */
    purchaseInvoiceValidate: builder.mutation<PurchaseCalcAnswer, SavePurchaseInvoiceDto>({
      query: (body) => ({ url: PURCHASE_INVOICE_VALIDATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseCalcAnswer>) => payload.data,
    }),
    /** GET — one bill: header, lines with their allocation rows. */
    purchaseInvoiceGet: builder.mutation<PurchaseInvoicePayload, { piId: string; accYear: string }>({
      query: ({ piId, accYear }) => ({ url: PURCHASE_INVOICE_GET_ENDPOINT, method: "GET", params: { piId, accYear } }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseInvoicePayload>) => payload.data,
    }),
    /** POST — cancel a posted bill nothing has paid. */
    purchaseInvoiceCancel: builder.mutation<PurchaseInvoiceWriteResult, { piId: string; accYear: string; reason: string }>({
      query: (body) => ({ url: PURCHASE_INVOICE_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseInvoicePayload>) => ({
        data: payload.data,
        message: String(payload.message ?? ""),
      }),
    }),
    /** GET — the item's unit (the given one, else its default), factor, tracking signature, GST %, MRP. */
    purchaseInvoiceItemLookup: builder.mutation<PurchaseItemLookup, PurchaseItemLookupQuery>({
      query: ({ companyId, branchId, itemId, uomId, onDate }) => ({
        url: PURCHASE_INVOICE_ITEM_LOOKUP_ENDPOINT,
        method: "GET",
        params: { companyId, branchId, itemId, ...(uomId ? { uomId } : {}), onDate },
      }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseItemLookup>) => payload.data,
    }),
    /** GET — a scanned code, scoped to the company. 404 = not a barcode of ours. */
    purchaseInvoiceItemByBarcode: builder.mutation<PurchaseBarcodeItem, { barcode: string; companyId: string }>({
      query: ({ barcode, companyId }) => ({
        url: PURCHASE_INVOICE_ITEM_BY_BARCODE_ENDPOINT,
        method: "GET",
        params: { barcode, ...(companyId ? { company_id: companyId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseBarcodeItem>) => payload.data,
    }),
    // ── Qt 0fbe19c..e0c56ef (PI-LINES) ──────────────────────────────────────
    /** GET — R4: the supplier's posted GRN lines at the branch not billed yet (a draft's own count as free). */
    purchaseInvoiceGrnLines: builder.mutation<
      PurchaseGrnLine[],
      { companyId: string; branchId: string; supplierId: string; piId?: string }
    >({
      query: ({ companyId, branchId, supplierId, piId }) => ({
        url: PURCHASE_INVOICE_GRN_LINES_ENDPOINT,
        method: "GET",
        params: defined({ companyId, branchId, supplierId, piId }),
      }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseGrnLine[]>) => rowsOf(payload),
    }),
    /** GET — DOC-04: the supplier's confirmed PO lines with qty pending. */
    purchaseInvoicePoLines: builder.mutation<PurchasePoPendingLine[], { companyId: string; branchId: string; supplierId: string }>({
      query: (params) => ({ url: PURCHASE_INVOICE_PO_LINES_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<PurchasePoPendingLine[]>) => rowsOf(payload),
    }),
    /** GET — B9: the item on a line (last purchases, PO rate, stock, prices, the supplier's code and scheme). */
    purchaseInvoiceItemContext: builder.mutation<PurchaseItemContext, PurchaseItemContextQuery>({
      query: ({ companyId, branchId, itemId, uomId, supplierId, onDate }) => ({
        url: PURCHASE_INVOICE_ITEM_CONTEXT_ENDPOINT,
        method: "GET",
        params: defined({ companyId, branchId, itemId, uomId, supplierId, onDate }),
      }),
      transformResponse: (payload: ApiSuccessResponse<PurchaseItemContext>) => payload.data,
    }),
    /** GET — F4: the item's next unit (iuc_id), wrapping round. Never cached by the server. */
    purchaseInvoiceSwitchUom: builder.mutation<{ item_id: string; iuc_id: string }, { itemId: string; uomId: string }>({
      query: ({ itemId, uomId }) => ({
        url: PURCHASE_INVOICE_SWITCH_UOM_ENDPOINT,
        method: "GET",
        params: { item_id: itemId, iuc_id: uomId },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ item_id: string; iuc_id: string }>) => payload.data,
    }),
    /** POST — ENT-16: a scanned code saved as one of the item's barcodes (EAN) in the line's unit. */
    purchaseInvoiceCreateEan: builder.mutation<unknown, { itemId: string; uomId: string; code: string }>({
      query: ({ itemId, uomId, code }) => ({
        url: PURCHASE_INVOICE_EAN_CREATE_ENDPOINT,
        method: "POST",
        body: {
          ean_item_id: itemId,
          ean_unit_id: uomId,
          ean_code: code,
          ean_is_default: false,
          ean_is_active: true,
          ean_remarks: "added from Purchase Entry",
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload?.data,
    }),
  }),
});

export const {
  usePurchaseInvoiceSaveMutation,
  usePurchaseInvoiceValidateMutation,
  usePurchaseInvoiceGetMutation,
  usePurchaseInvoiceCancelMutation,
  usePurchaseInvoiceItemLookupMutation,
  usePurchaseInvoiceItemByBarcodeMutation,
  usePurchaseInvoiceGrnLinesMutation,
  usePurchaseInvoicePoLinesMutation,
  usePurchaseInvoiceItemContextMutation,
  usePurchaseInvoiceSwitchUomMutation,
  usePurchaseInvoiceCreateEanMutation,
} = purchaseInvoiceApi;
