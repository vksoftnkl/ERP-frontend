/**
 * The shared purchase dialogs' routes (paths WITHOUT `/api/v1`): the F12
 * dialog's pick-lists, Ctrl+A attachments (ENT-26, server
 * purchase/attachment/purchase-attachment.ts) and the labels of a posted GRN /
 * bill (ENT-21, GET /purchase/labels/from-doc).
 *
 * Reads that must never come from a cache (a file, a pick-list page walked in a
 * loop) are GET mutations — never deduped onto an earlier pending read (memory:
 * RTK pending-query dedupe + abort).
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type { PurchaseAttachDocType, PurchaseLabelDocType } from "./purchase-dialogs.types";

export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
/** `/dropdown-details/run` caps a page at 100. */
export const PICK_LIST_PAGE_SIZE = 100;

export type PickListPageArgs = {
  dropdownId: string;
  page: number;
  /** The dropdown's bound params (`dropdown_param`), e.g. `{ ibranch_id }`. */
  params: Record<string, string>;
};

export type TxnAttachment = {
  tatId: string;
  accYear: string;
  pageNo: number;
  fileName: string;
  mime: string;
  size: number;
  caption: string | null;
  createdOn: string;
  createdBy: string | null;
};

export type TxnAttachmentFile = { tatId: string; fileName: string; mime: string; contentBase64: string };

export type UploadTxnAttachmentArgs = {
  companyId: string;
  branchId: string;
  accYear: string;
  docType: PurchaseAttachDocType;
  docId: string;
  fileName: string;
  mime: string;
  caption?: string;
  contentBase64: string;
};

/** One label row (one per SALEABLE allocation row). Numbers may arrive as strings. */
export type PurchaseLabelRow = {
  rowId: string;
  lineNo: number | string | null;
  rowNo: number | string | null;
  itemId: string;
  itemName: string | null;
  unitName: string | null;
  barcode: string | null;
  batchNo: string | null;
  ean: string | null;
  mrp: number | string | null;
  price: number | string | null;
  size: string | null;
  colour: string | null;
  model: string | null;
  expiryDate: string | null;
  qty: number | string | null;
  companyName: string | null;
  copies: number;
  textile: boolean;
};

function rowsOf<T>(payload: ApiSuccessResponse<unknown> | undefined): T[] {
  const data = payload?.data as unknown;
  return Array.isArray(data) ? (data.filter((row) => typeof row === "object" && row !== null) as T[]) : [];
}

export const purchaseDialogsApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** One page of a configured dropdown — `items` rows by SQL alias. */
    purchasePickListPage: builder.mutation<Record<string, unknown>[], PickListPageArgs>({
      query: ({ dropdownId, page, params }) => ({
        url: DROPDOWN_RUN_ENDPOINT,
        method: "GET",
        params: {
          dropdown_id: dropdownId,
          page,
          limit: PICK_LIST_PAGE_SIZE,
          dropdown_param: JSON.stringify(params),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ items?: unknown } | null>) => {
        const items = payload?.data?.items;
        return Array.isArray(items)
          ? items.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
          : [];
      },
    }),

    /** The attachments of a document, without their files. */
    purchaseAttachmentList: builder.mutation<TxnAttachment[], { docType: PurchaseAttachDocType; docId: string }>({
      query: (params) => ({ url: "/txn-attachments", method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => rowsOf<TxnAttachment>(payload),
    }),

    /** One attachment with its file, base64. */
    purchaseAttachmentFile: builder.mutation<TxnAttachmentFile, { tatId: string; accYear: string }>({
      query: (params) => ({ url: "/txn-attachments/file", method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<TxnAttachmentFile>) => payload.data,
    }),

    /** Attach a file (pdf / jpeg / png / webp, at most 5 MB decoded). */
    purchaseAttachmentUpload: builder.mutation<{ tatId: string; pageNo: number }, UploadTxnAttachmentArgs>({
      query: (body) => ({ url: "/txn-attachments/upload", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<{ tatId: string; pageNo: number }>) => payload.data,
    }),

    /** Remove an attachment (soft delete). */
    purchaseAttachmentDelete: builder.mutation<unknown, { tatId: string; accYear: string }>({
      query: (body) => ({ url: "/txn-attachments/delete", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => payload?.data,
    }),

    /** The labels of a posted GRN / bill — copies = received + free. */
    purchaseLabelsFromDoc: builder.mutation<PurchaseLabelRow[], { docType: PurchaseLabelDocType; docId: string; accYear: string }>({
      query: (params) => ({ url: "/purchase/labels/from-doc", method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => rowsOf<PurchaseLabelRow>(payload),
    }),
  }),
});

export const {
  usePurchasePickListPageMutation,
  usePurchaseAttachmentListMutation,
  usePurchaseAttachmentFileMutation,
  usePurchaseAttachmentUploadMutation,
  usePurchaseAttachmentDeleteMutation,
  usePurchaseLabelsFromDocMutation,
} = purchaseDialogsApi;
