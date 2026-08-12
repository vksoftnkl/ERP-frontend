/**
 * Sale Order Entry — types.
 *
 * Same three families as the quotation screen (`quotation.types.ts`), and the
 * shared shapes are IMPORTED from there rather than restated: the lookups, the
 * charge rows and the customer snapshot are byte-for-byte the same contracts.
 * What lives here is what the order adds — the `so*`/`soi*` wire shapes, the
 * tender detail (`td*`), the source trail, and the fulfilment/advance branches.
 *
 * Wire notes that differ from the quotation:
 *  - header and item `numeric` columns arrive as strings (Prisma Decimal), but
 *    tender and charge money arrive as real NUMBERS, and tender date-only
 *    columns as `yyyy-mm-dd` — three serializers on one payload;
 *  - `GET /sale-orders/get` and `DELETE /sale-orders/delete` want all four of
 *    `soId`, `soCompanyId`, `soBranchId`, `soAccYear`;
 *  - there is NO `advances[]` array. The server README promises one, the DTO
 *    has none, and `forbidNonWhitelisted` turns it into a 400.
 */
import type { Line } from "@/domain/pricing";
import type {
  DraftChargeRow,
  DraftLine as QuotationDraftLine,
  QuotationChargePayload,
  SaveQuotationChargeDto,
  WireDecimal,
} from "@/features/sales/quotation/quotation.types";
import type { TenderTypeCode } from "./tender/instruments";

// ---------------------------------------------------------------------------
// Save payload (POST /sale-orders/create)
// ---------------------------------------------------------------------------

export type SaveSaleOrderItemDto = {
  soiId?: string;
  soiLineNo?: number;
  soiItemId: string;
  /** `item_unit_conversion.iuc_id` — NOT a raw `unit_id`. */
  soiItemUnitId: string;
  soiPriceLevel?: number;
  soiSrcDocType?: string | null;
  soiSrcDocId?: string | null;
  soiSrcDocAccYear?: string | null;
  soiSrcDocRefno?: string | null;
  soiSrcLineNo?: number | null;
  soiToBaseFactor?: number;
  soiHsnCode?: string | null;
  soiEanCode?: string | null;
  soiSize?: string | null;
  soiGodownId?: string | null;
  soiIsTaxIncl?: boolean;
  soiIsPromo?: boolean;
  soiIsFree?: boolean;
  soiFreeType?: string | null;
  soiIsService?: boolean;
  soiHasFreight?: boolean;
  soiCaseQty?: number;
  soiOrderQty?: number;
  soiLengthQty?: number | null;
  soiNetQty?: number;
  soiWeightQty?: number | null;
  soiAvailableStock?: number;
  soiRate?: number;
  soiRatePreTax?: number;
  soiRateDiff?: number;
  soiActPrice?: number | null;
  soiMaxPrice?: number | null;
  soiMinPrice?: number | null;
  soiCostPrice?: number | null;
  soiCostPreTax?: number | null;
  soiItemDiscPerc?: number;
  soiItemDiscQty?: number;
  soiItemDiscAmt?: number;
  soiSplDiscPerc?: number;
  soiSplDiscQty?: number;
  soiSplDiscAmt?: number;
  soiSchDiscPerc?: number;
  soiSchDiscQty?: number;
  soiSchDiscAmt?: number;
  soiBillSchPerc?: number;
  soiBillSchQty?: number;
  soiBillSchAmt?: number;
  soiCashDiscPerc?: number;
  soiCashDiscAmt?: number;
  soiGrossAmt?: number;
  soiNetGross?: number | null;
  soiChrgBeforeTax?: number | null;
  soiChrgAfterTax?: number | null;
  soiTaxableAmt?: number;
  soiTaxPerc?: number;
  soiTaxAmt?: number;
  soiCgstPerc?: number;
  soiCgstAmt?: number;
  soiSgstPerc?: number;
  soiSgstAmt?: number;
  soiIgstPerc?: number;
  soiIgstAmt?: number;
  soiCessPerc?: number;
  soiCessPerUnit?: number;
  soiCessAmt?: number;
  soiFreightQty?: number;
  soiFreightAmt?: number;
  soiLoadQty?: number;
  soiLoadAmt?: number;
  soiUnloadQty?: number;
  soiUnloadAmt?: number;
  soiNetAmt?: number;
  soiSoldPrice?: number | null;
  soiSoldPreTax?: number | null;
  soiItemProfit?: number | null;
  soiProfitPreTax?: number | null;
  soiMrpSavings?: number | null;
  soiMrpSavingsPerc?: number | null;
  soiDeliveryDate?: string | null;
  soiSalesmanId?: string | null;
  soiSchemeId?: string | null;
  soiSchemeName?: string | null;
  soiRemarks?: string | null;
  // Deliberately ABSENT, so the type checker keeps them out of the payload:
  // soiDeliveredQty, soiCancelledQty, soiPendingQty, soiLineStatus — the
  // fulfilment quartet is server-owned and never sent (the plan's §4).
};

