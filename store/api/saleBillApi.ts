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
import {
  CONFIGURED_GRID_RUN_ENDPOINT,
  ITEM_BY_BARCODE_ENDPOINT,
} from "@/features/sales/quotation/quotation.constants";
import type { BarcodeItemLookup } from "@/features/sales/quotation/quotation.types";
import {
  BILL_AMEND_ENDPOINT,
  BILL_CANCEL_ENDPOINT,
  BILL_DELETE_ENDPOINT,
  BILL_DELIVERY_STATUS_ENDPOINT,
  BILL_GET_ENDPOINT,
  BILL_LIST_GRID_KEY,
  BILL_OPEN_SOURCES_ENDPOINT,
  BILL_PARTY_CONTEXT_ENDPOINT,
  BILL_POST_ENDPOINT,
  BILL_RETENDER_ENDPOINT,
  BILL_SAVE_ENDPOINT,
  BILL_TENDER_CONTEXT_ENDPOINT,
  BILL_TRANSPORT_ENDPOINT,
  BILL_VALIDATE_ENDPOINT,
  BRANCH_GET_ENDPOINT,
  GST_EINVOICE_GENERATE_ENDPOINT,
  GST_EWAYBILL_GENERATE_ENDPOINT,
  GST_EWAYBILL_VEHICLE_ENDPOINT,
  OPEN_CREDITS_ENDPOINT,
  PROMOTION_SCHEME_LIST_ENDPOINT,
  SALE_ORDER_CANCEL_LINES_ENDPOINT,
  TEMP_CREDIT_FOLLOW_UP_ENDPOINT,
  type DeliveryEvent,
} from "@/features/sales/salebill/salebill.constants";
import type {
  AdjustableCredit,
  AmendBillDto,
  BillKey,
  BillPayload,
  CancelBillDto,
  CancelBillResult,
  CancelOrderResult,
  DeleteBillDto,
  PartyContext,
  PostBillDto,
  SaleBillDocKey,
  SaveBillDto,
  ValidateBillDto,
  ValidateBillResult,
} from "@/features/sales/salebill/salebill.types";
import { parsePartyContext } from "@/features/sales/salebill/salebill.party";
import {
  parsePromotionSchemes,
  type PromotionScheme,
} from "@/features/sales/salebill/promotions/rules";
import { getGridId } from "@/lib/configured-grids";

/** `GET /bills/party-context` — BARE keys, `billDate` drives the credit ageing (§7.3). */
export type PartyContextQuery = {
  partyId: string;
  companyId: string;
  branchId: string;
  accYear: string;
  /** `yyyy-mm-dd`. */
  billDate: string;
};

/** `GET /bills/open-sources` — BARE keys (§13.4). */
export type OpenSourcesQuery = {
  companyId: string;
  branchId: string;
  partyId: string;
  kind: "DC" | "ORDER";
  accYear?: string;
};

export type OpenSourceLine = {
  lineId: string;
  lineNo: number;
  itemId: string;
  itemName: string | null;
  unitId: string | null;
  unitName: string | null;
  lotId: string | null;
  batchNo: string | null;
  godownId: string | null;
  docQty: number;
  openQty: number;
  freeQty: number;
  rate: number;
  taxId: string | null;
  taxPerc: number;
  hsnCode: string | null;
};

export type OpenSourceDoc = {
  docId: string;
  accYear: string;
  refno: string | null;
  date: string | null;
  purpose: string | null;
  ageDays: number;
  pastWindow: boolean;
  convertRequired?: boolean;
  lines: OpenSourceLine[];
};

/** `PUT /bills/transport` body (§20.3). */
export type TransportEndDto = {
  godownId?: string | null;
  branchId?: string | null;
  addrId?: string | null;
  name?: string | null;
  addr?: string | null;
  place?: string | null;
  pin?: string | null;
  phone?: string | null;
  stcd?: string | null;
  gstin?: string | null;
};
export type TransportBandDto = {
  direction: "OUTWARD" | "INWARD";
  from?: TransportEndDto | null;
  to?: TransportEndDto | null;
  mode?: string | null;
  transporterId?: string | null;
  transporterName?: string | null;
  transporterGstin?: string | null;
  lrNo?: string | null;
  lrDate?: string | null;
  distanceKm?: number | null;
  remarks?: string | null;
};
export type BillTransportDto = BillKey & { transport: TransportBandDto };

/** `GET /bills/tender-context` — the re-tender dialog's ONLY read (§22). */
export type TenderContextRow = {
  tdId: string;
  tenderName: string | null;
  tdTenderId: string;
  tdTenderTypeId: number;
  tdAmount: number;
  tdIsPdc: boolean;
  pdcMoved: boolean;
  isLoyalty: boolean;
  isTempCredit: boolean;
  isVoided: boolean;
  replacesId: string | null;
};
export type TenderContext = {
  sbBillRefno: string | null;
  sbBillDate: string;
  sbCustName: string | null;
  sbBillAmt: number;
  sbPaidAmt: number;
  sbBalanceAmt: number;
  sbStatus: string;
  tenders: TenderContextRow[];
  canRetender: boolean;
  reason: string | null;
};

