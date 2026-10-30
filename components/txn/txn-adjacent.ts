/**
 * Previous / Next for EVERY document type — `GET /txn/adjacent` (server notes
 * 142, Qt `ApiEndpoints::TxnAdjacent`).
 *
 * The document entered just before (`prev`, older) or just after (`next`,
 * newer) the one on screen, in the list's own order (date, number, created
 * on, id), within its company / branch / year. Omit `docId` on an EMPTY
 * screen: prev then answers the newest document, next the oldest. `doc` is
 * null at either end. The answer is a KEY — the screen loads it with its own
 * `/get`.
 *
 * Sent as a GET MUTATION: never cached (the server says `@CacheTTL(0)` for the
 * same reason — the lists change all day), and never deduped onto an earlier
 * pending read, so a fast Alt+PgUp, Alt+PgUp walks two documents, not one.
 *
 * Refusals the screens word by code: 403 TXN_RIGHT_VIEW (no View on the
 * docType's menu), 404 TXN_DOC_NOT_FOUND, 400 TXN_TYPE_NOT_IN_DOC /
 * TXN_STATUS_NOT_IN_DOC.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";

export const TXN_ADJACENT_ENDPOINT = "/txn/adjacent";

/** The route's `docType` enum (txn-adjacent.registry.ts). */
export type TxnAdjacentDocType =
  | "OPENING_STOCK"
  | "STOCK_ADJUSTMENT"
  | "PHYSICAL_STOCK"
  | "STOCK_TRANSFER"
  | "STOCK_TRANSFER_RECEIPT"
  | "SALE_BILL"
  | "QUOTATION"
  | "SALE_ORDER"
  | "DELIVERY_CHALLAN"
  | "DC_RETURN"
  | "SALE_RETURN"
  | "RECEIPT"
  | "PAYMENT"
  | "VOUCHER"
  // The purchase documents (server 2fa24c7b, Qt 7c809f9 PurchaseDocNav).
  | "PURCHASE_ORDER"
  | "GRN"
  | "PURCHASE_BILL"
  | "PURCHASE_RETURN"
  | "SHORTAGE_RECEIPT";

export type TxnAdjacentQuery = {
  docType: TxnAdjacentDocType;
  companyId: string;
  branchId: string;
  /** `2026-2027`. */
  accYear: string;
  /** The document on screen; omit on an empty screen. */
  docId?: string;
  direction: "prev" | "next";
  /** One type only (a VOUCHER type code, a STOCK_ADJUSTMENT kind, a sales `*_doc_type`). */
  typeCode?: string;
  /** The list's filters, when the screen wants the walk to visit exactly its rows. */
  status?: string;
  fromDate?: string;
  toDate?: string;
};

export type TxnAdjacentDoc = {
  docId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  typeCode: string;
  refno: string | null;
  date: string;
  status: string;
};

export type TxnAdjacentPayload = {
  docType: TxnAdjacentDocType;
  direction: "prev" | "next";
  fromDocId: string | null;
  doc: TxnAdjacentDoc | null;
};

/** Only the keys that are set, `docId` dropped when empty. */
export function txnAdjacentParams(query: TxnAdjacentQuery): Record<string, string> {
  const params: Record<string, string> = {
    docType: query.docType,
    companyId: query.companyId,
    branchId: query.branchId,
    accYear: query.accYear,
    direction: query.direction,
  };
  for (const key of ["docId", "typeCode", "status", "fromDate", "toDate"] as const) {
    const value = (query[key] ?? "").trim();
    if (value) {
      params[key] = value;
    }
  }
  return params;
}

export const txnAdjacentApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTxnAdjacent: builder.mutation<TxnAdjacentPayload, TxnAdjacentQuery>({
      query: (query) => ({ url: TXN_ADJACENT_ENDPOINT, method: "GET", params: txnAdjacentParams(query) }),
      transformResponse: (payload: ApiSuccessResponse<TxnAdjacentPayload>) => ({
        docType: payload?.data?.docType,
        direction: payload?.data?.direction,
        fromDocId: payload?.data?.fromDocId ?? null,
        doc: payload?.data?.doc ?? null,
      }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetTxnAdjacentMutation } = txnAdjacentApi;