/** `charges[]` is the charge-detail module's DTO — same wire as the quotation. */
export type SaveSaleOrderChargeDto = SaveQuotationChargeDto;

/** One `tenders[]` entry — the tender-detail module's DTO, the fields this screen sends. */
export type SaveSaleOrderTenderDto = {
  tdId?: string;
  tdRowNo?: number;
  /** `acc_tender_master.tnd_id` — required on create. */
  tdTenderId: string;
  tdTenderTypeId?: number;
  tdTenderLedgerId?: string | null;
  tdAmount?: number;
  tdSurchargePerc?: number;
  tdSurchargeAmt?: number;
  tdSurchargeLedgerId?: string | null;
  /** Must equal round(amount + surcharge, 2) — the server re-derives and 400s a mismatch. */
  tdTotalAmt?: number;
  tdReceivedAmt?: number;
  tdChangeAmt?: number;
  tdRefNo?: string | null;
  tdAuthCode?: string | null;
  /** Exactly four digits or null — `ck_td_card_last4`. */
  tdCardLast4?: string | null;
  tdBankName?: string | null;
  tdPayerVpa?: string | null;
  tdInstrumentDate?: string | null;
  tdIsPdc?: boolean;
  tdSettleStatus?: string;
  tdSettleLedgerId?: string | null;
  tdExpectedSettleOn?: string | null;
  tdNotes?: string | null;
  tdCreatedBy?: string | null;
  tdModifiedBy?: string | null;
};

