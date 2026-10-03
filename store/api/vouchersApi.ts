/**
 * The Voucher Register (`/vouchers`) — as Contra (menu 104), the Receipt
 * Voucher (260) and the Payment Voucher (261) use it.
 *
 * One server module behind nine voucher menus; a type's behaviour comes from
 * `/vouchers/types`. Every route addresses a voucher by BARE keys
 * (`companyId · branchId · accYear · voucherId`), as query items on a GET and
 * in the body on a POST, and every body is whitelisted — a key the DTO does
 * not declare is a 400 (`overrides` on `/create` included).
 *
 * ── Where the rows come from ─────────────────────────────────────────────
 * The register is grid 117 "TXN MAIN LIST - VOUCHER REGISTER" (CrudMasterPage
 * runs it — see the list view). The ledger picker reads `/vouchers/ledger-pick`
 * rather than the Qt screen's grid 119: that grid exists only on the dev
 * database (no migration carries it), and the route applies the same filter —
 * the type's side groups, less the instrument-controlled ledgers.
 *
 * No cache tags: every read is `keepUnusedDataFor: 0`, and the screen re-reads
 * what a verb moved.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import { getGridId } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import type {
  AdjacentVoucherPayload,
  CancelVoucherPayload,
  DeleteVoucherPayload,
  DraftSavedPayload,
  InstrumentsPayload,
  LedgerBalancePayload,
  OpenBillsPayload,
  PartyFactsPayload,
  TaxRatesPayload,
  ValidatePayload,
  VoucherChequeBooksPayload,
  VoucherKeys,
  VoucherPayload,
  VoucherPayloadBody,
  VoucherTypesPayload,
} from "@/features/accounts/vouchers/vouchers.types";

export type LedgerPickRow = {
  ledId: string;
  name: string;
  groupId: string;
  groupName: string;
  isParty: boolean;
  isBillByBill: boolean;
  /** A GST-band type: the ledger's own rate opens on the line, its ITC class too. */
  gstApplicable?: boolean;
  itcEligibility?: string | null;
  defaultTaxId?: string | null;
  isTdsApplicable: boolean;
  tdsSection: string | null;
};

type WithMessage<T> = { message: string; data: T };

function withMessage<T>(payload: ApiSuccessResponse<T>): WithMessage<T> {
  return { message: typeof payload.message === "string" ? payload.message : "", data: payload.data };
}

