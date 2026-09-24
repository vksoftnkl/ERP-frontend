/**
 * Opening Balances (menu 55) — server endpoints.
 *
 * Six routes exist under `/opening-balances`. FIVE are wired here. `DELETE
 * /delete` is deliberately absent: a row is cleared by being absent from the
 * `replace:true` body that `POST /create` carries, so there is nothing for a
 * delete call to do, and a screen that had one would eventually use it on a row
 * the upsert was already handling. See `payload/build-ledger-payload.ts`.
 *
 * A stale answer cannot land on the wrong scope: every query is keyed by its
 * full argument, so an answer for the company-level set is cached under the
 * company-level key and is never read by a screen showing a branch. That is the
 * React equivalent of the Qt screen's `QPointer` guard, and it needs no
 * bookkeeping of its own.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type {
  CarryForwardPayload,
  CarryForwardRequest,
  OpeningBillsPayload,
  OpeningBillsSavePayload,
  OpeningListPayload,
  OpeningSavePayload,
  SaveOpeningBalance,
  SaveOpeningBills,
  TrialBalance,
} from "@/features/accounts/opening-balance/opening-balance.types";

const LIST_ENDPOINT = "/opening-balances/list";
const TRIAL_BALANCE_ENDPOINT = "/opening-balances/trial-balance";
const CREATE_ENDPOINT = "/opening-balances/create";
const BILLS_ENDPOINT = "/opening-balances/bills";
const CARRY_FORWARD_ENDPOINT = "/opening-balances/carry-forward";
const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** One row of grid 107, "POPUP - LEDGERS", under its stored SQL's own names. */
export type LedgerPickerRow = {
  led_id: string;
  led_name: string;
  acc_group_name: string | null;
  acc_group_nature: string | null;
  /** `'Bill-wise'` or `''` — the SQL's CASE, so a non-empty string means true. */
  bill_wise: string | null;
};

export type OpeningListQuery = {
  companyId: string;
  accYear: string;
  /** Omitted entirely for the company-level set — an empty string is not it. */
  branchId: string | null;
};

export type OpeningBillsQuery = {
  partyId: string;
  companyId: string;
  accYear: string;
  /** REQUIRED. A missing branch is a field error, not an empty list. */
  branchId: string;
};

export const openingBalanceApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /**
     * The set on screen.
     *
     * `includeZero` is ALWAYS sent explicitly, and always `false`. False returns
     * every ledger that has an opening plus every carry-forward candidate —
     * which is exactly the set `replace:true` may delete from, and therefore
     * exactly the set the grid has to hold. True returns the whole chart: on the
     * reference database, 31 rows against 5, with THE SAME trial balance, since
     * the server totals the full chart whichever rows it puts in `rows[]`. A
     * medium company keeps 1000+ debtors, and 970 rows of `0.00` bury the one
     * figure the screen exists to review.
     *
     * Sending it rather than relying on the default is also deliberate: an
     * ABSENT flag once returned an empty `rows[]`, and because 0 = 0 that reads
     * as balanced.
     */
    getOpeningBalances: builder.query<OpeningListPayload, OpeningListQuery>({
      query: ({ companyId, accYear, branchId }) => ({
        url: LIST_ENDPOINT,
        params: {
          companyId,
          accYear,
          ...(branchId ? { branchId } : {}),
          includeZero: false,
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<OpeningListPayload>) => payload.data,
      providesTags: ["OpeningBalance"],
    }),

    /**
     * The same totals `/list` already returns, asked for on demand by the
     * "Check against the server" button. `includeZero: true` here because this
     * call wants the figure over the whole chart and carries no rows at all.
     */
    getOpeningTrialBalance: builder.query<TrialBalance, OpeningListQuery>({
      query: ({ companyId, accYear, branchId }) => ({
        url: TRIAL_BALANCE_ENDPOINT,
        params: {
          companyId,
          accYear,
          ...(branchId ? { branchId } : {}),
          includeZero: true,
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<TrialBalance>) => payload.data,
      providesTags: ["OpeningBalance"],
    }),

    saveOpeningBalances: builder.mutation<OpeningSavePayload, SaveOpeningBalance>({
      query: (body) => ({ url: CREATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<OpeningSavePayload>) => payload.data,
      // The reload is fired by the screen itself so it can sequence the bill
      // saves in between; the tag keeps any other subscriber honest.
      invalidatesTags: ["OpeningBalance"],
    }),

    getOpeningBills: builder.query<OpeningBillsPayload, OpeningBillsQuery>({
      query: (params) => ({ url: BILLS_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<OpeningBillsPayload>) => payload.data,
      providesTags: ["OpeningBalance"],
    }),

    /**
     * One party's breakup. This route OWNS the party's `op_amount`: it recomputes
     * it from these bills in the same transaction, which is what makes the tie
     * in the ledger grid true by construction rather than by a check.
     *
     * Two of these must never be in flight together — see the save sequence in
     * `state/use-opening-draft.ts`.
     */
    saveOpeningBills: builder.mutation<OpeningBillsSavePayload, SaveOpeningBills>({
      query: (body) => ({ url: BILLS_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<OpeningBillsSavePayload>) => payload.data,
      invalidatesTags: ["OpeningBalance"],
    }),

    /**
     * `overwriteManual` is never sent. A button that can silently overwrite a
     * figure an accountant typed is not one this screen offers; the server's
     * default spares MANUAL and MIGRATION rows and reports them as
     * `skippedManual`.
     */
    carryForwardOpeningBalances: builder.mutation<CarryForwardPayload, CarryForwardRequest>({
      query: (body) => ({ url: CARRY_FORWARD_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<CarryForwardPayload>) => payload.data,
      invalidatesTags: ["OpeningBalance"],
    }),

    /**
     * The ledger picker behind the grid's trailing blank row — configured grid
     * 107, "POPUP - LEDGERS".
     *
     * `grid_param` ALWAYS carries `iled_company_id`, even when the value is
     * empty. The runner substitutes bare `i`-prefixed tokens as TEXT
     * (`NULLIF('iled_company_id','')::uuid`) — it does not bind `:name` — so a
     * placeholder the parameters do not answer stays in the SQL as the literal
     * word and the whole query fails, not just the filter.
     *
     * Only `led_name` and `acc_group_name` carry `grid_column_filter`, so
     * `search` reaches those two columns and no other.
     */
    searchPickerLedgers: builder.query<
      ConfiguredGridPage<LedgerPickerRow>,
      { companyId: string; search?: string; page?: number; limit?: number }
    >({
      query: ({ companyId, search, page = 1, limit = 20 }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("ledgerPickerPopup"),
          page,
          limit,
          grid_param: JSON.stringify({ iled_company_id: companyId ?? "" }),
          ...(search?.trim() ? { search: search.trim() } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<LedgerPickerRow>>) =>
        payload.data,
      keepUnusedDataFor: 60,
    }),
  }),
});

export const {
  useGetOpeningBalancesQuery,
  useLazyGetOpeningTrialBalanceQuery,
  useSaveOpeningBalancesMutation,
  useLazyGetOpeningBillsQuery,
  useSaveOpeningBillsMutation,
  useCarryForwardOpeningBalancesMutation,
  useSearchPickerLedgersQuery,
} = openingBalanceApi;
