/**
 * Sale Bill Entry — the BILL-SPECIFIC server endpoints.
 *
 * Everything the quotation screen already wires is reused from `quotationApi`
 * (grid layouts by uiTableId, dropdowns, charges, customer detail, item price,
 * units, barcode, freight bands, company state code, user capabilities, the item
 * picker, and the whole of `/txn-holds`), and the tender master and party-credit
 * lookups come from `saleOrderApi`. Those endpoints are parameterised, not
 * quotation- or order-shaped.
 *
 * What lives here is what only this screen calls: the bill's own CRUD, the open
 * credits an adjustment is made out of, and the sale-order line cancellation a
 * bill triggers when a billed line is taken back off it.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import { CONFIGURED_GRID_RUN_ENDPOINT } from "@/features/sales/quotation/quotation.constants";
import {
  BILL_CANCEL_SOURCE_ORDER_ENDPOINT,
  BILL_GET_ENDPOINT,
  BILL_LIST_GRID_ID,
  BILL_SAVE_ENDPOINT,
  OPEN_CREDITS_ENDPOINT,
  SALE_ORDER_CANCEL_LINES_ENDPOINT,
} from "@/features/sales/salebill/salebill.constants";
import type {
  AdjustableCredit,
  BillCancelResult,
  BillPayload,
  CancelBillDto,
  CancelOrderResult,
  SaleBillDocKey,
  SaveBillDto,
} from "@/features/sales/salebill/salebill.types";

/** A uuid that matches nothing, so an unresolved tenant lists no rows. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * One row of the browse list (configured grid 86, "TXN MAIN LIST - BILLS").
 *
 * Note what it does NOT project: `sb_is_deleted` and `sb_cancelled_on`. A
 * cancelled bill therefore shows only through `sb_status`, the same gap the sale
 * order's grid 87 has — fixable in the grid's SQL, not here.
 */
export type BillListRow = {
  sb_id: string;
  sb_company_id: string;
  sb_branch_id: string;
  sb_acc_year: string;
  sb_bill_date: string | null;
  sb_bill_refno: string | null;
  sb_bill_type: string | null;
  cus_name: string | null;
  cus_addr3: string | null;
  sb_tot_items: number | null;
  sb_bill_amt: string | number | null;
  sb_status: string | null;
  sb_print_count: number | null;
  sb_created_by: string | null;
};

export type BillListQuery = {
  page?: number;
  limit?: number;
  companyId: string;
  branchId: string;
  /** Grid 86 binds a YEAR token, unlike the order's grid 87. */
  accYear: string;
  /** `yyyy-mm-dd` or "" — the grid's NULLIF guards read "" as unbounded. */
  fromDate?: string;
  toDate?: string;
};
/**
 * `GET /transactions/party-balance`.
 *
 * There is deliberately **no accounting-year parameter**: `acc_bill_balance` is
 * partitioned by the year the credit ORIGINATED in and is never carried forward,
 * so filtering by the entry screen's year would hide every credit raised before
 * it — a March advance would vanish on April 1 while the customer's money is
 * still held. Each row reports its own `billAccYear` instead.
 *
 * `companyId` is required and is NOT a convenience narrowing: offering one
 * tenant's credits as settlement on another tenant's bill is not a wider read,
 * it is a wrong one.
 */
export type OpenCreditsQuery = {
  partyId: string;
  companyId: string;
  /** CR (the company owes the party) is the default and the only side a sale wants. */
  type?: "CR" | "DR";
};

/**
 * `PUT /sale-orders/cancel-lines` — the three query params that address it.
 *
 * `srcDocId` decides the SCOPE, and getting it wrong is the expensive mistake
 * here: an order id (`so_id`) closes out **every open line of the order**, an
 * order LINE id (`soi_id`) closes out that one line. §8 says one line — the
 * selected row's — never the order, so this screen always sends a `soi_id`.
 */
export type CancelOrderLinesQuery = {
  srcModule: string;
  /** `soi_id` from this screen. An `so_id` would cancel the whole order. */
  srcDocId: string;
  srcAccYear: string;
  /** Mandatory in practice: `soi_cancel_reason` is what the operator must state. */
  soiCancelReason: string;
};