export type SaveSaleOrderDto = {
  /** Present → update, absent → create. There is no separate update route. */
  soId?: string;
  // Required on every request, create or update.
  soCompanyId: string;
  soBranchId: string;
  soAccYear: string;
  soPriceLevel: number;
  soCustName: string;
  soCustId: string;
  soUserId: string;
  /** A real FK to `fixed.device_master` (RESTRICT) — required and updatable. */
  soDeviceId: string;

  soCreatedBy?: string | null;
  soModifiedBy?: string | null;
  soSessionId?: string | null;
  soDocType?: string | null;
  soOrderType?: string | null;
  soUsrRefno?: string | null;
  soOrderDate?: string;
  soDeliveryDate?: string | null;
  soDeliverySlot?: string | null;
  soPriority?: string | null;
  soValidUntil?: string | null;
  soDeliveryMode?: string | null;
  soStatus?: string | null;
  soPrintCount?: number;

  soSrcDocType?: string | null;
  soSrcDocId?: string | null;
  soSrcDocAccYear?: string | null;
  soSrcDocRefno?: string | null;
  soSrcDocDate?: string | null;

  soCustAddr?: string | null;
  soCustPlace?: string | null;
  soCustPin?: string | null;
  soCustPhone?: string | null;
  soCustEmail?: string | null;
  soCustGstin?: string | null;
  soCustGstType?: string | null;
  soCustStcd?: string | null;
  soPosStcd?: string | null;
  soStateName?: string | null;
  soContactPerson?: string | null;
  soContactPhone?: string | null;

  soHasLoad?: boolean;
  soHasUnload?: boolean;
  soHasFreight?: boolean;
  soHasPromo?: boolean;

  /** `uuid[]` — an array or CSV; `''` clears to `[]`, never null. */
  soSalesmanId?: string[];
  soAgentId?: string | null;

  soTotItems?: number;
  soTotWeight?: number;
  soTotBags?: number;
  soGrossAmt?: number;
  soItemDisc?: number;
  soSplDisc?: number;
  soSchDisc?: number;
  soBillSchDisc?: number;
  soTaxableAmt?: number;
  soCgstAmt?: number;
  soSgstAmt?: number;
  soIgstAmt?: number;
  soCessAmt?: number;
  soTaxAmt?: number;
  soFreightAmt?: number;
  soLoadAmt?: number;
  soUnloadAmt?: number;
  soOtherAmt1?: number;
  soOtherAmt2?: number;
  soRoundOff?: number;
  soOrderAmt?: number;
  soTotalCost?: number | null;
  soMarginAmt?: number | null;
  soMarginPerc?: number | null;
  soMrpSavings?: number | null;
  soMrpSavingsPerc?: number | null;

  // Settlement roll-ups — the tender dialog's output (the plan's §5.1/§9).
  soTenderAmt?: number;
  soSurchargeAmt?: number;
  soRefundAmt?: number;
  /** UNPAID / PARTIAL / PAID, decided by the NET. Explicit null is rejected. */
  soPayStatus?: string;

  soPaymentTerms?: string | null;
  soDeliveryTerms?: string | null;
  soTermsConditions?: string | null;
  soRemarks?: string | null;
  soFreightCalcType?: string | null;
  soLoadingCalcType?: string | null;
  soDiscAlterBase?: boolean | null;

  items?: SaveSaleOrderItemDto[];
  charges?: SaveSaleOrderChargeDto[];
  tenders?: SaveSaleOrderTenderDto[];

  // Deliberately ABSENT so the compiler enforces the plan's §9: the advance
  // block (soAdvance*), the fulfilment caches (soFulfilStatus, soBilledAmt,
  // soPendingAmt, soCancelledAmt, soDeliveredItems, soLastBilledOn,
  // soCompletedOn) and soOrderSlno/soOrderRefno are server-owned. They are
  // OMITTED — `applyPresentFields` then leaves the stored values untouched,
  // which is a stronger guarantee than echoing them.
};

// ---------------------------------------------------------------------------
// Read payload (GET /sale-orders/get)
// ---------------------------------------------------------------------------

