/**
 * Bill-wise Payment (menu 100) — server endpoints.
 *
 * `/payments` is `/receipts` mirrored route for route: the same avh-prefixed
 * four keys, the same `{ data: … }` envelope (unwrapped here, once, by
 * `transformResponse`), and the same two routes left out for the same reasons
 * (`receiptApi.ts` says why): `PUT /update-header`, because a posted payment
 * is corrected by `/amend` under its optimistic lock, and the PDC sweep, which
 * the receipt's sweep already runs for payments too.
 *
 * Two reads are shared with the receipt rather than repeated: the party's
 * contact (`/account-ledger-masters/get`) and F7's settlement history (grid
 * 112, which reads `acc_bill_adjustment` whichever side the bill is on).
 *
 * ── Every request body is whitelisted ────────────────────────────────────
 * `forbidNonWhitelisted: true`. `mobile` on `/open-items`, `tdSurcharge*`,
 * `tdAuthCode`, `tdCardLast4` and `cheque.bankLedgerId` — all fine on a
 * receipt — are 400s here.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type {
  AdjacentVoucherPayload,
  AmendPaymentBody,
  CancelPaymentBody,
  ChequeBooksPayload,
  DuplicateCheckPayload,
  PaymentAmendPayload,
  PaymentCancelPayload,
  PaymentDeletePayload,
  PaymentDraftPayload,
  PaymentKeys,
  PaymentOpenItemsPayload,
  PaymentPartyContextPayload,
  PaymentPayload,
  PaymentPostPayload,
  PostPaymentBody,
  SaveDraftPaymentBody,
} from "@/features/accounts/payment/payment.types";

const OPEN_ITEMS_ENDPOINT = "/payments/open-items";
const PARTY_CONTEXT_ENDPOINT = "/payments/party-context";
const GET_ENDPOINT = "/payments/get";
const CREATE_ENDPOINT = "/payments/create";
const POST_ENDPOINT = "/payments/post";
const AMEND_ENDPOINT = "/payments/amend";
const CANCEL_ENDPOINT = "/payments/cancel";
const DELETE_ENDPOINT = "/payments/delete";
const ADJACENT_ENDPOINT = "/payments/adjacent";
const DUPLICATE_CHECK_ENDPOINT = "/payments/duplicate-check";
const CHEQUE_BOOKS_ENDPOINT = "/vouchers/cheque-books";
const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** One row of grid 123, "MAIN LIST - PAYMENTS", under its SQL's own names. */
export type PaymentListRow = {
  avh_voucher_id: string;
  avh_company_id: string;
  avh_branch_id: string;
  avh_acc_year: string;
  avh_voucher_refno: string | null;
  avh_voucher_date: string;
  party_name: string | null;
  avh_doc_amount: number | string;
  avh_adjust_amount: number | string;
  on_account_amount: number | string;
  instruments: string | null;
  pdc_count: number | string;
  avh_voucher_status: string;
};

export type PaymentListQuery = {
  companyId: string;
  branchId: string;
  accYear: string;
  /** "" = every status — an unbound token fails the WHOLE query, so it is always sent. */
  status?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
};