export const saleBillApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getBill: builder.query<BillPayload, SaleBillDocKey>({
      // All four keys, always: `sale_bill` is partitioned by `sb_acc_year` and
      // the row is looked up by id + company + branch + year together, so a bill
      // is only readable inside its own scope.
      query: (key) => ({ url: BILL_GET_ENDPOINT, params: key }),
      transformResponse: (payload: ApiSuccessResponse<BillPayload>) => payload.data,
      providesTags: (_result, _error, key) => [{ type: "SaleBill", id: key.sbId }],
      keepUnusedDataFor: 0,
    }),

    saveBill: builder.mutation<BillPayload, SaveBillDto>({
      query: (body) => ({ url: BILL_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<BillPayload>) => payload.data,
      // The credits too: a bill that adjusted one has SPENT it, and a panel
      // still offering it would let a second bill adjust the same money.
      invalidatesTags: ["SaleBill", "PartyCredit", "SaleOrder"],
    }),

    /**
     * `POST /bills/delete`, and it deletes NOTHING.
     *
     * Despite the path this cancels the **sale order the bill was raised
     * against** — every open line of it — and leaves the bill row, its lines,
     * charges, tenders and voucher posting untouched. Idempotent: a second call
     * finds nothing open and answers `cancelledLines: 0` rather than an error.
     *
     * There is no route that cancels a BILL. See `salebill.constants.ts`.
     */
    cancelBillSourceOrders: builder.mutation<BillCancelResult, CancelBillDto>({
      query: (body) => ({
        url: BILL_CANCEL_SOURCE_ORDER_ENDPOINT,
        method: "POST",
        body,
      }),
      transformResponse: (payload: ApiSuccessResponse<BillCancelResult>) => payload.data,
      invalidatesTags: ["SaleBill", "SaleOrder"],
    }),

    /**
     * Cancel ONE order line, by its `soi_id` (§8).
     *
     * The row is dropped from the bill only in this call's success path, never
     * optimistically: a refused cancellation that had already removed the row
     * would leave the order and the bill disagreeing about what is still open.
     */
    cancelOrderLine: builder.mutation<CancelOrderResult, CancelOrderLinesQuery>({
      query: ({ srcModule, srcDocId, srcAccYear, soiCancelReason }) => ({
        url: SALE_ORDER_CANCEL_LINES_ENDPOINT,
        method: "PUT",
        params: { srcModule, srcDocId, srcAccYear },
        body: { soiCancelReason },
      }),
      transformResponse: (payload: ApiSuccessResponse<CancelOrderResult>) => payload.data,
      invalidatesTags: ["SaleOrder"],
    }),

    // -- the browse list (no /bills/list route; grid 86 is it) --------------
    listBills: builder.query<ConfiguredGridPage<BillListRow>, BillListQuery>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: BILL_LIST_GRID_ID,
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          // Every token must be bound, the dates as "" when open-ended.
          grid_param: JSON.stringify({
            icompany_id: params.companyId || NO_TENANT_ID,
            ibranch_id: params.branchId || NO_TENANT_ID,
            iacc_year: params.accYear,
            ifrom_date: params.fromDate ?? "",
            ito_date: params.toDate ?? "",
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<BillListRow>>) =>
        payload.data,
      providesTags: ["SaleBill"],
      keepUnusedDataFor: 30,
    }),

    getOpenCredits: builder.query<AdjustableCredit[], OpenCreditsQuery>({
      query: (params) => ({
        url: OPEN_CREDITS_ENDPOINT,
        params: { partyId: params.partyId, companyId: params.companyId, type: params.type ?? "CR" },
      }),
      transformResponse: (payload: ApiSuccessResponse<AdjustableCredit[]>) => payload.data ?? [],
      providesTags: (_result, _error, params) => [{ type: "PartyCredit", id: params.partyId }],
      // Never cached: another counter may have spent a credit since the panel
      // was last opened, and the ceiling this list reports is what the operator
      // adjusts against.
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useLazyGetBillQuery,
  useSaveBillMutation,
  useCancelBillSourceOrdersMutation,
  useCancelOrderLineMutation,
  useLazyGetOpenCreditsQuery,
  useListBillsQuery,
} = saleBillApi;