/** `POST /bills/retender` (§22). `tenders[]` are full §15.10 rows. */
export type RetenderBillDto = BillKey & {
  voids: Array<{ tdId: string; reason: string }>;
  tenders: Record<string, unknown>[];
  remark: string;
};

/** `PUT /bills/delivery-status` (§24). */
export type DeliveryStatusDto = BillKey & {
  event: DeliveryEvent;
  remarks?: string | null;
  vehicleNo?: string | null;
  lrNo?: string | null;
};

/** `PUT /temp-credits/follow-up` (§24): `promiseDate` three-way — omitted keep, null clear, date set. */
export type TempCreditFollowUpDto = {
  atcId: string;
  atcAccYear: string;
  remarks: string;
  promiseDate?: string | null;
};

/** `GET /branch-masters/get?brId` — what the dispatch-from block reads (§20.2). */
export type BranchAddress = {
  brId: string;
  brName: string | null;
  brMailingName: string | null;
  brAddr1: string | null;
  brAddr2: string | null;
  brAddr3: string | null;
  brCity: string | null;
  brPin: string | number | null;
  brPhone: string | null;
  brStateCode: string | null;
  brStateName: string | null;
  brGstin: string | null;
};

/** The GST actions (§21). `sync: true` waits for the portal's answer. */
export type GstGenerateDto = BillKey & { sync: true };
export type GstVehicleDto = {
  gdrId: string;
  vehicleNo: string;
  mode: string | null;
  reasonCode: number;
  remark: string | null;
  fromPlace: string | null;
  fromState: string | null;
};

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

    // -- the lifecycle (§4.1, §17) -------------------------------------------
    //
    // All five are MUTATIONS, including the dry run: a query would be cached
    // and de-duplicated by its arguments, and a second validate of the same
    // payload must go to the server again — the party's credit may have moved.

    /**
     * `POST /bills/validate` — writes nothing. A 422 is the ANSWER, not an
     * error: the hook reads its refusals off the error body (§16).
     */
    validateBill: builder.mutation<ValidateBillResult, ValidateBillDto>({
      query: (body) => ({ url: BILL_VALIDATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<ValidateBillResult>) => payload.data,
    }),

    /** `POST /bills/post` — the one-way door. Idempotent on a POSTED id. */
    postBill: builder.mutation<BillPayload, PostBillDto>({
      query: (body) => ({ url: BILL_POST_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<BillPayload>) => payload.data,
      // Stock moved, the party owes, credits were spent, the order drew down.
      invalidatesTags: ["SaleBill", "PartyCredit", "SaleOrder"],
    }),

    /** `POST /bills/amend` — restates the voucher in place, revision + 1. */
    amendBill: builder.mutation<BillPayload, AmendBillDto>({
      query: (body) => ({ url: BILL_AMEND_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<BillPayload>) => payload.data,
      invalidatesTags: ["SaleBill", "PartyCredit", "SaleOrder"],
    }),

    /**
     * `POST /bills/cancel` — POSTED only, by reversal. The answer is NOT the
     * `/get` shape; the screen reloads after (§17.9).
     */
    cancelBill: builder.mutation<CancelBillResult, CancelBillDto>({
      query: (body) => ({ url: BILL_CANCEL_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<CancelBillResult>) => payload.data,
      invalidatesTags: ["SaleBill", "PartyCredit", "SaleOrder"],
    }),

    /** `POST /bills/delete` — DRAFT only. A body, not a query DELETE. */
    deleteBill: builder.mutation<{ sbId: string; deleted: boolean }, DeleteBillDto>({
      query: (body) => ({ url: BILL_DELETE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<{ sbId: string; deleted: boolean }>) =>
        payload.data,
      invalidatesTags: ["SaleBill"],
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
          grid_id: getGridId(BILL_LIST_GRID_KEY),
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

    /**
     * `GET /bills/party-context` (§7.3): everything the screen needs on a
     * customer pick. Never cached — the standing is as of today, and the
     * caller keys the reply by the customer it asked for.
     */
    getPartyContext: builder.query<PartyContext, PartyContextQuery>({
      query: (params) => ({ url: BILL_PARTY_CONTEXT_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<unknown>, _meta, arg) =>
        parsePartyContext(payload, arg.partyId, arg.billDate),
      keepUnusedDataFor: 0,
    }),

    /** `GET /bills/open-sources` (§13.4): the party's open challans or orders. */
    getOpenSources: builder.query<OpenSourceDoc[], OpenSourcesQuery>({
      query: (params) => ({
        url: BILL_OPEN_SOURCES_ENDPOINT,
        params: {
          companyId: params.companyId,
          branchId: params.branchId,
          partyId: params.partyId,
          kind: params.kind,
          ...(params.accYear ? { accYear: params.accYear } : {}),
        },
      }),
      transformResponse: (payload: ApiSuccessResponse<OpenSourceDoc[]>) => payload.data ?? [],
      keepUnusedDataFor: 0,
    }),

    /** `PUT /bills/transport` (§20.3): the band on its own verb, on a POSTED bill. */
    saveBillTransport: builder.mutation<Record<string, unknown>, BillTransportDto>({
      query: (body) => ({ url: BILL_TRANSPORT_ENDPOINT, method: "PUT", body }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data,
      invalidatesTags: ["SaleBill"],
    }),

    /** `GET /bills/tender-context` (§22). */
    getTenderContext: builder.query<TenderContext, BillKey>({
      query: (key) => ({ url: BILL_TENDER_CONTEXT_ENDPOINT, params: key }),
      transformResponse: (payload: ApiSuccessResponse<TenderContext>) => payload.data,
      keepUnusedDataFor: 0,
    }),

    /** `POST /bills/retender` (§22): change how it was paid, not what was sold. */
    retenderBill: builder.mutation<BillPayload, RetenderBillDto>({
      query: (body) => ({ url: BILL_RETENDER_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<BillPayload>) => payload.data,
      invalidatesTags: ["SaleBill"],
    }),

    /** `PUT /bills/delivery-status` (§24). */
    updateDeliveryStatus: builder.mutation<{ sbDeliveryStatus: string }, DeliveryStatusDto>({
      query: (body) => ({ url: BILL_DELIVERY_STATUS_ENDPOINT, method: "PUT", body }),
      transformResponse: (payload: ApiSuccessResponse<{ sbDeliveryStatus: string }>) => payload.data,
      invalidatesTags: ["SaleBill"],
    }),

    /** `PUT /temp-credits/follow-up` (§24). */
    followUpTempCredit: builder.mutation<Record<string, unknown>, TempCreditFollowUpDto>({
      query: (body) => ({ url: TEMP_CREDIT_FOLLOW_UP_ENDPOINT, method: "PUT", body }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data,
    }),

    /** `GET /branch-masters/get?brId` (§20.2). */
    getBranchAddress: builder.query<BranchAddress, string>({
      query: (brId) => ({ url: BRANCH_GET_ENDPOINT, params: { brId } }),
      transformResponse: (payload: ApiSuccessResponse<BranchAddress>) => payload.data,
      keepUnusedDataFor: 300,
    }),

    /**
     * `GET /promotion-scheme/list?company=` (§11): the whole graph, NEVER
     * narrowed by branch (it matches the column literally and drops
     * company-wide schemes). Cached per company; the caller keys its pass on
     * the bill date.
     */
    listPromotionSchemes: builder.query<PromotionScheme[], string>({
      query: (companyId) => ({ url: PROMOTION_SCHEME_LIST_ENDPOINT, params: { company: companyId } }),
      transformResponse: (payload: ApiSuccessResponse<unknown>) => parsePromotionSchemes(payload),
      keepUnusedDataFor: 300,
    }),

    // -- the GST actions (§21). Not on the test box (404): the screen shows the answer.
    generateEinvoice: builder.mutation<Record<string, unknown>, GstGenerateDto>({
      query: (body) => ({ url: GST_EINVOICE_GENERATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data,
      invalidatesTags: ["SaleBill"],
    }),
    generateEwaybill: builder.mutation<Record<string, unknown>, GstGenerateDto>({
      query: (body) => ({ url: GST_EWAYBILL_GENERATE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data,
      invalidatesTags: ["SaleBill"],
    }),
    updateEwaybillVehicle: builder.mutation<Record<string, unknown>, GstVehicleDto>({
      query: (body) => ({ url: GST_EWAYBILL_VEHICLE_ENDPOINT, method: "POST", body }),
      transformResponse: (payload: ApiSuccessResponse<Record<string, unknown>>) => payload.data,
      invalidatesTags: ["SaleBill"],
    }),

    /**
     * `GET /master-lookups/item-by-barcode?barcode&company_id` (§9.2).
     * `company_id` is optional on the server but ALWAYS sent: without it one
     * scan on the box resolved to another company's item. Its own endpoint
     * name, because `baseApi` injects with `overrideExisting` and a generic
     * `getItemByBarcode` would replace the quotation's.
     */
    getBillItemByBarcode: builder.query<BarcodeItemLookup, { barcode: string; company_id: string }>({
      query: (params) => ({ url: ITEM_BY_BARCODE_ENDPOINT, params }),
      transformResponse: (payload: ApiSuccessResponse<BarcodeItemLookup>) => payload.data,
      keepUnusedDataFor: 0,
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
  useGenerateEinvoiceMutation,
  useGenerateEwaybillMutation,
  useUpdateEwaybillVehicleMutation,
} = saleBillApi;
