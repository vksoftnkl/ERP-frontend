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
  SHORTAGE_CLOSE_ENDPOINT,
  SHORTAGE_ITEM_LOOKUP_ENDPOINT,
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
  ShortageItemLookup,
  ShortageReceiptPayload,
} from "./shortage.types";

export type OpenShortagesArgs = { companyId: string; branchId: string; supplierId: string; all?: "true" };
export type ShortageReceiptRef = { psrId: string; accYear: string };
export type ShortageItemLookupArgs = {
  companyId: string;
  branchId: string;
  itemId: string;
  uomId?: string;
  onDate: string;
  godownId?: string;
};

/** A write's answer: the data and the server's own sentence. */
export type WithMessage<T> = { data: T; message: string };

function withMessage<T>(payload: ApiSuccessResponse<T>): WithMessage<T> {
  return { data: payload.data, message: typeof payload.message === "string" ? payload.message : "" };
}

export const shortageReceiptApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** The supplier's shortages with qty still open (`all=true`: every one, for a reopened receipt's figures). */
    shortageReceiptOpen: builder.mutation<OpenShortageRow[], OpenShortagesArgs>({
      query: (params) => ({ url: SHORTAGE_OPEN_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<OpenShortageRow[]>) =>
        Array.isArray(payload?.data) ? payload.data : [],
    }),
    /** One receipt with its lines (godownName / receivedBy / supervisorName / allocs included). */
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
    /** Close a shortage without goods — SUPPLIER_CN, CLAIM (on a transporter / insurer) or WRITE_OFF. */
    shortageReceiptClose: builder.mutation<WithMessage<CloseShortageResult>, CloseShortageDto>({
      query: (body) => ({ url: SHORTAGE_CLOSE_ENDPOINT, method: "POST", body }),
      transformResponse: withMessage<CloseShortageResult>,
    }),
    /** The item's tracking signature (R = serials) — F12 opens in serial mode. */
    shortageReceiptItemLookup: builder.mutation<ShortageItemLookup, ShortageItemLookupArgs>({
      query: ({ uomId, godownId, ...rest }) => ({
        url: SHORTAGE_ITEM_LOOKUP_ENDPOINT,
        method: "GET",
        params: { ...rest, ...(uomId ? { uomId } : {}), ...(godownId ? { godownId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<ShortageItemLookup>) => payload?.data ?? {},
    }),
  }),
});

export const {
  useShortageReceiptOpenMutation,
  useShortageReceiptGetMutation,
  useShortageReceiptSaveMutation,
  useShortageReceiptCancelMutation,
  useShortageReceiptCloseMutation,
  useShortageReceiptItemLookupMutation,
} = shortageReceiptApi;
