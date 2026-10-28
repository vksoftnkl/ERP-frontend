/**
 * Shortage Receipt — server endpoints, injected into the shared `baseApi`
 * (paths WITHOUT `/api/v1`). Every name is prefixed `shortageReceipt…`:
 * injected endpoints share one namespace.
 *
 * Nothing is cached. What is still open moves with every receipt, close and
 * undo — another desk's included — so the reads are GET mutations: never
 * deduped onto an earlier pending read, never served stale.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import {
  DROPDOWN_RUN_ENDPOINT,
  SHORTAGE_CLOSE_ENDPOINT,
  SHORTAGE_CLOSE_UNDO_ENDPOINT,
  SHORTAGE_CLOSES_ENDPOINT,
  SHORTAGE_OPEN_ENDPOINT,
  SHORTAGE_RECEIPT_CANCEL_ENDPOINT,
  SHORTAGE_RECEIPT_GET_ENDPOINT,
  SHORTAGE_RECEIPT_SAVE_ENDPOINT,
} from "./shortage.constants";
import type {
  CloseShortageDto,
  CloseShortageResult,
  OpenShortageRow,
  SaveShortageReceiptDto,
  ShortageCloseRow,
  ShortageReceiptPayload,
} from "./shortage.types";

export type OpenShortagesArgs = { companyId: string; branchId: string; supplierId: string };
export type ShortageReceiptRef = { psrId: string; accYear: string };
export type DropdownRowsArgs = { dropdownId: string; params: Record<string, string> };

/** A write's answer: the data and the server's own sentence. */
export type WithMessage<T> = { data: T; message: string };

function withMessage<T>(payload: ApiSuccessResponse<T>): WithMessage<T> {
  return { data: payload.data, message: typeof payload.message === "string" ? payload.message : "" };
}

export const shortageReceiptApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** The supplier's shortages with qty still open. */
    shortageReceiptOpen: builder.mutation<OpenShortageRow[], OpenShortagesArgs>({
      query: (params) => ({ url: SHORTAGE_OPEN_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<OpenShortageRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** One receipt with its lines. */
    shortageReceiptGet: builder.mutation<ShortageReceiptPayload, ShortageReceiptRef>({
      query: (params) => ({ url: SHORTAGE_RECEIPT_GET_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<ShortageReceiptPayload>) => payload.data,
    }),
    /** Save a draft; `header.post` saves and posts in one transaction. Answers the receipt. */
    shortageReceiptSave: builder.mutation<WithMessage<ShortageReceiptPayload>, SaveShortageReceiptDto>({
      query: (body) => ({ url: SHORTAGE_RECEIPT_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: withMessage<ShortageReceiptPayload>,
    }),
    /** Cancel a draft or a posted receipt: stock out, voucher reversed, the shortage open again. */
    shortageReceiptCancel: builder.mutation<
      WithMessage<ShortageReceiptPayload>,
      ShortageReceiptRef & { reason: string }
    >({
      query: (body) => ({ url: SHORTAGE_RECEIPT_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: withMessage<ShortageReceiptPayload>,
    }),
    /** Close a shortage without goods — SUPPLIER_CN or WRITE_OFF; the whole open qty. */
    shortageReceiptClose: builder.mutation<WithMessage<CloseShortageResult>, CloseShortageDto>({
      query: (body) => ({ url: SHORTAGE_CLOSE_ENDPOINT, method: "POST", body }),
      transformResponse: withMessage<CloseShortageResult>,
    }),
    /** The shortage's closes that still stand, newest first. */
    shortageReceiptCloses: builder.mutation<ShortageCloseRow[], { shortageId: string }>({
      query: (params) => ({ url: SHORTAGE_CLOSES_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<ShortageCloseRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** Undo one close: a reversing row, its voucher reversed. */
    shortageReceiptCloseUndo: builder.mutation<
      WithMessage<unknown>,
      { closeId: string; accYear: string; reason: string }
    >({
      query: (body) => ({ url: SHORTAGE_CLOSE_UNDO_ENDPOINT, method: "POST", body }),
      transformResponse: withMessage<unknown>,
    }),
    /**
     * One page of a configured dropdown — the names a saved receipt does not
     * carry (its godown, who unloaded it).
     */
    shortageReceiptDropdownRows: builder.mutation<Record<string, unknown>[], DropdownRowsArgs>({
      query: ({ dropdownId, params }) => ({
        url: DROPDOWN_RUN_ENDPOINT,
        method: "GET",
        params: { dropdown_id: dropdownId, page: 1, limit: 100, dropdown_param: JSON.stringify(params) },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ items?: unknown } | unknown[]>) => {
        const data = payload?.data as { items?: unknown } | unknown[] | undefined;
        const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        return items as Record<string, unknown>[];
      },
    }),
  }),
});

export const {
  useShortageReceiptOpenMutation,
  useShortageReceiptGetMutation,
  useShortageReceiptSaveMutation,
  useShortageReceiptCancelMutation,
  useShortageReceiptCloseMutation,
  useShortageReceiptClosesMutation,
  useShortageReceiptCloseUndoMutation,
  useShortageReceiptDropdownRowsMutation,
} = shortageReceiptApi;