export type SaleOrderItemPayload = {
  soiId: string;
  soiLineNo: number | null;
  soiItemId: string;
  soiItemUnitId: string;
  soiPriceLevel: number | null;
  soiSrcDocType: string | null;
  soiSrcDocId: string | null;
  soiSrcDocAccYear: string | null;
  soiSrcDocRefno: string | null;
  soiSrcLineNo: number | null;
  soiToBaseFactor: WireDecimal;
  soiHsnCode: string | null;
  soiEanCode: string | null;
  soiSize: string | null;
  soiGodownId: string | null;
  soiIsTaxIncl: boolean;
  soiIsPromo: boolean;
  soiIsFree: boolean;
  soiFreeType: string | null;
  soiIsService: boolean;
  soiHasFreight: boolean;
  soiIsDeleted: boolean;
  soiCaseQty: WireDecimal;
  soiOrderQty: WireDecimal;
  soiLengthQty: WireDecimal;
  soiNetQty: WireDecimal;
  soiWeightQty: WireDecimal;
  soiAvailableStock: WireDecimal;
  soiDeliveredQty: WireDecimal;
  soiCancelledQty: WireDecimal;
  soiPendingQty: WireDecimal;
  soiRate: WireDecimal;
  soiRatePreTax: WireDecimal;
  soiRateDiff: WireDecimal;
  soiActPrice: WireDecimal;
  soiMaxPrice: WireDecimal;
  soiMinPrice: WireDecimal;
  soiCostPrice: WireDecimal;
  soiCostPreTax: WireDecimal;
  soiItemDiscPerc: WireDecimal;
  soiItemDiscQty: WireDecimal;
  soiItemDiscAmt: WireDecimal;
  soiSplDiscPerc: WireDecimal;
  soiSplDiscQty: WireDecimal;
  soiSplDiscAmt: WireDecimal;
  soiSchDiscPerc: WireDecimal;
  soiSchDiscQty: WireDecimal;
  soiSchDiscAmt: WireDecimal;
  soiBillSchPerc: WireDecimal;
  soiBillSchQty: WireDecimal;
  soiBillSchAmt: WireDecimal;
  soiCashDiscPerc: WireDecimal;
  soiCashDiscAmt: WireDecimal;
  soiGrossAmt: WireDecimal;
  soiNetGross: WireDecimal;
  soiChrgBeforeTax: WireDecimal;
  soiChrgAfterTax: WireDecimal;
  soiTaxableAmt: WireDecimal;
  soiTaxPerc: WireDecimal;
  soiTaxAmt: WireDecimal;
  soiCgstPerc: WireDecimal;
  soiCgstAmt: WireDecimal;
  soiSgstPerc: WireDecimal;
  soiSgstAmt: WireDecimal;
  soiIgstPerc: WireDecimal;
  soiIgstAmt: WireDecimal;
  soiCessPerc: WireDecimal;
  soiCessPerUnit: WireDecimal;
  soiCessAmt: WireDecimal;
  soiFreightQty: WireDecimal;
  soiFreightAmt: WireDecimal;
  soiLoadQty: WireDecimal;
  soiLoadAmt: WireDecimal;
  soiUnloadQty: WireDecimal;
  soiUnloadAmt: WireDecimal;
  soiNetAmt: WireDecimal;
  soiSoldPrice: WireDecimal;
  soiSoldPreTax: WireDecimal;
  soiItemProfit: WireDecimal;
  soiProfitPreTax: WireDecimal;
  soiMrpSavings: WireDecimal;
  soiMrpSavingsPerc: WireDecimal;
  soiDeliveryDate: string | null;
  soiLineStatus: string | null;
  soiSalesmanId: string | null;
  soiSchemeId: string | null;
  soiSchemeName: string | null;
  soiRemarks: string | null;
  /** Joined display names — populated on GET only, null on the save response. */
  soiItemName: string | null;
  soiUnitName: string | null;
  soiGodownName: string | null;
  soiDecimalCount: number | null;
  soiGroupId: string | null;
  soiBrandId: string | null;
  soiSectionId: string | null;
  soiCategoryId: string | null;
};

/** Charge rows are the charge-detail module's payload — same as the quotation's. */
export type SaleOrderChargePayload = QuotationChargePayload & {
  cdLedgerName?: string | null;
};

/**
 * One `acc_tender_detail` row as the GET returns it. Unlike the header/items,
 * tender money comes back as NUMBERS and date-only columns as `yyyy-mm-dd`.
 */
