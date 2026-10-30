/**
 * Supplier Dues (menu 297) — server routes, injected into the shared `baseApi`
 * (paths WITHOUT `/api/v1`; endpoint names prefixed `supplierDues…`). Every
 * read is a GET-mutation: one-shot, abortable, nothing cached.
 * The shortage closes run on menu 195's rights (Shortage Receipt) and are
 * exported for that screen too.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ShortageCloseBody } from "./shortage-close";
import type {
  DuesSettleAnswer,
  DuesSettleBody,
  DuesSettleUndoBody,
  ShortageCloseUndoBody,
  SupplierDuesQuery,
  SupplierDuesWire,
  WithMessage,
} from "./supplier-dues.types";

export const SUPPLIER_DUES_OPEN_ENDPOINT = "/purchase/supplier-dues/open";
export const SUPPLIER_DUES_SETTLE_ENDPOINT = "/purchase/supplier-dues/settle";
export const SUPPLIER_DUES_SETTLE_UNDO_ENDPOINT = "/purchase/supplier-dues/settle-undo";
export const SHORTAGES_CLOSE_ENDPOINT = "/purchase/shortages/close";
export const SHORTAGES_CLOSE_UNDO_ENDPOINT = "/purchase/shortages/close-undo";

/** One row's close: the dialog's body + the row's keys. */
export type CloseShortageRequest = ShortageCloseBody & { shortageId: string; accYear: string; deviceId: string };

function withMessage<T>(payload: ApiSuccessResponse<T>): WithMessage<T> {
  return { data: payload?.data as T, message: typeof payload?.message === "string" ? payload.message : "" };
}

export const supplierDuesApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    supplierDuesOpen: builder.mutation<SupplierDuesWire, SupplierDuesQuery>({
      query: (params) => ({ url: SUPPLIER_DUES_OPEN_ENDPOINT, method: "GET", params }),
      transformResponse: (payload: ApiSuccessResponse<SupplierDuesWire>) => payload?.data,
    }),
    /** dryRun: true = "What Settle writes" (View right); false = settle (Post right). */
    supplierDuesSettle: builder.mutation<WithMessage<DuesSettleAnswer>, DuesSettleBody>({
      query: (body) => ({ url: SUPPLIER_DUES_SETTLE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<DuesSettleAnswer>) => withMessage(payload),
    }),
    supplierDuesSettleUndo: builder.mutation<WithMessage<unknown>, DuesSettleUndoBody>({
      query: (body) => ({ url: SUPPLIER_DUES_SETTLE_UNDO_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => withMessage(payload),
    }),
    supplierDuesCloseShortage: builder.mutation<WithMessage<unknown>, CloseShortageRequest>({
      query: (body) => ({ url: SHORTAGES_CLOSE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => withMessage(payload),
    }),
    supplierDuesCloseUndo: builder.mutation<WithMessage<unknown>, ShortageCloseUndoBody>({
      query: (body) => ({ url: SHORTAGES_CLOSE_UNDO_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => withMessage(payload),
    }),
  }),
});

export const {
  useSupplierDuesOpenMutation,
  useSupplierDuesSettleMutation,
  useSupplierDuesSettleUndoMutation,
  useSupplierDuesCloseShortageMutation,
  useSupplierDuesCloseUndoMutation,
} = supplierDuesApi;