export const paymentApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /**
     * The payee's open items: what we owe, what they hold of ours, and the
     * party's TDS and bank facts. `onDate` is the PAYMENT's date — it ages the
     * cash discount, measures what is overdue, picks the TDS rate in force and
     * the TDS year. No `mobile`: that is a receipt's temp-credit filter, and a
     * 400 here.
     */
    getPaymentOpenItems: builder.query<
      PaymentOpenItemsPayload,
      { partyId: string; companyId: string; onDate?: string }
    >({
      query: ({ partyId, companyId, onDate }) => ({
        url: OPEN_ITEMS_ENDPOINT,
        params: { partyId, companyId, ...(onDate ? { onDate } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<PaymentOpenItemsPayload>) => payload.data,
      providesTags: ["Payment"],
      keepUnusedDataFor: 15,
    }),

    /** The two context panels and the party-wide figures. A failure is silent. */
    getPaymentPartyContext: builder.query<
      PaymentPartyContextPayload,
      { partyId: string; companyId: string }
    >({
      query: (params) => ({ url: PARTY_CONTEXT_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<PaymentPartyContextPayload>) => payload.data,
      providesTags: ["Payment"],
      keepUnusedDataFor: 15,
    }),

    /** One payment, by its four keys. */
    getPayment: builder.query<PaymentPayload, PaymentKeys>({
      query: (params) => ({ url: GET_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<PaymentPayload>) => payload.data,
      providesTags: ["Payment"],
      keepUnusedDataFor: 0,
    }),

    /** Save the draft — the body IS the document. The id is at `data.header`. */
    savePaymentDraft: builder.mutation<PaymentDraftPayload, SaveDraftPaymentBody>({
      query: (body) => ({ url: CREATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PaymentDraftPayload>) => payload.data,
      invalidatesTags: ["Payment"],
    }),

    /** Post it. The number is at `data.header`; `cheques[]` is the leaves taken. */
    postPayment: builder.mutation<PaymentPostPayload, PostPaymentBody>({
      query: (body) => ({ url: POST_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PaymentPostPayload>) => payload.data,
      invalidatesTags: ["Payment"],
    }),

    /** Restate a POSTED payment in place. It keeps its number; a cheque takes a new leaf. */
    amendPayment: builder.mutation<PaymentAmendPayload, AmendPaymentBody>({
      query: (body) => ({ url: AMEND_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PaymentAmendPayload>) => payload.data,
      invalidatesTags: ["Payment"],
    }),

    /** POSTED only, with a reason. A HELD cheque is cancelled; its leaf stays used. */
    cancelPayment: builder.mutation<PaymentCancelPayload, CancelPaymentBody>({
      query: (body) => ({ url: CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PaymentCancelPayload>) => payload.data,
      invalidatesTags: ["Payment"],
    }),

    /** DRAFT only — the four keys and nothing else. */
    deletePaymentDraft: builder.mutation<PaymentDeletePayload, PaymentKeys>({
      query: (body) => ({ url: DELETE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<PaymentDeletePayload>) => payload.data,
      invalidatesTags: ["Payment"],
    }),

    /** The neighbour in the register — keys WITHOUT the avh prefix on this route. */
    getAdjacentPayment: builder.query<
      AdjacentVoucherPayload,
      {
        voucherId: string;
        companyId: string;
        branchId: string;
        accYear: string;
        direction: "prev" | "next";
        status?: string;
        fromDate?: string;
        toDate?: string;
      }
    >({
      query: ({ status, fromDate, toDate, ...keys }) => ({
        url: ADJACENT_ENDPOINT,
        params: {
          ...keys,
          ...(status ? { status } : {}),
          ...(fromDate ? { fromDate } : {}),
          ...(toDate ? { toDate } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<AdjacentVoucherPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** "Have we already paid this party this much today?" A warning, never a refusal. */
    checkDuplicatePayment: builder.query<
      DuplicateCheckPayload,
      {
        partyId: string;
        companyId: string;
        accYear: string;
        voucherDate: string;
        amount: number;
        branchId?: string;
        excludeVoucherId?: string;
      }
    >({
      query: ({ branchId, excludeVoucherId, ...rest }) => ({
        url: DUPLICATE_CHECK_ENDPOINT,
        params: {
          ...rest,
          ...(branchId ? { branchId } : {}),
          ...(excludeVoucherId ? { excludeVoucherId } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<DuplicateCheckPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /**
     * The books a payment cheque may be written from — active, with a leaf
     * left. Read once per company; a failure leaves the F4 dialog saying no
     * book is open, which is the truth as far as this screen can tell.
     */
    getOpenChequeBooks: builder.query<ChequeBooksPayload, { companyId: string; branchId?: string }>(
      {
        query: ({ companyId, branchId }) => ({
          url: CHEQUE_BOOKS_ENDPOINT,
          params: { companyId, ...(branchId ? { branchId } : {}) },
        }),
        transformResponse: (payload: ApiSuccessResponse<ChequeBooksPayload>) => payload.data,
        providesTags: ["Payment"],
        keepUnusedDataFor: 60,
      },
    ),

    /**
     * The register (F8) — grid 123. All six tokens, always; `iavh_status` as
     * "" for every status.
     */
    listPayments: builder.query<ConfiguredGridPage<PaymentListRow>, PaymentListQuery>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("paymentList"),
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          grid_param: JSON.stringify({
            iavh_company_id: params.companyId,
            iavh_branch_id: params.branchId,
            iavh_acc_year: params.accYear,
            iavh_status: params.status ?? "",
            ifrom_date: params.fromDate ?? "",
            ito_date: params.toDate ?? "",
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<PaymentListRow>>) =>
        payload.data,
      providesTags: ["Payment"],
      keepUnusedDataFor: 15,
    }),
  }),
});

export const {
  useSavePaymentDraftMutation,
  usePostPaymentMutation,
  useAmendPaymentMutation,
  useCancelPaymentMutation,
  useDeletePaymentDraftMutation,
  useGetOpenChequeBooksQuery,
  useListPaymentsQuery,
} = paymentApi;