export type SaleOrderTenderPayload = {
  tdId: string;
  tdRowNo: number;
  tdTenderId: string;
  /** Emitted as a string (bigint-ish column); `"5"` = CHEQUE. */
  tdTenderTypeId: string | number;
  tdTenderLedgerId: string | null;
  tdPartyLedgerId: string | null;
  tdAmount: number;
  tdSurchargePerc: number;
  tdSurchargeAmt: number;
  tdSurchargeLedgerId: string | null;
  tdTotalAmt: number;
  tdReceivedAmt: number;
  tdChangeAmt: number;
  tdRefNo: string | null;
  tdAuthCode: string | null;
  tdCardLast4: string | null;
  tdBankName: string | null;
  tdPayerVpa: string | null;
  tdInstrumentDate: string | null;
  tdIsPdc: boolean;
  tdSettleStatus: string;
  tdSettleLedgerId: string | null;
  tdExpectedSettleOn: string | null;
  tdSettledOn: string | null;
  tdVoucherId: string | null;
  tdDocDate: string | null;
  tdIsDeleted?: boolean;
  tdNotes: string | null;
  /** Resolved names, GET only. */
  tdTenderName?: string | null;
  tdTenderLedgerName?: string | null;
};

export type SaleOrderPayload = {
  soId: string;
  soCompanyId: string;
  soBranchId: string;
  soAccYear: string;
  soPriceLevel: number;
  soDocType: string | null;
  soOrderType: string | null;
  /** bigint — always a string. Never parse it as an integer. */
  soOrderSlno: string;
  soOrderRefno: string | null;
  soUsrRefno: string | null;
  soOrderDate: string | null;
  soDeliveryDate: string | null;
  soDeliverySlot: string | null;
  soPriority: string | null;
  soValidUntil: string | null;
  soDeliveryMode: string | null;
  soStatus: string | null;
  soVersionNo: number | null;
  soSrcDocType: string | null;
  soSrcDocId: string | null;
  soSrcDocAccYear: string | null;
  soSrcDocRefno: string | null;
  soSrcDocDate: string | null;
  soCustId: string;
  soCustName: string;
  soCustAddr: string | null;
  soCustPlace: string | null;
  soCustPin: string | null;
  soCustPhone: string | null;
  soCustEmail: string | null;
  soCustGstin: string | null;
  soCustGstType: string | null;
  soCustStcd: string | null;
  soPosStcd: string | null;
  soStateName: string | null;
  soContactPerson: string | null;
  soContactPhone: string | null;
  soHasLoad: boolean;
  soHasUnload: boolean;
  soHasFreight: boolean;
  soHasPromo: boolean;
  soUserId: string;
  soSalesmanId: string[] | null;
  soAgentId: string | null;
  soTotItems: number;
  soDeliveredItems: number | null;
  soTotWeight: WireDecimal;
  soTotBags: WireDecimal;
  soGrossAmt: WireDecimal;
  soItemDisc: WireDecimal;
  soSplDisc: WireDecimal;
  soSchDisc: WireDecimal;
  soBillSchDisc: WireDecimal;
  soTaxableAmt: WireDecimal;
  soCgstAmt: WireDecimal;
  soSgstAmt: WireDecimal;
  soIgstAmt: WireDecimal;
  soCessAmt: WireDecimal;
  soTaxAmt: WireDecimal;
  soFreightAmt: WireDecimal;
  soLoadAmt: WireDecimal;
  soUnloadAmt: WireDecimal;
  soOtherAmt1: WireDecimal;
  soOtherAmt2: WireDecimal;
  soRoundOff: WireDecimal;
  soOrderAmt: WireDecimal;
  soTotalCost: WireDecimal;
  soMarginAmt: WireDecimal;
  soMarginPerc: WireDecimal;
  soMrpSavings: WireDecimal;
  soMrpSavingsPerc: WireDecimal;
  // Advance block — server-owned, painted read-only and never sent back.
  soAdvancePolicy: string | null;
  soAdvancePerc: WireDecimal;
  soAdvanceRequired: WireDecimal;
  soAdvanceDueDate: string | null;
  soIsAdvanceMandatory: boolean;
  soAdvanceLedgerId: string | null;
  soAdvanceRecdAmt: WireDecimal;
  soAdvanceAdjustedAmt: WireDecimal;
  soAdvanceRefundAmt: WireDecimal;
  soAdvanceForfeitAmt: WireDecimal;
  soAdvanceBalanceAmt: WireDecimal;
  soAdvanceStatus: string | null;
  soAdvanceRecdOn: string | null;
  // Settlement caches.
  soPayMode: string | null;
  soSurchargeAmt: WireDecimal;
  soTenderAmt: WireDecimal;
  soRefundAmt: WireDecimal;
  soPayStatus: string | null;
  // Fulfilment caches — server-owned.
  soBilledAmt: WireDecimal;
  soCancelledAmt: WireDecimal;
  soPendingAmt: WireDecimal;
  soFulfilStatus: string | null;
  soLastBilledOn: string | null;
  soCompletedOn: string | null;
  soPaymentTerms: string | null;
  soDeliveryTerms: string | null;
  soTermsConditions: string | null;
  soRemarks: string | null;
  soPrintCount: number;
  soIsDeleted: boolean;
  soCreatedOn: string | null;
  soCreatedBy: string | null;
  soModifiedOn: string | null;
  soModifiedBy: string | null;
  soFreightCalcType: string | null;
  soLoadingCalcType: string | null;
  soDiscAlterBase: boolean | null;
  /** Resolved names, GET only. */
  soCompanyName?: string | null;
  soBranchName?: string | null;
  soSalesmanName?: (string | null)[] | null;
  items?: SaleOrderItemPayload[];
  charges?: SaleOrderChargePayload[];
  tenders?: SaleOrderTenderPayload[];
};

