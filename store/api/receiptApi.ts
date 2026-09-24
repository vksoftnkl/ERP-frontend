/**
 * Receipt Entry (menu 99) — server endpoints.
 *
 * ── The envelope ─────────────────────────────────────────────────────────
 * Every route answers `{ data: … }` and `transformResponse` unwraps it here,
 * once. Nothing else in the feature touches a response: `payload/parse.ts`
 * reads what comes out of these, and it says why in as many words.
 *
 * ── Two routes are deliberately absent ───────────────────────────────────
 * `PUT /update-header` — the Qt screen does not use it and neither does this
 * one. A posted receipt's header is corrected by `/amend`, which carries the
 * whole document under an optimistic lock; a second way to edit a posted
 * header is a second way for two clients to disagree about one.
 *
 * `POST /regularise-pdc` — a daily sweep's route. It matures post-dated
 * cheques across a whole company, which is not something an operator does
 * from the receipt they happen to have open.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type {
  AdjacentVoucherPayload,
  AmendReceiptBody,
  CancelReceiptBody,
  DuplicateCheckPayload,
  OpenItemsPayload,
  PartyContextPayload,
  PostReceiptBody,
  ReceiptAmendPayload,
  ReceiptCancelPayload,
  ReceiptDeletePayload,
  ReceiptDraftPayload,
  ReceiptKeys,
  ReceiptPayload,
  ReceiptPostPayload,
  SaveDraftReceiptBody,
} from "@/features/accounts/receipt/receipt.types";

const OPEN_ITEMS_ENDPOINT = "/receipts/open-items";
const PARTY_CONTEXT_ENDPOINT = "/receipts/party-context";
const GET_ENDPOINT = "/receipts/get";
const CREATE_ENDPOINT = "/receipts/create";
const POST_ENDPOINT = "/receipts/post";
const AMEND_ENDPOINT = "/receipts/amend";
const CANCEL_ENDPOINT = "/receipts/cancel";
const DELETE_ENDPOINT = "/receipts/delete";
const ADJACENT_ENDPOINT = "/receipts/adjacent";
const DUPLICATE_CHECK_ENDPOINT = "/receipts/duplicate-check";
const LEDGER_GET_ENDPOINT = "/account-ledger-masters/get";
const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** One row of grid 108, "MAIN LIST - RECEIPTS", under its SQL's own names. */
export type ReceiptListRow = {
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
  avh_usr_refno: string | null;
  avh_remarks: string | null;
  reversal_refno: string | null;
  avh_created_by: string | null;
  avh_created_on: string;
};

export type ReceiptListQuery = {
  companyId: string;
  branchId: string;
  accYear: string;
  /** "" = every status. NOT modelled as "send nothing" — see below. */
  status?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
};

/** One row of grid 112, "POPUP - BILL PAYMENT HISTORY". */
export type BillPaymentHistoryRow = Record<string, unknown>;

/** One row of grid 62, "MAIN LIST - COMPUTER USERS" — the approver picker. */
export type ApproverRow = {
  usr_id: string;
  usr_login_name: string | null;
  usr_display_name: string | null;
  usr_full_name: string | null;
  usr_is_active: boolean | null;
};

/** One row of grid 111, "POPUP - BANKS". */
export type BankPickerRow = {
  bnk_id: string;
  bnk_name: string;
  bnk_short_name: string | null;
  bnk_rbi_code: string | null;
};

/** What `/account-ledger-masters/get` adds that `/open-items` does not carry. */
export type LedgerContact = {
  ledId: string;
  ledName: string;
  ledMobile?: string | null;
  ledPhone?: string | null;
  ledAddress1?: string | null;
  ledAddress2?: string | null;
  ledCity?: string | null;
};

