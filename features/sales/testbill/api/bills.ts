/**
 * Sale Bill — the bill's own wire (§4.1), typed on `BillKey`.
 *
 * The RTK Query endpoints themselves are injected once, in
 * `@/store/api/saleBillApi` — `baseApi.injectEndpoints` runs with
 * `overrideExisting`, so a second injection under the same names would
 * silently replace the first for every screen. This module is the bill's
 * facade over them: the fourteen verbs and the reads this screen makes, plus
 * the few endpoints only this screen calls (a customer's quick add, the
 * temp-credit register). Nothing here builds a body; `payload/*` does.
 */
import { baseApi } from "@/store/api/baseApi";
import type { ApiSuccessResponse } from "@/utils/types";
import type { ConfiguredGridPage } from "@/store/api/quotationApi";
import { CONFIGURED_GRID_RUN_ENDPOINT } from "@/features/sales/quotation/quotation.constants";
import { getGridId } from "@/lib/configured-grids";
import {
  BILL_DELIVERY_LIST_GRID_KEY,
  CUSTOMER_CREATE_ENDPOINT,
  RETENDER_PICKER_GRID_KEY,
  TEMP_CREDIT_LIST_GRID_KEY,
} from "@/features/sales/testbill/constants";

export {
  saleBillApi,
  useLazyGetBillQuery,
  useSaveBillMutation,
  useValidateBillMutation,
  usePostBillMutation,
  useAmendBillMutation,
  useCancelBillMutation,
  useDeleteBillMutation,
  useCancelOrderLineMutation,
  useLazyGetOpenCreditsQuery,
  useListBillsQuery,
  useLazyGetPartyContextQuery,
  useLazyGetBillItemByBarcodeQuery,
  useLazyGetOpenSourcesQuery,
  useSaveBillTransportMutation,
  useLazyGetTenderContextQuery,
  useRetenderBillMutation,
  useUpdateDeliveryStatusMutation,
  useFollowUpTempCreditMutation,
  useLazyGetBranchAddressQuery,
  useListPromotionSchemesQuery,
} from "@/store/api/saleBillApi";
export type {
  BillListRow,
  BillListQuery,
  BranchAddress,
  DeliveryStatusDto,
  OpenSourceDoc,
  OpenSourceLine,
  OpenSourcesQuery,
  PartyContextQuery,
  RetenderBillDto,
  TempCreditFollowUpDto,
  TenderContext,
  TenderContextRow,
  TransportBandDto,
  TransportEndDto,
  BillTransportDto,
} from "@/store/api/saleBillApi";

/** A uuid that matches nothing, so an unresolved tenant lists no rows. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * `POST /customers/create` — the quick add (§7.7). Only the keys the dialog
 * asks for; the DTO's other sixty columns default server-side. `cusAreaId`,
 * `cusGroupId`, `cusStateCode`/`cusStateName` and `cusPriceLevelId` are the
 * required ones.
 */
export type QuickAddCustomerDto = {
  cusName: string;
  cusPhone1: string | null;
  cusGstNo: string | null;
  cusGstType: string;
  cusAreaId: string;
  cusGroupId: string;
  cusStateCode: string;
  cusStateName: string;
  cusPriceLevelId: number;
  cusCompanyId: string;
  cusBranchId: string;
  cusIsActive: true;
};

export type QuickAddCustomerResult = { cusId: string; cusName: string | null };

/** One row of grid 113, "MAIN LIST - BILL DELIVERY" (§24). */
export type BillDeliveryRow = {
  sb_id: string;
  sb_company_id: string;
  sb_branch_id: string;
  sb_acc_year: string;
  sb_bill_date: string | null;
  sb_bill_refno: string | null;
  sb_cust_name: string | null;
  sb_cust_place: string | null;
  sb_cust_phone: string | null;
  sb_bill_amt: string | number | null;
  sb_delivery_status: string | null;
  sb_delivered_on: string | null;
  sb_vehicle_no: string | null;
  driver_name: string | null;
  sb_status: string | null;
  sb_created_by: string | null;
};

/** One row of grid 114, "MAIN LIST - TEMP CREDITS" (§24). */
export type TempCreditRow = {
  atc_id: string;
  atc_company_id: string;
  atc_branch_id: string;
  atc_acc_year: string;
  atc_bill_date: string | null;
  atc_bill_refno: string | null;
  atc_name: string | null;
  atc_mobile: string | null;
  atc_place: string | null;
  atc_credit_amount: string | number | null;
  atc_balance_amount: string | number | null;
  atc_due_date: string | null;
  days_overdue: string | number | null;
  atc_status: string | null;
  atc_promise_date: string | null;
  atc_followup_on: string | null;
  atc_remarks: string | null;
  atc_created_by: string | null;
  atc_src_doc_id: string | null;
  atc_bill_amount: string | number | null;
};

