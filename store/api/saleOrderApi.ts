/**
 * Sale Order Entry — the ORDER-SPECIFIC server endpoints.
 *
 * Everything the quotation screen already wires is reused from `quotationApi`
 * (grid layouts by uiTableId, dropdowns, charges, customer detail, item price,
 * units, barcode, freight bands, company state code, user capabilities, the
 * item picker) — those endpoints are parameterised, not quotation-shaped. What
 * lives here is what only this screen calls: the sale-order CRUD, the grid-87
 * list, the tender master and the party-credit lookup.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import {
  PARTY_CREDIT_ENDPOINT,
  SALE_ORDER_DELETE_ENDPOINT,
  SALE_ORDER_GET_ENDPOINT,
  SALE_ORDER_LIST_GRID_ID,
  SALE_ORDER_SAVE_ENDPOINT,
  TENDER_MASTERS_LIST_ENDPOINT,
} from "@/features/sales/sale-order/sale-order.constants";
import { CONFIGURED_GRID_RUN_ENDPOINT } from "@/features/sales/quotation/quotation.constants";
import type {
  PartyCreditSummary,
  SaleOrderDocKey,
  SaleOrderPayload,
  SaveSaleOrderDto,
  TenderMasterRow,
} from "@/features/sales/sale-order/sale-order.types";

/** One row of the browse list (configured grid 87, "SO - MAIN LIST"). */
export type SaleOrderListRow = {
  so_id: string;
  so_company_id: string;
  so_branch_id: string;
  so_acc_year: string;
  so_order_date: string | null;
  so_order_refno: string | null;
  so_order_type: string | null;
  cus_name: string | null;
  cus_addr3: string | null;
  so_tot_items: number | null;
  so_order_amt: string | number | null;
  so_status: string | null;
  so_print_count: number | null;
  so_created_by: string | null;
};

export type SaleOrderListQuery = {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  companyId: string;
  branchId: string;
  /** `yyyy-mm-dd` or "" — grid 87's NULLIF guards read "" as unbounded. */
  fromDate?: string;
  toDate?: string;
};

/** A uuid that matches nothing, so an unresolved tenant lists no rows. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

export type PartyCreditQuery = {
  partyId: string;
  companyId?: string;
  branchId?: string;
  accYear?: string;
};

export const saleOrderApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getSaleOrder: builder.query<SaleOrderPayload, SaleOrderDocKey>({
      // All four keys, always: the row is looked up by id + company + branch +
      // year together, so an order is only readable inside its own scope.
      query: (key) => ({ url: SALE_ORDER_GET_ENDPOINT, params: key }),
      transformResponse: (payload: ApiSuccessResponse<SaleOrderPayload>) => payload.data,
      providesTags: (_result, _error, key) => [{ type: "SaleOrder", id: key.soId }],
      keepUnusedDataFor: 0,
    }),
    saveSaleOrder: builder.mutation<SaleOrderPayload, SaveSaleOrderDto>({
      query: (body) => ({ url: SALE_ORDER_SAVE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<SaleOrderPayload>) => payload.data,
      invalidatesTags: ["SaleOrder"],
    }),
    deleteSaleOrder: builder.mutation<{ soId: string; deleted: boolean }, SaleOrderDocKey>({
      // Four query params, not two — soId + soAccYear alone is a 404.
      query: (key) => ({ url: SALE_ORDER_DELETE_ENDPOINT, method: "DELETE", params: key }),
      transformResponse: (payload: ApiSuccessResponse<{ soId: string; deleted: boolean }>) =>
        payload.data,
      invalidatesTags: ["SaleOrder"],
    }),
    // -- the browse list (no /sale-orders/list route; grid 87 is it) --------
    listSaleOrders: builder.query<ConfiguredGridPage<SaleOrderListRow>, SaleOrderListQuery>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: SALE_ORDER_LIST_GRID_ID,
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          ...(params.sort_by ? { sort_by: params.sort_by } : {}),
          ...(params.sort_dir ? { sort_dir: params.sort_dir } : {}),
          // Grid 87 binds exactly these four tokens — there is no year token;
          // the date window is the scope. Every token must be bound, the dates
          // as "" when open-ended.
          grid_param: JSON.stringify({
            icompany_id: params.companyId || NO_TENANT_ID,
            ibranch_id: params.branchId || NO_TENANT_ID,
            ifrom_date: params.fromDate ?? "",
            ito_date: params.toDate ?? "",
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<SaleOrderListRow>>) =>
        payload.data,
      providesTags: ["SaleOrder"],
      keepUnusedDataFor: 30,
    }),
    /**
     * The whole tender master in one call. The route filters ONLY
     * `tndIsDeleted` — inactive rows and every tenant's rows come back, and
     * there is no paging — so the caller narrows with `usableTenders`.
     */
    getTenderMasters: builder.query<TenderMasterRow[], void>({
      query: () => ({ url: TENDER_MASTERS_LIST_ENDPOINT }),
      transformResponse: (payload: ApiSuccessResponse<TenderMasterRow[]>) => payload.data ?? [],
      keepUnusedDataFor: 300,
    }),
    /**
     * The credit panel. camelCase params (its sibling customer-detail is
     * snake_case); never cached — the server sends `Cache-Control: no-store`
     * and the panel wants today's standing, not the mount's.
     */
    getPartyCredit: builder.query<PartyCreditSummary, PartyCreditQuery>({
      query: (params) => ({ url: PARTY_CREDIT_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<PartyCreditSummary>) => payload.data,
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useLazyGetSaleOrderQuery,
  useSaveSaleOrderMutation,
  useDeleteSaleOrderMutation,
  useListSaleOrdersQuery,
  useLazyListSaleOrdersQuery,
  useGetTenderMastersQuery,
  useLazyGetPartyCreditQuery,
} = saleOrderApi;
