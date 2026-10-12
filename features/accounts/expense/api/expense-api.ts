/**
 * Expense Voucher (menu 277) — the server's routes, `/expenses/*`
 * (`accountsModule/expense/README.md` is the contract).
 *
 *   POST create         a DRAFT; `voucherId` = edit that draft      CREATE / EDIT
 *   POST validate       always 200: derived · refusals · warnings · approval   VIEW
 *   POST post           the key of a saved draft: numbered, legs written       POST
 *   GET  get            ?companyId&branchId&accYear&voucherId                  VIEW
 *   POST cancel         key + reason: a mirror in the Rev series               CANCEL
 *
 * The server also has `ledger-pick` and `quick-reasons`; since Qt d97cdd4 the
 * Reason and Expense ledger cells pick from popup grids 155 / 156 instead
 * (`GridPickerModal`), so neither is called.
 *
 * There is NO delete: a draft that is not wanted is left unposted (Qt's list
 * offers no delete either).
 *
 * Every `/expenses/*` endpoint is a MUTATION, the reads included: the
 * screen calls them imperatively — on mount, on a 400 ms debounce, after a
 * save — and a query endpoint fired from a mount effect resolves `undefined`
 * without a request, while a second `initiate` on a pending query key is
 * handed the first one's (possibly aborted) promise. A mutation is one request
 * per call, abortable, cached nowhere.
 *
 * `transformResponse` hands back the envelope's `data` untouched; the screen
 * reads it through `domain/parse.ts`, which fills whatever a partial answer
 * left out.
 *
 * The three lookups added for d97cdd4 (reason names, state names, a party's
 * GSTIN) are plain QUERIES: reads announced as mutations make every other tab
 * drop its whole cache, so nothing new joins that list.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import { getDropdownId } from "@/lib/configured-dropdowns";
import type { CancelExpenseBody, ExpenseKeys, SaveExpenseBody } from "../expense.types";

const BASE = "/expenses";
const GRID_RUN_ENDPOINT = "/configured-grid-sql/run";
const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
const LEDGER_GET_ENDPOINT = "/account-ledger-masters/get";

/** The rows of a configured grid / dropdown page, whatever wrapper they came in. */
function rowsOf(payload: unknown): Record<string, unknown>[] {
  const data = dataOf(payload);
  const list = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : [];
  return list.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
}

type Envelope = { data?: unknown };

function dataOf(payload: unknown): unknown {
  return typeof payload === "object" && payload !== null ? (payload as Envelope).data : undefined;
}

export const expenseApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    expenseCreate: builder.mutation<unknown, SaveExpenseBody>({
      query: (body) => ({ url: `${BASE}/create`, method: "POST", body }),
      transformResponse: dataOf,
    }),
    expenseValidate: builder.mutation<unknown, SaveExpenseBody>({
      query: (body) => ({ url: `${BASE}/validate`, method: "POST", body }),
      transformResponse: dataOf,
    }),
    expensePost: builder.mutation<unknown, ExpenseKeys>({
      query: (body) => ({ url: `${BASE}/post`, method: "POST", body }),
      transformResponse: dataOf,
    }),
    expenseCancel: builder.mutation<unknown, CancelExpenseBody>({
      query: (body) => ({ url: `${BASE}/cancel`, method: "POST", body }),
      transformResponse: dataOf,
    }),
    expenseGet: builder.mutation<unknown, ExpenseKeys>({
      query: (params) => ({ url: `${BASE}/get`, method: "GET", params }),
      transformResponse: dataOf,
    }),
    /**
     * Grid 155 "POPUP - EXPENSE REASONS", whole (Qt asks 200; the runner caps
     * a page at 100): the names a loaded voucher's reason id is shown by. Its
     * SQL binds `'icompany_id'` QUOTED, so it always goes.
     */
    expenseReasonRows: builder.query<Record<string, unknown>[], { companyId: string }>({
      query: ({ companyId }) => ({
        url: GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("expenseReasonPopup"),
          page: 1,
          limit: 100,
          grid_param: JSON.stringify({ icompany_id: companyId }),
        },
      }),
      transformResponse: rowsOf,
      keepUnusedDataFor: 300,
    }),
    /** Dropdown 21 "GST - STATE CODES", whole: the place of supply's names. */
    expenseStateRows: builder.query<Record<string, unknown>[], void>({
      query: () => ({
        url: DROPDOWN_RUN_ENDPOINT,
        params: { dropdown_id: getDropdownId("gstStateCode"), page: 1, limit: 100 },
      }),
      transformResponse: rowsOf,
      keepUnusedDataFor: 600,
    }),
    /** A party ledger's own GSTIN (`ledGstinNo`), for a GST bill's supplier GSTIN. */
    expensePartyGstin: builder.query<string, { ledId: string }>({
      query: ({ ledId }) => ({ url: LEDGER_GET_ENDPOINT, params: { ledId } }),
      transformResponse: (payload: unknown) => {
        const data = dataOf(payload);
        const row = Array.isArray(data) ? data[0] : data;
        const gstin =
          typeof row === "object" && row !== null ? (row as { ledGstinNo?: unknown }).ledGstinNo : null;
        return typeof gstin === "string" ? gstin.trim().toUpperCase() : "";
      },
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useExpenseReasonRowsQuery, useExpenseStateRowsQuery } = expenseApi;