/** GET / DELETE both key on all four — the voucher's own tenant scope. */
export type SaleOrderDocKey = {
  soId: string;
  soCompanyId: string;
  soBranchId: string;
  soAccYear: string;
};

// ---------------------------------------------------------------------------
// Party credit (`GET /master-lookups/party-credit`)
// ---------------------------------------------------------------------------

/**
 * The credit panel's one source of truth, exactly as the wire spells it.
 * `partyId` is the CUSTOMER id (`customers.cus_id`); an unknown one is a 404,
 * not a zeroed 200. `pendingAmount` is the NET outstanding (DR − CR) and can be
 * negative; `availableCreditAmount` / `availableBillCount` are null whenever
 * `isCreditCheckEnabled` is false — off is an answer, not missing data, and it
 * takes the panel out of the save gate entirely (the plan's §7.2). There is no
 * status text on the wire; the client words it.
 */
export type PartyCreditSummary = {
  partyId: string;
  partyName: string | null;
  accYear: string | null;
  /** `yyyy-mm-dd` — the DB date the overdue split was judged against. */
  asOnDate: string;
  pendingAmount: number;
  pendingBillCount: number;
  overdueAmount: number;
  overdueBillCount: number;
  oldestOverdueDueDate: string | null;
  maxOverdueDays: number;
  creditAmtLimit: number;
  creditBillLimit: number;
  availableCreditAmount: number | null;
  availableBillCount: number | null;
  isAmtLimitExceeded: boolean;
  isBillLimitExceeded: boolean;
  isCreditCheckEnabled: boolean;
};

// ---------------------------------------------------------------------------
// Tender master (`GET /tender-masters/list`)
// ---------------------------------------------------------------------------

/**
 * One `acc_tender_master` row. The list endpoint filters ONLY `tndIsDeleted` —
 * inactive rows come back and the client must drop them itself, along with rows
 * outside their effective window (judged against the DOCUMENT date, not the
 * wall clock). The three nullable behaviour flags are OVERRIDES of the tender
 * TYPE's defaults — null means inherit, never false (`tender/rows.ts`).
 */
