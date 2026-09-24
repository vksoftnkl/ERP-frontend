/**
 * Received Cheques (menu 51) — and, later, Issued Cheques (menu 52).
 *
 * ── Where the rows come from ─────────────────────────────────────────────
 * Grid 109, "MAIN LIST - RECEIVED CHEQUES", through `/configured-grid-sql/run`
 * — NOT `/cheques/list`, although that route returns the same rows. Column
 * visibility and order live in `fixed.grid_columns`, and a screen that paints
 * rows from a REST list throws all of that away.
 *
 * `/cheques/list` IS called, once per refresh, for its `summary` only, with
 * `limit=1` and the row discarded. The summary covers the WHOLE register,
 * whatever the filters say — which is what the tiles want.
 *
 * ── The actions ──────────────────────────────────────────────────────────
 * One generic mutation. Each verb's spec (`features/accounts/cheques/actions`)
 * owns its endpoint and its body; this only carries them, so a new verb needs
 * nothing here.
 *
 * No cache tags: every read here is `keepUnusedDataFor: 0`, and the screen
 * reloads the register, the tiles and the detail itself after an action —
 * a row that moved out of the filter must not be "restored" from a cache.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type { GridParams } from "@/features/accounts/cheques/domain/filters";
import type {
  ChequeActionResult,
  ChequeDetail,
  ChequeHistory,
  ChequeKeys,
  ChequeSummary,
  DepositSlip,
  DepositSlipKey,
} from "@/features/accounts/cheques/domain/types";

const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

export type ChequeRegisterQuery = {
  params: GridParams;
  page: number;
  limit: number;
};

export const chequesApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /**
     * The register. `params` MUST carry all nine of grid 109's tokens — the
     * pure `gridParams()` guarantees it — and the search travels as
     * `isearch` inside `grid_param`, never as the runner's own `search`.
     */
    getChequeRegister: builder.query<
      ConfiguredGridPage<Record<string, unknown>>,
      ChequeRegisterQuery
    >({
      query: ({ params, page, limit }) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("receivedChequeList"),
          page,
          limit,
          grid_param: JSON.stringify(params),
        },
      }),
      transformResponse: (
        payload: ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>,
      ) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** The tiles. `limit=1`: the row is thrown away, only `summary` is read. */
    getChequeSummary: builder.query<
      ChequeSummary,
      { companyId: string; branchId: string; accYear: string }
    >({
      query: ({ companyId, branchId, accYear }) => ({
        url: "/cheques/list",
        params: { apdCompanyId: companyId, apdBranchId: branchId, apdAccYear: accYear, limit: 1 },
      }),
      transformResponse: (payload: ApiSuccessResponse<{ summary: ChequeSummary }>) =>
        payload.data.summary,
      keepUnusedDataFor: 0,
    }),

    /** One cheque and everything hanging off it — by the ROW's four keys. */
    getCheque: builder.query<ChequeDetail, ChequeKeys>({
      query: (params) => ({ url: "/cheques/get", params }),
      transformResponse: (payload: ApiSuccessResponse<ChequeDetail>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** `txn_status_log`, newest first. */
    getChequeHistory: builder.query<ChequeHistory, ChequeKeys>({
      query: (params) => ({ url: "/cheques/history", params }),
      transformResponse: (payload: ApiSuccessResponse<ChequeHistory>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /**
     * Keyed by (company, bank ledger, date, slip number) — not by an id. A key
     * that matches nothing answers 200 with NO lines, never a 404, so the
     * caller checks the count before printing.
     */
    getDepositSlip: builder.query<DepositSlip, DepositSlipKey>({
      query: ({ companyId, branchId, bankLedgerId, depositDate, slipNo }) => ({
        url: "/cheques/deposit-slip",
        params: {
          apdCompanyId: companyId,
          apdBranchId: branchId,
          bankLedgerId,
          depositDate,
          slipNo,
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<DepositSlip>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /**
     * Every writing verb. The envelope's `message` is kept — it is what the
     * status line shows ("2 cheque(s) deposited on slip D-121").
     */
    runChequeAction: builder.mutation<
      ChequeActionResult,
      { endpoint: string; body: Record<string, unknown> }
    >({
      query: ({ endpoint, body }) => ({ url: endpoint, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ChequeActionResult["data"]>) => ({
        message: typeof payload.message === "string" ? payload.message : "",
        data: payload.data ?? {},
      }),
    }),
  }),
});

export const {
  useGetChequeRegisterQuery,
  useGetChequeSummaryQuery,
  useGetChequeQuery,
  useGetChequeHistoryQuery,
  useGetDepositSlipQuery,
  useRunChequeActionMutation,
} = chequesApi;
