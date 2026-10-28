/**
 * Purchase Return / claims — server endpoints, injected into the shared
 * `baseApi` (paths WITHOUT `/api/v1`). Every name is prefixed
 * `purchaseReturn…` / `purchaseClaims…`: injected endpoints share one namespace.
 *
 * The reads are GET MUTATIONS, not queries: each is a one-shot read the screen
 * makes from its own handlers (and from the mount, to open a document), and a
 * query fired there either never starts (a lazy trigger in a mount effect) or
 * is handed a still-pending twin's promise (memory: RTK pending-query dedupe).
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  PURCHASE_CLAIMS_OPEN_ENDPOINT,
  PURCHASE_CLAIMS_SETTLE_ENDPOINT,
  PURCHASE_CLAIMS_SETTLE_UNDO_ENDPOINT,
  PURCHASE_RETURN_CANCEL_ENDPOINT,
  PURCHASE_RETURN_GET_ENDPOINT,
  PURCHASE_RETURN_POST_ENDPOINT,
  PURCHASE_RETURN_SAVE_ENDPOINT,
  PURCHASE_RETURN_SOURCES_ENDPOINT,
  PURCHASE_RETURN_SOURCE_LINES_ENDPOINT,
  type ReturnKind,
} from "./return.constants";
import type {
  OpenClaimWire,
  ReturnPayload,
  ReturnSourceLinesView,
  ReturnSourceRow,
  SaveReturnBody,
  SettleClaimBody,
  SettleUndoBody,
} from "./return.types";

/** The answer's own sentence too — Claims shows it ("Claim settled — PCL/…"). */
export type SettleAnswer = { message: string };

export const purchaseReturnApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** POST — create or update a DRAFT; `header.post` saves and posts in one call. */
    purchaseReturnSave: builder.mutation<ReturnPayload, SaveReturnBody>({
      query: (body) => ({ url: PURCHASE_RETURN_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReturnPayload>) => payload.data,
    }),
    /** POST — a saved draft posted as it stands (no edit right needed, only POST). */
    purchaseReturnPost: builder.mutation<ReturnPayload, { prId: string; accYear: string }>({
      query: (body) => ({ url: PURCHASE_RETURN_POST_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReturnPayload>) => payload.data,
    }),
    /** GET — one return with its rows, lots and each claim row's open amount. */
    purchaseReturnGet: builder.mutation<ReturnPayload, { prId: string; accYear: string }>({
      query: (params) => ({ url: PURCHASE_RETURN_GET_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<ReturnPayload>) => payload.data,
    }),
    /** POST — a draft, or a posted return whose debit is unadjusted and no claim settled. */
    purchaseReturnCancel: builder.mutation<ReturnPayload, { prId: string; accYear: string; reason: string }>({
      query: (body) => ({ url: PURCHASE_RETURN_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReturnPayload>) => payload.data,
    }),
    /** GET — a supplier's posted bills (or GRNs), newest first. */
    purchaseReturnSources: builder.mutation<
      ReturnSourceRow[],
      { companyId: string; branchId: string; supplierId: string; kind: ReturnKind }
    >({
      query: (params) => ({ url: PURCHASE_RETURN_SOURCES_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<ReturnSourceRow[]>) => (Array.isArray(payload?.data) ? payload.data : []),
    }),
    /** GET — the bill's / GRN's lines: came in, already returned, returnable, per-unit money, lots. */
    purchaseReturnSourceLines: builder.mutation<
      ReturnSourceLinesView,
      { kind: ReturnKind; srcDocId: string; srcAccYear: string; exceptPrId?: string }
    >({
      query: (params) => ({ url: PURCHASE_RETURN_SOURCE_LINES_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<ReturnSourceLinesView>) => payload.data,
    }),
    /** GET — the claim rows of posted returns, with value, settled and open. */
    purchaseClaimsOpen: builder.mutation<OpenClaimWire[], { companyId: string; branchId: string; supplierId?: string }>({
      query: (params) => ({ url: PURCHASE_CLAIMS_OPEN_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<OpenClaimWire[]>) => (Array.isArray(payload?.data) ? payload.data : []),
    }),
    /** POST — CREDIT (the party's credit note), SHORT_SETTLED (the rest written off) or REJECTED. */
    purchaseClaimsSettle: builder.mutation<SettleAnswer, SettleClaimBody>({
      query: (body) => ({ url: PURCHASE_CLAIMS_SETTLE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => ({ message: String(payload?.message ?? "") }),
    }),
    /** POST — a reversing settlement row; the voucher reversed. */
    purchaseClaimsSettleUndo: builder.mutation<SettleAnswer, SettleUndoBody>({
      query: (body) => ({ url: PURCHASE_CLAIMS_SETTLE_UNDO_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => ({ message: String(payload?.message ?? "") }),
    }),
  }),
});

export const {
  usePurchaseReturnSaveMutation,
  usePurchaseReturnPostMutation,
  usePurchaseReturnGetMutation,
  usePurchaseReturnCancelMutation,
  usePurchaseReturnSourcesMutation,
  usePurchaseReturnSourceLinesMutation,
  usePurchaseClaimsOpenMutation,
  usePurchaseClaimsSettleMutation,
  usePurchaseClaimsSettleUndoMutation,
} = purchaseReturnApi;