export const receiptApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /**
     * The party's open items.
     *
     * `onDate` is the RECEIPT's date, not today: it is what `ppdSuggested` is
     * aged against and what `daysOverdue` is measured to, so a receipt keyed
     * for last Friday must send last Friday or it is offered a discount the
     * customer has lost. It is NOT an as-of filter — no bill is hidden by it.
     *
     * There is no branch and no accounting year on this route on purpose:
     * `acc_bill_balance` is partitioned by the year a bill ORIGINATED in and is
     * never carried forward, and a customer pays one cheque for bills raised at
     * three branches.
     */
    getReceiptOpenItems: builder.query<
      OpenItemsPayload,
      { partyId: string; companyId: string; onDate?: string }
    >({
      query: ({ partyId, companyId, onDate }) => ({
        url: OPEN_ITEMS_ENDPOINT,
        params: { partyId, companyId, ...(onDate ? { onDate } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<OpenItemsPayload>) => payload.data,
      providesTags: ["Receipt"],
      // Somebody else may have posted against these bills a minute ago, and
      // the screen re-reads on F5 anyway.
      keepUnusedDataFor: 15,
    }),

    /**
     * The two context panels and the three party-wide figures.
     *
     * A failure here is SILENT at the screen: these are context, not truth,
     * and a receipt can be taken without them.
     */
    getReceiptPartyContext: builder.query<
      PartyContextPayload,
      { partyId: string; companyId: string }
    >({
      query: (params) => ({ url: PARTY_CONTEXT_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<PartyContextPayload>) => payload.data,
      providesTags: ["Receipt"],
      keepUnusedDataFor: 15,
    }),

    /** One receipt, by its four keys. Never by a bare id. */
    getReceipt: builder.query<ReceiptPayload, ReceiptKeys>({
      query: (params) => ({ url: GET_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<ReceiptPayload>) => payload.data,
      providesTags: ["Receipt"],
      keepUnusedDataFor: 0,
    }),

    /**
     * Save the draft. `replace: true` — the body IS the document, and anything
     * absent from it is gone.
     *
     * The new id is at `data.header.avhVoucherId`. Read one level too shallow
     * it comes back empty and `/post` then complains that `avhVoucherId` must
     * be a valid UUID, which points at the wrong route entirely.
     */
    saveReceiptDraft: builder.mutation<ReceiptDraftPayload, SaveDraftReceiptBody>({
      query: (body) => ({ url: CREATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReceiptDraftPayload>) => payload.data,
      invalidatesTags: ["Receipt"],
    }),

    /** Post it. The number is at `data.header.avhVoucherRefno`. */
    postReceipt: builder.mutation<ReceiptPostPayload, PostReceiptBody>({
      query: (body) => ({ url: POST_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReceiptPostPayload>) => payload.data,
      invalidatesTags: ["Receipt"],
    }),

    /** R20 — restate a POSTED receipt in place. It keeps its number. */
    amendReceipt: builder.mutation<ReceiptAmendPayload, AmendReceiptBody>({
      query: (body) => ({ url: AMEND_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReceiptAmendPayload>) => payload.data,
      invalidatesTags: ["Receipt"],
    }),

    /** POSTED only, and the reason is required — `ck_avh_cancel` insists. */
    cancelReceipt: builder.mutation<ReceiptCancelPayload, CancelReceiptBody>({
      query: (body) => ({ url: CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReceiptCancelPayload>) => payload.data,
      invalidatesTags: ["Receipt"],
    }),

    /**
     * DRAFT only. The four keys and nothing else: a draft took no number,
     * moved no bill and wrote no leg, so there is no reason to justify and
     * nothing to reverse.
     */
    deleteReceiptDraft: builder.mutation<ReceiptDeletePayload, ReceiptKeys>({
      query: (body) => ({ url: DELETE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ReceiptDeletePayload>) => payload.data,
      invalidatesTags: ["Receipt"],
    }),

    /**
     * The neighbour in the register. **The keys are spelt WITHOUT the `avh`
     * prefix on this route and on `/duplicate-check`** — that is their
     * spelling, not a second concept.
     *
     * The register's own filters travel with the walk, so it follows the list
     * the operator was looking at: a walk that landed on a draft a
     * POSTED-filtered register does not show is a bug they cannot explain.
     */
    getAdjacentReceipt: builder.query<
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

    /**
     * "Has this party already paid this much today?"
     *
     * A WARNING, never a refusal — two equal cheques on one day are ordinary.
     * `excludeVoucherId` is sent as soon as `/create` has answered, or the
     * receipt reports itself.
     */
    checkDuplicateReceipt: builder.query<
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

    /** The party's mobile and address, which `/open-items` does not carry. */
    getReceiptLedgerContact: builder.query<LedgerContact | null, { ledId: string }>({
      query: ({ ledId }) => ({ url: LEDGER_GET_ENDPOINT, params: { ledId } }),
      transformResponse: (payload: ApiSuccessResponse<LedgerContact>) => payload.data ?? null,
      keepUnusedDataFor: 300,
    }),

    /**
     * The register (F8) — there is no `/receipts/list` route and there must
     * not be one: grid 108 IS the list, and running it is what makes the
     * operator's saved widths, filters and column order apply to it.
     *
     * **Every token grid 108 names is bound, empty string included.** The
     * runner substitutes bare `i`-prefixed tokens as TEXT rather than binding
     * them, so an unsupplied `iavh_status` stays in the statement as the
     * literal word and the whole query fails — not just the filter. That is
     * why "every status" is `""` here and is not modelled as an option that
     * sends nothing.
     */
    listReceipts: builder.query<ConfiguredGridPage<ReceiptListRow>, ReceiptListQuery>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("receiptList"),
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
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<ReceiptListRow>>) =>
        payload.data,
      providesTags: ["Receipt"],
      keepUnusedDataFor: 15,
    }),

    /** F7 — every receipt, journal and note that has ever touched this bill. */
    getBillPaymentHistory: builder.query<
      ConfiguredGridPage<BillPaymentHistoryRow>,
      { billId: string; billAccYear: string; page?: number; limit?: number }
    >({
      query: ({ billId, billAccYear, page = 1, limit = 50 }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("billPaymentHistoryPopup"),
          page,
          limit,
          grid_param: JSON.stringify({ iabj_bill_id: billId, iabj_acc_year: billAccYear }),
        },
      }),
      transformResponse: (
        payload: ApiSuccessResponse<ConfiguredGridPage<BillPaymentHistoryRow>>,
      ) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /**
     * Who authorised a write-off — grid 62, "MAIN LIST - COMPUTER USERS".
     *
     * `writeoffApprovedBy` is a UUID (`OptionalUuid`), not a typed name, so it
     * has to be PICKED. The Qt screen sent nothing at all and told the operator
     * to put the name in the narration instead; the DTO has a real field for
     * it, and a name in a narration is not something a report can find.
     */
    searchApprovers: builder.query<
      ConfiguredGridPage<ApproverRow>,
      { search?: string; page?: number; limit?: number }
    >({
      query: ({ search, page = 1, limit = 20 }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("userList"),
          page,
          limit,
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<ApproverRow>>) =>
        payload.data,
      keepUnusedDataFor: 300,
    }),

    /**
     * The bank picker on a cheque row. It is a CONVENIENCE: `td_bank_name` is
     * a varchar and not a foreign key, so a bank the master has never heard of
     * is typed in and kept.
     */
    searchBanks: builder.query<
      ConfiguredGridPage<BankPickerRow>,
      { search?: string; page?: number; limit?: number }
    >({
      query: ({ search, page = 1, limit = 20 }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("bankPopup"),
          page,
          limit,
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<BankPickerRow>>) =>
        payload.data,
      keepUnusedDataFor: 300,
    }),
  }),
});

export const {
  useLazyGetReceiptOpenItemsQuery,
  useLazyGetReceiptPartyContextQuery,
  useLazyGetReceiptQuery,
  useSaveReceiptDraftMutation,
  usePostReceiptMutation,
  useAmendReceiptMutation,
  useCancelReceiptMutation,
  useDeleteReceiptDraftMutation,
  useLazyGetAdjacentReceiptQuery,
  useLazyCheckDuplicateReceiptQuery,
  useGetReceiptLedgerContactQuery,
  useListReceiptsQuery,
  useGetBillPaymentHistoryQuery,
  useSearchBanksQuery,
  useSearchApproversQuery,
} = receiptApi;