export type TenderMasterRow = {
  tndId: string;
  tndCompanyId: string;
  tndBranchId: string | null;
  /** The numeric `acc_tender_types` id, serialized as a string ("5" = CHEQUE). */
  tndTypeId: string;
  tndName: string;
  tndShortName: string;
  tndLedgerId: string;
  tndSettlementLedgerId: string | null;
  tndTypeName: string | null;
  tndLedgerName: string | null;
  tndSurchargeLedgerName: string | null;
  tndSettlementDays: number;
  tndMinAmount: number;
  tndMaxAmount: number | null;
  tndDailyLimit: number | null;
  tndSurchargePerc: number;
  tndSurchargeAmount: number;
  tndSurchargeLedgerId: string | null;
  tndEditSurcharge: boolean;
  tndEditLedger: boolean;
  tndConversionRate: number;
  tndNeedsRef: boolean | null;
  tndAllowChange: boolean | null;
  tndAllowInReturn: boolean | null;
  tndOpenCashDrawer: boolean;
  tndIsDefault: boolean;
  tndDisplayPosition: number;
  tndHotkey: string | null;
  tndColour: string | null;
  /** Date-only `yyyy-mm-dd`, unlike the audit timestamps. */
  tndEffectiveFrom: string | null;
  tndEffectiveTo: string | null;
  tndIsActive: boolean;
  tndIsDeleted: boolean;
};

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

/**
 * The four display-only, server-owned fulfilment figures of a line (the last
 * four columns of grid 24). A separate READONLY branch of the row on purpose:
 * `buildSaveItemPayload` takes the flat line and cannot see these, so they can
 * never leak into a POST (the plan's §4).
 */
export type LineFulfilment = {
  readonly deliveredQty: number;
  readonly cancelledQty: number;
  readonly pendingQty: number;
  readonly lineStatus: string;
};

/**
 * One order line: the quotation draft line (which is the engine `Line` plus
 * everything the engine does not read) extended with the order's own columns.
 * The inherited `sqiId` is dead weight on this screen — `soiId` is the server
 * id here — but inheriting the whole shape is what lets the order reuse the
 * quotation's grid components unchanged.
 */
export type SaleOrderDraftLine = QuotationDraftLine & {
  soiId: string | null;
  /** Source trail — stamped by the quotation import, cleared by Copy as new. */
  srcDocType: string | null;
  srcDocAccYear: string | null;
  srcDocRefno: string | null;
  srcLineNo: number | null;
  /** Per-line requested delivery date (`soi_delivery_date`). */
  deliveryDate: string | null;
  /** Absent on a new line; painted from the GET on a loaded one. */
  fulfilment?: LineFulfilment;
};

/** One row of the tender dialog's grid — master snapshot plus the keyed money. */
export type TenderDraftRow = {
  key: string;
  tdId: string | null;
  /** `acc_tender_master.tnd_id`. */
  tenderId: string;
  tenderTypeId: number;
  typeCode: TenderTypeCode;
  tenderName: string;
  tenderLedgerId: string | null;
  settleLedgerId: string | null;
  surchargeLedgerId: string | null;
  surchargePerc: number;
  surchargeFlat: number;
  settlementDays: number;
  allowChange: boolean;
  needsRef: boolean;
  /** What the operator typed in the amount cell. */
  keyed: number;
  /**
   * `td_settle_status` as loaded — echoed back so an edit cannot reset a row
   * the settlement screen already moved past `NA`.
   */
  settleStatus: string;
  refNo: string | null;
  authCode: string | null;
  bankName: string | null;
  /** Raw digits typed; `cardLast4OrNull` shapes them at payload time. */
  cardDigits: string | null;
  /** `yyyy-mm-dd` — cheque date or card expiry, per the type's instrument spec. */
  instrumentDate: string | null;
  notes: string | null;
};

/** The advance block as loaded — painted read-only, never sent back. */
export type AdvanceEcho = {
  policy: string | null;
  perc: number;
  required: number;
  dueDate: string | null;
  isMandatory: boolean;
  ledgerId: string | null;
  recdAmt: number;
  adjustedAmt: number;
  refundAmt: number;
  forfeitAmt: number;
  balanceAmt: number;
  status: string | null;
  recdOn: string | null;
};

