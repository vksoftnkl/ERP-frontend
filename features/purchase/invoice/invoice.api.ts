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
  PURCHASE_INVOICE_GET_ENDPOINT,
  PURCHASE_INVOICE_ITEM_BY_BARCODE_ENDPOINT,
  PURCHASE_INVOICE_ITEM_LOOKUP_ENDPOINT,
  PURCHASE_INVOICE_SAVE_ENDPOINT,
  PURCHASE_INVOICE_VALIDATE_ENDPOINT,
} from "./invoice.constants";
import type {
  PurchaseBarcodeItem,
  PurchaseCalcAnswer,
  PurchaseInvoicePayload,
  PurchaseItemLookup,
  PurchaseItemLookupQuery,
  SavePurchaseInvoiceDto,
} from "./invoice.types";

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
  }),
});

export const {
  usePurchaseInvoiceSaveMutation,
  usePurchaseInvoiceValidateMutation,
  usePurchaseInvoiceGetMutation,
  usePurchaseInvoiceCancelMutation,
  usePurchaseInvoiceItemLookupMutation,
  usePurchaseInvoiceItemByBarcodeMutation,
} = purchaseInvoiceApi;
