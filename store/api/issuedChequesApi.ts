/**
 * Issued Cheques (menu 52) and Cheque Books (menu 263) — server endpoints.
 *
 * ── Where the rows come from ─────────────────────────────────────────────
 * Grid 121 (cheques) and grid 120 (books) through `/configured-grid-sql/run`,
 * for the same reason the received register uses grid 109: column visibility
 * and order live in `fixed.grid_columns`.
 *
 * ── There is no summary route ────────────────────────────────────────────
 * `/cheques/list` counts RECEIVED cheques only. The issued tiles are summed on
 * the client from grid 121 (HELD,BOUNCED) and grid 120 (ACTIVE) — the
 * `getIssuedSummaryRows` query pages through them and says when it stopped at
 * its cap rather than passing a partial sum off as the whole.
 *
 * ── Keys ─────────────────────────────────────────────────────────────────
 * Every `/issued-cheques` route takes `apdId · apdAccYear · companyId ·
 * branchId` — BARE — as query items on a GET and in the body on a POST. The
 * writing verbs reuse the received register's generic `runChequeAction`
 * mutation (`chequesApi.ts`): the spec owns its endpoint and body.
 *
 * No cache tags, as on the received side: every read is
 * `keepUnusedDataFor: 0`, and the screen re-reads what an action moved.
 */
import type { FetchArgs } from "@reduxjs/toolkit/query";
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import type { IssuedGridParams } from "@/features/accounts/cheques/issued/domain/filters";
import type {
  ChequeBookPayload,
  CloseChequeBookBody,
  IssuedChequeHistory,
  IssuedChequeKeys,
  IssuedChequePayload,
  SaveChequeBookBody,
} from "@/features/accounts/cheques/issued/issued.types";

const CONFIGURED_GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

/** The runner caps `limit` at 100. */
const SUMMARY_PAGE = 100;
/** 2,000 outstanding cheques is far past any branch's book; past it, the tiles say so. */
const SUMMARY_MAX_PAGES = 20;

export type IssuedRegisterQuery = {
  params: IssuedGridParams;
  page: number;
  limit: number;
};

export type ChequeBookGridParams = {
  icompany_id: string;
  ibank_ledger_id: string;
  /** ONE status — ACTIVE, FINISHED or CLOSED — or "" for every one. */
  istatus: string;
};

export type ChequeBookListQuery = {
  params: ChequeBookGridParams;
  page: number;
  limit: number;
};

export type IssuedSummaryRows = {
  rows: Record<string, unknown>[];
  truncated: boolean;
};

function gridRun(gridKey: "issuedChequeList" | "chequeBookList", params: unknown, page: number, limit: number): FetchArgs {
  return {
    url: CONFIGURED_GRID_RUN_ENDPOINT,
    params: {
      grid_id: getGridId(gridKey),
      page,
      limit,
      grid_param: JSON.stringify(params),
    },
  };
}

export const issuedChequesApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    /** The register — all nine of grid 121's tokens, always. */
    getIssuedRegister: builder.query<ConfiguredGridPage<Record<string, unknown>>, IssuedRegisterQuery>({
      query: ({ params, page, limit }) => gridRun("issuedChequeList", params, page, limit),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>) =>
        payload.data,
      keepUnusedDataFor: 0,
    }),

    /** Every HELD and BOUNCED row for the scope and bank — the tiles' raw material. */
    getIssuedSummaryRows: builder.query<IssuedSummaryRows, IssuedGridParams>({
      async queryFn(params, _api, _extra, baseQuery) {
        const rows: Record<string, unknown>[] = [];
        for (let page = 1; page <= SUMMARY_MAX_PAGES; page += 1) {
          const result = await baseQuery(gridRun("issuedChequeList", params, page, SUMMARY_PAGE));
          if (result.error) {
            return { error: result.error };
          }
          const data = (result.data as ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>)
            .data;
          const items = data?.items ?? [];
          rows.push(...items);
          const total = data?.meta?.total ?? rows.length;
          if (rows.length >= total || items.length < SUMMARY_PAGE) {
            return { data: { rows, truncated: false } };
          }
        }
        return { data: { rows, truncated: true } };
      },
      keepUnusedDataFor: 0,
    }),

    /** One cheque and everything hanging off it — by the ROW's bare keys. */
    getIssuedCheque: builder.query<IssuedChequePayload, IssuedChequeKeys>({
      query: (params) => ({ url: "/issued-cheques/get", params }),
      transformResponse: (payload: ApiSuccessResponse<IssuedChequePayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** `txn_status_log` for one cheque — OLDEST first. */
    getIssuedChequeHistory: builder.query<IssuedChequeHistory, IssuedChequeKeys>({
      query: (params) => ({ url: "/issued-cheques/history", params }),
      transformResponse: (payload: ApiSuccessResponse<IssuedChequeHistory>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** Grid 120 — the books list. Company-wide: the grid has no branch token. */
    getChequeBookList: builder.query<ConfiguredGridPage<Record<string, unknown>>, ChequeBookListQuery>({
      query: ({ params, page, limit }) => gridRun("chequeBookList", params, page, limit),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<Record<string, unknown>>>) =>
        payload.data,
      keepUnusedDataFor: 0,
    }),

    /** One book, with every leaf it has handed out. */
    getChequeBook: builder.query<ChequeBookPayload, { companyId: string; chequeBookId: string }>({
      query: (params) => ({ url: "/cheque-books/get", params }),
      transformResponse: (payload: ApiSuccessResponse<ChequeBookPayload>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** Open a book, or edit one — an upsert keyed on `chequeBookId`. */
    saveChequeBook: builder.mutation<{ message: string; data: ChequeBookPayload }, SaveChequeBookBody>({
      query: (body) => ({ url: "/cheque-books/create", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ChequeBookPayload>) => ({
        message: typeof payload.message === "string" ? payload.message : "",
        data: payload.data,
      }),
    }),

    /** Close a book: no more leaves from it. There is no reopen. */
    closeChequeBook: builder.mutation<{ message: string; data: ChequeBookPayload }, CloseChequeBookBody>({
      query: (body) => ({ url: "/cheque-books/close", method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ChequeBookPayload>) => ({
        message: typeof payload.message === "string" ? payload.message : "",
        data: payload.data,
      }),
    }),
  }),
});

export const {
  useGetIssuedRegisterQuery,
  useGetIssuedSummaryRowsQuery,
  useGetIssuedChequeQuery,
  useGetIssuedChequeHistoryQuery,
  useGetChequeBookListQuery,
  useGetChequeBookQuery,
  useSaveChequeBookMutation,
  useCloseChequeBookMutation,
} = issuedChequesApi;
