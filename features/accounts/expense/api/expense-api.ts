/**
 * Expense Voucher (menu 277) — the server's routes, `/expenses/*`
 * (`accountsModule/expense/README.md` is the contract).
 *
 *   POST create         a DRAFT; `voucherId` = edit that draft      CREATE / EDIT
 *   POST validate       always 200: derived · refusals · warnings · approval   VIEW
 *   POST post           the key of a saved draft: numbered, legs written       POST
 *   GET  get            ?companyId&branchId&accYear&voucherId                  VIEW
 *   POST cancel         key + reason: a mirror in the Rev series               CANCEL
 *   GET  ledger-pick    ?companyId[&search] — ledgers under an Expenses group  VIEW
 *   GET  quick-reasons  ?companyId — the EXPENSE till reasons                  VIEW
 *
 * There is NO delete: a draft that is not wanted is left unposted (Qt's list
 * offers no delete either).
 *
 * Every endpoint is a MUTATION, the reads included (`method: "GET"`): the
 * screen calls them imperatively — on mount, on a 400 ms debounce, after a
 * save — and a query endpoint fired from a mount effect resolves `undefined`
 * without a request, while a second `initiate` on a pending query key is
 * handed the first one's (possibly aborted) promise. A mutation is one request
 * per call, abortable, cached nowhere.
 *
 * `transformResponse` hands back the envelope's `data` untouched; the screen
 * reads it through `domain/parse.ts`, which fills whatever a partial answer
 * left out.
 */
import { baseApi } from "@/store/api/baseApi";
import { getGridId } from "@/lib/configured-grids";
import type { CancelExpenseBody, ExpenseKeys, SaveExpenseBody } from "../expense.types";

const BASE = "/expenses";
const GRID_RUN_ENDPOINT = "/configured-grid-sql/run";

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
    expenseLedgerPick: builder.mutation<unknown, { companyId: string }>({
      query: (params) => ({ url: `${BASE}/ledger-pick`, method: "GET", params }),
      transformResponse: dataOf,
    }),
    expenseQuickReasons: builder.mutation<unknown, { companyId: string }>({
      query: (params) => ({ url: `${BASE}/quick-reasons`, method: "GET", params }),
      transformResponse: dataOf,
    }),
    /**
     * Grid 134 "MAIN LIST - TILL REASONS", the EXPENSE ones (Qt reads the
     * reasons here — see `domain/pickers.ts`). Its SQL binds `icompany_id`,
     * `icategory` and `iinactive` as QUOTED tokens: one left unsent stays a
     * literal and the list comes back silently empty, so all three always go.
     */
    expenseReasonRows: builder.mutation<unknown, { companyId: string }>({
      query: ({ companyId }) => ({
        url: GRID_RUN_ENDPOINT,
        method: "GET",
        params: {
          grid_id: getGridId("tillReasonList"),
          page: 1,
          limit: 100,
          grid_param: JSON.stringify({ icompany_id: companyId, icategory: "EXPENSE", iinactive: "false" }),
        },
      }),
      transformResponse: dataOf,
    }),
  }),
});
