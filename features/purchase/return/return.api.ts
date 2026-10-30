/**
 * Purchase Return — server endpoints, injected into the shared `baseApi`
 * (paths WITHOUT `/api/v1`). Every name is prefixed `purchaseReturn…`:
 * injected endpoints share one namespace.
 *
 * The reads are GET MUTATIONS, not queries: each is a one-shot read the screen
 * makes from its own handlers (and from the mount, to open a document), and a
 * query fired there either never starts (a lazy trigger in a mount effect) or
 * is handed a still-pending twin's promise (memory: RTK pending-query dedupe).
 * /validate is a POST that writes nothing.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  GODOWN_GET_ENDPOINT,
  PURCHASE_RETURN_CANCEL_ENDPOINT,
  PURCHASE_RETURN_GET_ENDPOINT,
  PURCHASE_RETURN_POST_ENDPOINT,
  PURCHASE_RETURN_SAVE_ENDPOINT,
  PURCHASE_RETURN_SOURCES_ENDPOINT,
  PURCHASE_RETURN_SOURCE_LINES_ENDPOINT,
  PURCHASE_RETURN_VALIDATE_ENDPOINT,
  STOCK_REASONS_LIST_ENDPOINT,
  type ReturnKind,
} from "./return.constants";
import type {
  ReturnPayload,
  ReturnSourceLinesView,
  ReturnSourceRow,
  ReturnValidateAnswer,
  SaveReturnBody,
  StockReasonWire,
} from "./return.types";

export const purchaseReturnApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** POST — create or update a DRAFT; `header.post` saves and posts in one call. */
    purchaseReturnSave: builder.mutation<ReturnPayload, SaveReturnBody>({
      query: (body) => ({ url: PURCHASE_RETURN_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReturnPayload>) => payload.data,
    }),
    /** POST — the rows' money, Credit to / Writes, the six totals, warnings / refusals; nothing saved. */
    purchaseReturnValidate: builder.mutation<ReturnValidateAnswer, SaveReturnBody>({
      query: (body) => ({ url: PURCHASE_RETURN_VALIDATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReturnValidateAnswer>) => payload.data,
    }),
    /** POST — a saved draft posted as it stands (no edit right needed, only POST). */
    purchaseReturnPost: builder.mutation<ReturnPayload, { prId: string; accYear: string }>({
      query: (body) => ({ url: PURCHASE_RETURN_POST_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReturnPayload>) => payload.data,
    }),
    /** GET — one return with its rows, lots, the six totals and each claim row's open amount. */
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
    /** GET — the company's Stock Reasons; the screen keeps the PURCHASE_RETURN set. */
    purchaseReturnReasons: builder.mutation<StockReasonWire[], { companyId: string }>({
      query: (params) => ({ url: STOCK_REASONS_LIST_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<StockReasonWire[]>) => (Array.isArray(payload?.data) ? payload.data : []),
    }),
    /** GET `?gdl_id=` — a godown's name. */
    purchaseReturnGodownName: builder.mutation<string, { gdl_id: string }>({
      query: (params) => ({ url: GODOWN_GET_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<{ gdl_name?: string | null }>) => String(payload?.data?.gdl_name ?? ""),
    }),
  }),
});

export const {
  usePurchaseReturnSaveMutation,
  usePurchaseReturnValidateMutation,
  usePurchaseReturnPostMutation,
  usePurchaseReturnGetMutation,
  usePurchaseReturnCancelMutation,
  usePurchaseReturnSourcesMutation,
  usePurchaseReturnSourceLinesMutation,
  usePurchaseReturnReasonsMutation,
  usePurchaseReturnGodownNameMutation,
} = purchaseReturnApi;
