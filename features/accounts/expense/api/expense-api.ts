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
 * F8's register is grid 137 "MAIN LIST - EXPENSE VOUCHERS" — the list the
 * menu lands on, run here as a picker (`expenseRegister`, a plain query).
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

/** A configured-grid page's row count — `data.meta.total`, two levels down. */
function totalOf(payload: unknown): number {
  const data = dataOf(payload);
  const meta = typeof data === "object" && data !== null ? (data as { meta?: unknown }).meta : undefined;
  const total = typeof meta === "object" && meta !== null ? Number((meta as { total?: unknown }).total) : NaN;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/** One row of grid 137, as far as the F8 picker reads it (the four keys never shown). */
export type ExpenseRegisterRow = {
  avh_voucher_id?: unknown;
  avh_company_id?: unknown;
  avh_branch_id?: unknown;
  avh_acc_year?: unknown;
  avh_voucher_refno?: unknown;
  avh_voucher_date?: unknown;
  paid_to?: unknown;
  expense_heads?: unknown;
  avh_doc_amount?: unknown;
  tenders?: unknown;
  gst_bill_no?: unknown;
  session_no?: unknown;
  avh_voucher_status?: unknown;
};

export type ExpenseRegisterQuery = {
  companyId: string;
  branchId: string;
  accYear: string;
  /** "" = every status. */
  status: string;
  /** ISO dates; "" = no bound. */
  fromDate: string;
  toDate: string;
  search: string;
  page: number;
  limit: number;
};

export type ExpenseRegisterPage = { rows: ExpenseRegisterRow[]; total: number };

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
    /**
     * F8 — grid 137, the register, a page at a time. Every one of its six bare
     * tokens is sent, "" included: an unbound bare token stays in the SQL as a
     * word and fails the whole query.
     */
    expenseRegister: builder.query<ExpenseRegisterPage, ExpenseRegisterQuery>({
      query: (params) => ({
        url: GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId("expenseVoucherList"),
          page: params.page,
          limit: params.limit,
          ...(params.search ? { search: params.search } : {}),
          grid_param: JSON.stringify({
            iavh_company_id: params.companyId,
            iavh_branch_id: params.branchId,
            iavh_acc_year: params.accYear,
            iavh_status: params.status,
            ifrom_date: params.fromDate,
            ito_date: params.toDate,
          }),
        },
      }),
      transformResponse: (payload: unknown) => ({ rows: rowsOf(payload), total: totalOf(payload) }),
      // Saves and posts do not invalidate it: every opening reads afresh.
      keepUnusedDataFor: 0,
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

export const { useExpenseRegisterQuery, useExpenseReasonRowsQuery, useExpenseStateRowsQuery } = expenseApi;