export const vouchersApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** The types the user may view on this menu, with their rules and rights. */
    getVoucherTypes: builder.query<WithMessage<VoucherTypesPayload>, { companyId: string; menuId?: number }>({
      // No menu = the Voucher Register: every type the user may view, each
      // with the rights of its own menu.
      query: ({ companyId, menuId }) => ({
        url: "/vouchers/types",
        params: { companyId, ...(menuId !== undefined ? { menuId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<VoucherTypesPayload>) => withMessage(payload),
      keepUnusedDataFor: 0,
    }),

    /** The ledgers a line on this side may use — loose search on name and alias. */
    pickVoucherLedgers: builder.query<
      LedgerPickRow[],
      { companyId: string; branchId: string; typeCode: string; side: "DR" | "CR"; q?: string; limit?: number }
    >({
      query: ({ q, limit, ...rest }) => ({
        url: "/vouchers/ledger-pick",
        params: { ...rest, ...(q?.trim() ? { q: q.trim() } : {}), limit: limit ?? 50 },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ ledgers: LedgerPickRow[] }>) =>
        payload.data?.ledgers ?? [],
      keepUnusedDataFor: 0,
    }),

    /** The balance of the ledger under the cursor, as on the voucher's date. */
    getVoucherLedgerBalance: builder.query<
      LedgerBalancePayload,
      { companyId: string; branchId: string; accYear: string; ledgerId: string; asOn: string }
    >({
      query: (params) => ({ url: "/vouchers/ledger-balance", params }),
      transformResponse: (payload: ApiSuccessResponse<LedgerBalancePayload>) => payload.data,
      keepUnusedDataFor: 30,
    }),

    /**
     * The tenders an instrument may name. With the type, a payment is offered
     * only what can pay (cash, UPI, a bank transfer, a cheque).
     */
    getVoucherInstruments: builder.query<
      InstrumentsPayload,
      { companyId: string; branchId?: string; typeCode: string }
    >({
      query: ({ branchId, ...rest }) => ({
        url: "/vouchers/instruments",
        params: { ...rest, ...(branchId ? { branchId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<InstrumentsPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** The company's open cheque books — a payment cheque's leaf comes from one. */
    getVoucherChequeBooks: builder.query<VoucherChequeBooksPayload, { companyId: string; branchId?: string }>({
      query: ({ companyId, branchId }) => ({
        url: "/vouchers/cheque-books",
        params: { companyId, ...(branchId ? { branchId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<VoucherChequeBooksPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** A one-party type's party as on the voucher date: credit days, TDS, outstanding, GSTIN. */
    getVoucherPartyFacts: builder.query<PartyFactsPayload, { companyId: string; partyId: string; asOn: string }>({
      query: (params) => ({ url: "/vouchers/party-facts", params }),
      transformResponse: (payload: ApiSuccessResponse<PartyFactsPayload>) => payload.data,
      keepUnusedDataFor: 30,
    }),

    /** The active GST rates — the GST cell's choices. */
    getVoucherTaxRates: builder.query<TaxRatesPayload, { companyId: string }>({
      query: (params) => ({ url: "/vouchers/tax-rates", params }),
      transformResponse: (payload: ApiSuccessResponse<TaxRatesPayload>) => payload.data,
      keepUnusedDataFor: 300,
    }),

    /**
     * A party's bills still open on one side, every year, oldest first. A
     * receipt's customer line settles DR bills; a payment's supplier line, CR.
     */
    getVoucherOpenBills: builder.query<OpenBillsPayload, { companyId: string; partyId: string; side: "DR" | "CR" }>({
      query: (params) => ({ url: "/vouchers/open-bills", params }),
      transformResponse: (payload: ApiSuccessResponse<OpenBillsPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /**
     * The Exceptions (grid 118): journals and notes that settled a SALES or
     * PURCHASE bill by hand. Every token, always — blank dates = the year.
     */
    listVoucherExceptions: builder.query<
      ConfiguredGridPage<Record<string, unknown>>,
      { companyId: string; branchId: string; accYear: string; fromDate: string; toDate: string; page: number; limit: number }
    >({
      query: ({ companyId, branchId, accYear, fromDate, toDate, page, limit }) => ({
        url: "/configured-grid-sql/run",
        params: {
          grid_id: getGridId("voucherExceptions"),
          page,
          limit,
          grid_param: JSON.stringify({
            icompany_id: companyId,
            ibranch_id: branchId,
            iacc_year: accYear,
            ifrom_date: fromDate,
            ito_date: toDate,
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** Work the voucher out — always a 200; `refusals` and `warnings` say how it went. */
    validateVoucher: builder.mutation<ValidatePayload, VoucherPayloadBody>({
      query: (body) => ({ url: "/vouchers/validate", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ValidatePayload>) => payload.data,
    }),

    /** Save a DRAFT: no number, no legs. Never takes `overrides`. */
    saveVoucherDraft: builder.mutation<WithMessage<DraftSavedPayload>, Omit<VoucherPayloadBody, "overrides">>({
      query: (body) => ({ url: "/vouchers/create", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<DraftSavedPayload>) => withMessage(payload),
    }),

    /** Post — the whole payload again (a draft's stored copy is not read). */
    postVoucher: builder.mutation<WithMessage<VoucherPayload>, VoucherPayloadBody>({
      query: (body) => ({ url: "/vouchers/post", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<VoucherPayload>) => withMessage(payload),
    }),

    getVoucher: builder.query<VoucherPayload, VoucherKeys>({
      query: (params) => ({ url: "/vouchers/get", params }),
      transformResponse: (payload: ApiSuccessResponse<VoucherPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** Reverse a POSTED voucher with a Rev voucher. The reason is required. */
    cancelVoucher: builder.mutation<WithMessage<CancelVoucherPayload>, VoucherKeys & { reason: string }>({
      query: (body) => ({ url: "/vouchers/cancel", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<CancelVoucherPayload>) => withMessage(payload),
    }),

    /** Throw a DRAFT away. A posted voucher is cancelled, never deleted. */
    deleteVoucherDraft: builder.mutation<WithMessage<DeleteVoucherPayload>, VoucherKeys>({
      query: (body) => ({ url: "/vouchers/delete", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<DeleteVoucherPayload>) => withMessage(payload),
    }),

    /** The neighbour of this type in the register. Null at either end. */
    getAdjacentVoucher: builder.query<
      AdjacentVoucherPayload,
      {
        companyId: string;
        branchId: string;
        accYear: string;
        voucherId?: string;
        direction: "prev" | "next";
        typeCode: string;
      }
    >({
      query: ({ voucherId, ...rest }) => ({
        url: "/vouchers/adjacent",
        params: { ...rest, ...(voucherId ? { voucherId } : {}) },
      }),
      transformResponse: (payload: ApiSuccessResponse<AdjacentVoucherPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useGetVoucherTypesQuery,
  usePickVoucherLedgersQuery,
  useGetVoucherLedgerBalanceQuery,
  useGetVoucherInstrumentsQuery,
  useGetVoucherChequeBooksQuery,
  useGetVoucherPartyFactsQuery,
  useGetVoucherTaxRatesQuery,
  useGetVoucherOpenBillsQuery,
  useListVoucherExceptionsQuery,
  useValidateVoucherMutation,
  useSaveVoucherDraftMutation,
  usePostVoucherMutation,
  useCancelVoucherMutation,
  useDeleteVoucherDraftMutation,
} = vouchersApi;