/** One row of grid 115, "POPUP - RECENT BILLS FOR RE-TENDER" (§22). */
export type RetenderPickRow = {
  sb_id: string;
  sb_company_id: string;
  sb_branch_id: string;
  sb_acc_year: string;
  sb_bill_refno: string | null;
  sb_bill_datetime: string | null;
  sb_cust_name: string | null;
  sb_bill_amt: string | number | null;
  sb_pay_mode: string | null;
  sb_status: string | null;
  tenders: string | null;
};

type GridScope = { companyId: string; branchId: string; accYear: string };

export type DeliveryListQuery = GridScope & {
  page?: number;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  /** '' = the pending set (not NA, not DELIVERED); 'ALL'; or one status. */
  deliveryStatus?: string;
};

export type TempCreditListQuery = GridScope & {
  page?: number;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  /** '' = OPEN + PARTIAL; 'ALL'; or one status. */
  status?: string;
  overdueOnly?: boolean;
};

export type RetenderPickQuery = GridScope & {
  page?: number;
  limit?: number;
  /** The session's registered device; '' lists every device's. */
  deviceId?: string;
  fromDate?: string;
  toDate?: string;
};

/**
 * Every optional grid param is ALWAYS sent (`''` = unset): an unsent token is
 * bound as its own literal name by the runner (§24).
 */
function gridParams(scope: GridScope, extra: Record<string, string>): string {
  return JSON.stringify({
    icompany_id: scope.companyId || NO_TENANT_ID,
    ibranch_id: scope.branchId || NO_TENANT_ID,
    iacc_year: scope.accYear,
    ...extra,
  });
}

export const testBillApi = baseApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    quickAddCustomer: builder.mutation<QuickAddCustomerResult, QuickAddCustomerDto>({
      query: (body) => ({ url: CUSTOMER_CREATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<QuickAddCustomerResult>) => payload.data,
    }),

    /** Grid 113 — the delivery register (§24). */
    listBillDeliveries: builder.query<ConfiguredGridPage<BillDeliveryRow>, DeliveryListQuery>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId(BILL_DELIVERY_LIST_GRID_KEY),
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          grid_param: gridParams(params, {
            ifrom_date: params.fromDate ?? "",
            ito_date: params.toDate ?? "",
            idelivery_status: params.deliveryStatus ?? "",
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<BillDeliveryRow>>) => payload.data,
      providesTags: ["SaleBill"],
      keepUnusedDataFor: 30,
    }),

    /** Grid 114 — the temp-credit follow-up list (§24). */
    listTempCredits: builder.query<ConfiguredGridPage<TempCreditRow>, TempCreditListQuery>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId(TEMP_CREDIT_LIST_GRID_KEY),
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          grid_param: gridParams(params, {
            ifrom_date: params.fromDate ?? "",
            ito_date: params.toDate ?? "",
            istatus: params.status ?? "",
            ioverdue_only: params.overdueOnly ? "true" : "",
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<TempCreditRow>>) => payload.data,
      providesTags: ["SaleBill"],
      keepUnusedDataFor: 30,
    }),

    /** Grid 115 — Ctrl+F6's picker: this device's bills from today (§22). */
    listRetenderBills: builder.query<ConfiguredGridPage<RetenderPickRow>, RetenderPickQuery>({
      query: (params) => ({
        url: CONFIGURED_GRID_RUN_ENDPOINT,
        params: {
          grid_id: getGridId(RETENDER_PICKER_GRID_KEY),
          page: params.page ?? 1,
          limit: params.limit ?? 50,
          grid_param: gridParams(params, {
            idevice_id: params.deviceId ?? "",
            ifrom_date: params.fromDate ?? "",
            ito_date: params.toDate ?? "",
          }),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<ConfiguredGridPage<RetenderPickRow>>) => payload.data,
      providesTags: ["SaleBill"],
      keepUnusedDataFor: 0,
    }),
  }),
});

export const {
  useQuickAddCustomerMutation,
  useListBillDeliveriesQuery,
  useListTempCreditsQuery,
  useListRetenderBillsQuery,
} = testBillApi;