/** The header-level fulfilment caches as loaded — read-only. */
export type FulfilmentEcho = {
  status: string | null;
  billedAmt: number;
  cancelledAmt: number;
  pendingAmt: number;
  deliveredItems: number;
  lastBilledOn: string | null;
  completedOn: string | null;
};

/**
 * The settlement roll-ups the save sends (`soTenderAmt` gross, `soSurchargeAmt`
 * fee, `soRefundAmt`, `soPayStatus` from the net). Written by the tender dialog
 * on OK; on load they are the stored figures until the dialog runs again.
 */
export type SettlementState = {
  tenderAmt: number;
  surchargeAmt: number;
  refundAmt: number;
  payStatus: string;
};

/** The document the order was raised from — derived from `soSrcDoc*`, never toggled. */
export type SourceTrail = {
  docType: string;
  docId: string;
  accYear: string | null;
  refno: string | null;
  /** `yyyy-mm-dd`. */
  date: string | null;
};

export type SaleOrderHeader = {
  usrRefno: string;
  orderDate: string;
  /** '' = not stated. Validated ≥ orderDate when present. */
  deliveryDate: string;
  deliverySlot: string;
  validUntil: string;
  priority: string;
  orderType: string;
  deliveryMode: string;
  contactPerson: string;
  contactNo: string;
  salesmanId: string | null;
  salesmanName: string;
  agentId: string | null;
  agentName: string;
  posStateCode: string;
  posStateName: string;
  hasFreight: boolean;
  hasLoad: boolean;
  hasUnload: boolean;
  hasPromo: boolean;
  priceLevel: number;
};

export type SaleOrderTerms = {
  remarks: string;
  paymentTerms: string;
  deliveryTerms: string;
  termsConditions: string;
};

export type SaleOrderMode = "entry" | "browse";
export type SaleOrderPricingSource = "live" | "stored";

export type SaleOrderDraft = {
  mode: SaleOrderMode;
  pricing: SaleOrderPricingSource;
  isDirty: boolean;

  // Tenant context — the VOUCHER's (see the quotation's rules; identical here).
  companyId: string;
  branchId: string;
  accYear: string;
  companyStateCode: string;

  // Server-owned identity.
  docId: string | null;
  orderSlno: string;
  orderRefno: string;
  versionNo: number;
  docType: string;
  status: string;
  isNewEntry: boolean;
  isDeleted: boolean;

  policy: import("@/domain/pricing").VoucherPolicy;
  customer: import("@/features/sales/quotation/quotation.types").CustomerSnapshot;
  header: SaleOrderHeader;
  terms: SaleOrderTerms;
  lines: SaleOrderDraftLine[];
  charges: DraftChargeRow[];
  isLocalSale: boolean;
  freightBands: import("@/features/sales/quotation/quotation.types").FreightBand[];
  storedPricing: import("@/domain/pricing").DocumentPricing | null;

  // ----- what the order adds over the quotation -----
  /** Non-null exactly when `soSrcDocId` is set. Cleared by Copy as new. */
  source: SourceTrail | null;
  /** The dialog's rows — advance receipts on this screen. */
  tenders: TenderDraftRow[];
  settlement: SettlementState;
  advance: AdvanceEcho;
  fulfilment: FulfilmentEcho;
  /**
   * "Put this bill on credit anyway?" — answered once per settle and remembered
   * HERE, as draft state, never as a member flag (the plan's §5.4/§14).
   */
  creditOverride: boolean;
  /** The credit panel's data; null until a customer is picked or it failed. */
  partyCredit: PartyCreditSummary | null;
};

/** What `validate` returns — same contract as the quotation's. */
export type SaleOrderViolation = {
  message: string;
  field: string;
  lineKey?: string;
  /** `true` → confirm-and-continue (the credit gate), not a refusal. */
  confirm?: boolean;
};
