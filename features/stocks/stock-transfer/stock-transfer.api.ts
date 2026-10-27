/**
 * Godown Transfer / Branch Outward — server endpoints, injected into the
 * shared `baseApi` (paths WITHOUT `/api/v1`). Every name is prefixed
 * `stockTransfer…`: injected endpoints share one namespace.
 *
 * The pickers (pick-stock, item by barcode) are Stock Adjustment's own routes
 * and are used through its hooks; nothing here caches a balance.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  STOCK_REASONS_ENDPOINT,
  STOCK_REASONS_LIST_ENDPOINT,
  STOCK_TRANSFER_CANCEL_ENDPOINT,
  STOCK_TRANSFER_DESPATCH_ENDPOINT,
  STOCK_TRANSFER_ENDPOINT,
  STOCK_TRANSFER_RECALL_ENDPOINT,
  STOCK_TRANSFER_SETTLE_SHORT_ENDPOINT,
  STOCK_TRANSFER_VALIDATE_ENDPOINT,
} from "./stock-transfer.constants";
import type {
  CancelTransferArgs,
  DespatchArgs,
  SaveTransferDto,
  SettleShortArgs,
  TransferDespatchResult,
  TransferDocKey,
  TransferPayload,
  TransferReasonRow,
  TransferSaveResult,
} from "./stock-transfer.types";

/** The four fields a stored document is addressed by, as the routes spell them. */
function refParams(key: TransferDocKey) {
  return { svhId: key.svhId, accYear: key.accYear, companyId: key.companyId, branchId: key.branchId };
}

export const stockTransferApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** POST — create or update a DRAFT (a full replace of the lines). No stock moves. */
    saveStockTransfer: builder.mutation<TransferSaveResult, SaveTransferDto>({
      query: (body) => ({ url: STOCK_TRANSFER_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<TransferSaveResult>) => payload.data,
    }),
    /** GET — one document with its transit rows. */
    getStockTransfer: builder.query<TransferPayload, TransferDocKey>({
      query: (key) => ({ url: STOCK_TRANSFER_ENDPOINT, params: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<TransferPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),
    /** GET validate — one row per line; problem null means clean. */
    validateStockTransfer: builder.query<{ lineNo: number; problem: string | null }[], TransferDocKey>({
      query: (key) => ({ url: STOCK_TRANSFER_VALIDATE_ENDPOINT, params: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<{ lineNo: number; problem: string | null }[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 0,
    }),
    /**
     * POST despatch — the saved draft, moved. Same branch: the OUT and IN rows
     * as a pair, POSTED. Another branch: the OUT row + a transit row per line,
     * IN_TRANSIT. The lorry rides along (written to the transit rows).
     */
    despatchStockTransfer: builder.mutation<TransferDespatchResult, DespatchArgs>({
      query: (args) => ({
        url: STOCK_TRANSFER_DESPATCH_ENDPOINT,
        method: "POST",
        body: {
          ...refParams(args),
          ...(args.lrNo ? { lrNo: args.lrNo } : {}),
          ...(args.vehicleNo ? { vehicleNo: args.vehicleNo } : {}),
          ...(args.expectedOn ? { expectedOn: args.expectedOn } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<TransferDespatchResult>) => payload.data,
    }),
    /** POST cancel — a same-branch POSTED transfer only (reversal rows). */
    cancelStockTransfer: builder.mutation<unknown, CancelTransferArgs>({
      query: (args) => ({
        url: STOCK_TRANSFER_CANCEL_ENDPOINT,
        method: "POST",
        body: { ...refParams(args), reason: args.reason },
      }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload.data,
    }),
    /** POST recall — an untouched branch despatch comes back (notes 160 B; menu 192 CANCEL). */
    recallStockTransfer: builder.mutation<unknown, CancelTransferArgs>({
      query: (args) => ({
        url: STOCK_TRANSFER_RECALL_ENDPOINT,
        method: "POST",
        body: { ...refParams(args), reason: args.reason },
      }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload.data,
    }),
    /** DELETE — soft delete a DRAFT. Load and delete share the one URL. */
    deleteStockTransfer: builder.mutation<unknown, TransferDocKey>({
      query: (key) => ({ url: STOCK_TRANSFER_ENDPOINT, method: "DELETE", params: refParams(key) }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload.data,
    }),
    /** POST settle-short — by the SENDING branch; the short stays on the loss report. */
    settleShortStockTransfer: builder.mutation<{ message?: string } | undefined, SettleShortArgs>({
      query: (body) => ({ url: STOCK_TRANSFER_SETTLE_SHORT_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload as { message?: string },
    }),
    /** The reasons a transfer may cite: BOTH-direction rows naming TRANSFER_OUT. */
    stockTransferReasons: builder.query<TransferReasonRow[], { companyId: string }>({
      query: ({ companyId }) => ({
        url: STOCK_REASONS_ENDPOINT,
        params: { companyId, voucherType: "TRANSFER_OUT" },
      }),
      transformResponse: (payload: ApiSuccessResponse<TransferReasonRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 60,
    }),
    /** Every reason of the company — where TRANSIT_LOSS (settle-short's) lives. */
    stockTransferReasonList: builder.query<TransferReasonRow[], { companyId: string }>({
      query: ({ companyId }) => ({ url: STOCK_REASONS_LIST_ENDPOINT, params: { companyId } }),
      transformResponse: (payload: ApiSuccessResponse<TransferReasonRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useSaveStockTransferMutation,
  useLazyGetStockTransferQuery,
  useLazyValidateStockTransferQuery,
  useDespatchStockTransferMutation,
  useCancelStockTransferMutation,
  useRecallStockTransferMutation,
  useDeleteStockTransferMutation,
  useSettleShortStockTransferMutation,
  useStockTransferReasonsQuery,
  useLazyStockTransferReasonListQuery,
} = stockTransferApi;
