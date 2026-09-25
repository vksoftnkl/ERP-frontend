/**
 * Sale Bill — `/bills/get` → draft (§19), and the two answers that fold a
 * lifecycle response back onto a draft without repainting it. Pure.
 *
 * Decimals arrive as STRINGS (`"1234.5"`, tiny values in exponent form),
 * date-only columns as full ISO datetimes; every number goes through the
 * lenient `toNumber` and every date is sliced (§4.3). Nothing here reprices:
 * a loaded bill is history, and its lines are `stored` until the operator
 * touches one (§5.2).
 */
import { defaultPolicy } from "@/domain/pricing";
import { clampPriceLevel, emptyCustomer } from "@/features/sales/quotation/quotation.state";
import type { DraftChargeRow } from "@/features/sales/quotation/quotation.types";
import {
  asEnum,
  nextRowKey,
  toDateInput,
  toNullableNumber,
  toNumber,
} from "@/features/sales/quotation/quotation.utils";
import { money } from "@/domain/pricing";
import { typeDefaultsOf } from "@/features/sales/sale-order/tender/rows";
import { adjustmentsAuthoritative, rowsFromHeld } from "@/features/sales/testbill/engines/adjust";
import {
  BILL_DOC_TYPES,
  BILL_MODES,
  BILL_STATUSES,
  BILL_TYPES,
  DEFAULT_BILL_DOC_TYPE,
  DEFAULT_BILL_MODE,
  DEFAULT_BILL_STATUS,
  DEFAULT_BILL_TYPE,
} from "@/features/sales/testbill/constants";
import {
  createBillDraft,
  createBillDraftLine,
  emptyBillTerms,
  emptyPeople,
  emptySettlement,
} from "@/features/sales/testbill/state/factories";
import type {
  BillAdjustmentSummary,
  BillTenderRow,
  BillChargePayload,
  BillItemPayload,
  BillLocks,
  BillPayload,
  BillPostingBlock,
  BillRights,
  BillSourceSummary,
  BillTenderPayload,
  SaleBillDraft,
  SaleBillDraftLine,
} from "@/features/sales/testbill/types";

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function lineFromPayload(item: BillItemPayload): SaleBillDraftLine {
  const factor = toNumber(item.sbiToBaseFactor) || 1;
  return {
    ...createBillDraftLine(),
    sbiId: item.sbiId,
    itemId: item.sbiItemId,
    itemUnitId: item.sbiItemUnitId,
    itemName: item.sbiItemName ?? "",
    unitName: item.sbiUnitName ?? "",
    hsnCode: item.sbiHsnCode,
    barcode: item.sbiEanCode,
    itemSize: item.sbiSize,
    godownId: item.sbiGodownId,
    godownName: item.sbiGodownName ?? null,
    stockId: item.sbiStockId,
    batchNo: item.sbiBatchNo,
    batchDate: toDateInput(item.sbiBatchDate) || null,
    expiryDate: toDateInput(item.sbiExpiryDate) || null,
    serialNo: item.sbiSerialNo,
    priceLevel: clampPriceLevel(item.sbiPriceLevel ?? 1),
    // `sbi_to_base_factor` IS persisted on the bill, unlike the quotation's, so
    // there is nothing to back-derive and nothing to recover.
    toBaseFactor: factor,
    toBaseFactorKnown: true,
    isInclusiveTax: item.sbiIsTaxIncl === true,
    isPromo: item.sbiIsPromo === true,
    isFree: item.sbiIsFree === true,
    freeType: item.sbiFreeType,
    isService: item.sbiIsService === true,
    hasFreight: item.sbiHasFreight === true,
    caseQty: toNumber(item.sbiCaseQty),
    billQty: toNumber(item.sbiBillQty),
    lengthQty: toNumber(item.sbiLengthQty),
    weight: divideOrZero(toNumber(item.sbiWeightQty), toNumber(item.sbiBillQty)),
    stockQty: toNullableNumber(item.sbiAvailableStock),
    rate: toNumber(item.sbiRate),
    actualPrice: toNumber(item.sbiActPrice),
    mrp: toNumber(item.sbiMaxPrice),
    minPrice: toNumber(item.sbiMinPrice),
    costPrice: toNumber(item.sbiCostPrice),
    costBeforeTax: toNumber(item.sbiCostPreTax),
    discPerc: toNumber(item.sbiItemDiscPerc),
    discPerQty: toNumber(item.sbiItemDiscQty),
    discAmt: toNumber(item.sbiItemDiscAmt),
    splDiscPerc: toNumber(item.sbiSplDiscPerc),
    splDiscPerQty: toNumber(item.sbiSplDiscQty),
    splDiscAmt: toNumber(item.sbiSplDiscAmt),
    schPerc: toNumber(item.sbiSchDiscPerc),
    schPerQty: toNumber(item.sbiSchDiscQty),
    schAmt: toNumber(item.sbiSchDiscAmt),
    billSchDiscPerc: toNumber(item.sbiBillSchPerc),
    cashDiscPerc: toNumber(item.sbiCashDiscPerc),
    cashDiscAmt: toNumber(item.sbiCashDiscAmt),
    gstPerc: toNumber(item.sbiTaxPerc),
    cgstPerc: toNumber(item.sbiCgstPerc),
    sgstPerc: toNumber(item.sbiSgstPerc),
    igstPerc: toNumber(item.sbiIgstPerc),
    cessPerc: toNumber(item.sbiCessPerc),
    cessPerUnit: toNumber(item.sbiCessPerUnit),
    freightPerQty: toNumber(item.sbiFreightQty),
    loadingPerQty: toNumber(item.sbiLoadQty),
    batchConfig: item.sbiBatchConfig ?? 0,
    decimalCount: item.sbiDecimalCount ?? 2,
    salesmanId: item.sbiSalesmanId,
    schemeId: item.sbiSchemeId,
    schemeName: item.sbiSchemeName,
    remarks: item.sbiRemarks,
    groupId: item.sbiGroupId ?? null,
    brandId: item.sbiBrandId ?? null,
    sectionId: item.sbiSectionId ?? null,
    categoryId: item.sbiCategoryId ?? null,
    // The source trail, and with it the order cap: a loaded line that names an
    // order line is still capped, and the pending figure it was capped at is
    // `orderQty`.
    srcDocType: item.sbiSrcDocType,
    srcDocId: item.sbiSrcDocId,
    srcItemId: item.sbiSrcItemId ?? null,
    srcDocYear: item.sbiSrcDocYear,
    srcDocRefno: item.sbiSrcDocRefno,
    srcDocLineNo: item.sbiSrcDocLineNo,
    srcItemQty: toNullableNumber(item.sbiSrcItemQty),
    orderQtyLocked: Boolean(item.sbiSrcDocId) && item.sbiSrcDocType === "SALES_ORDER",
    orderQty: toNumber(item.sbiSrcItemQty),
    // The two halves of the gate age differently, so they are taken
    // differently.
    //
    // `allow_negative_stock` is not a column on `sale_bill_item` — the GET
    // RESOLVES it, from the line's godown, the company and the item master as
    // they stand today, by the same rule `/master-lookups/item-price` answers
    // with. That makes it as current as a re-lookup would be, so it crosses.
    // A `null` (the item join was not made) is not a licence, and reads false.
    //
    // `sbiAvailableStock`, by contrast, is the stock AS IT WAS when the bill was
    // raised — a month ago, perhaps — so the line stays UNRESOLVED and the gate
    // reports itself unavailable rather than judging a quantity against a stale
    // figure. Qt hard-codes the flag to "Y" here and silently turns the gate OFF
    // for every reopened line; that half is still not ported.
    allowNegative: item.sbiAllowNegativeStock === true,
    stockGateResolved: false,
  };
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function chargeFromBillPayload(row: BillChargePayload): DraftChargeRow {
  const beforeTax = row.cdBeforeTax === true;
  const taxApl = row.cdTaxApl === true && !beforeTax;
  return {
    key: nextRowKey("charge"),
    cdId: row.cdId,
    chgId: row.cdChgId,
    chgName: row.cdChgName ?? "",
    ledgerCode: row.cdLedgerCode,
    ledgerName: row.cdLedgerName,
    role: asEnum(row.cdRole, CHARGE_ROLES, "NONE"),
    method: asEnum(row.cdMethod, CHARGE_METHODS, "FIXED"),
    type: asEnum(row.cdType, CHARGE_TYPES, "ADD"),
    applyOn: asEnum(row.cdApplyOn, CHARGE_APPLY_ONS, "FLAT"),
    costAlloc: row.cdCostAlloc ? asEnum(row.cdCostAlloc, CHARGE_COST_ALLOCS, "VALUE") : null,
    beforeTax,
    taxApl,
    landingCost: row.cdLandingCost === true,
    sepPost: row.cdSepPost === true,
    // Decimals arrive as real NUMBERS on this payload — the charge-detail module
    // converts them, unlike the header and the items.
    rate: row.cdRate ?? 0,
    // The engine reads `rate === 0 && amount !== 0` as "priced by total", so a
    // stored row that carries a rate must not also carry an amount, or reopening
    // a bill would silently re-price it by its total.
    amount: (row.cdRate ?? 0) !== 0 ? 0 : (row.cdAmount ?? 0),
    taxPerc: row.cdTaxPerc ?? 0,
    cgstPerc: row.cdCgstPerc ?? 0,
    sgstPerc: row.cdSgstPerc ?? 0,
    igstPerc: row.cdIgstPerc ?? 0,
    cessPerc: row.cdCessPerc ?? 0,
    hsn: row.cdHsn,
    taxCode: row.cdTaxCode,
    unit: row.cdUnit,
    qtyVal: row.cdQtyVal,
    weight: row.cdWeight,
    remarks: row.cdRemarks,
    isActive: row.cdIsActive !== false,
  };
}

const CHARGE_ROLES = ["FREIGHT", "LOADING", "UNLOADING", "CASH_DISC", "OTHERS", "NONE"] as const;
const CHARGE_METHODS = ["FIXED", "QTY", "NET_QTY", "KG", "QTL", "TON", "PERCENT"] as const;
const CHARGE_TYPES = ["ADD", "DEDUCT"] as const;
const CHARGE_APPLY_ONS = ["FLAT", "QTY", "VALUE", "WEIGHT"] as const;
const CHARGE_COST_ALLOCS = ["VALUE", "QTY", "WEIGHT"] as const;

/**
 * A stored tender line as a bill row. No type name is stored (§15.10) —
 * every rule keys on `tdTenderTypeId`, and the dialog re-merges the live
 * master by tender id when it opens. `tdAmount` is the base and
 * `tdChangeAmt` the change handed back, so `keyed` (the BASE the cashier
 * typed) is `tdAmount` — the change was taken out of it at save.
 */
export function tenderFromPayload(row: BillTenderPayload): BillTenderRow {
  const typeId = typeof row.tdTenderTypeId === "number" ? row.tdTenderTypeId : Number(row.tdTenderTypeId) || 0;
  const defaults = typeDefaultsOf(typeId);
  const surchargePerc = row.tdSurchargePerc ?? 0;
  const base = row.tdAmount ?? 0;
  const surchargeFlat = Math.max(0, money((row.tdSurchargeAmt ?? 0) - money((base * surchargePerc) / 100)));
  return {
    key: nextRowKey("tender"),
    tdId: row.tdId,
    tenderId: row.tdTenderId,
    tenderTypeId: typeId,
    typeCode: defaults.code,
    tenderName: row.tdTenderName ?? defaults.displayName,
    tenderLedgerId: row.tdTenderLedgerId,
    settleLedgerId: row.tdSettleLedgerId,
    surchargeLedgerId: row.tdSurchargeLedgerId,
    surchargePerc,
    surchargeFlat,
    settlementDays: 0,
    minAmount: 0,
    maxAmount: null,
    conversionRate: toNumber(row.tdConversionRate) || 1,
    editSurcharge: false,
    allowChange: defaults.allowChange,
    needsRef: defaults.needsRef,
    hotkey: null,
    keyed: base,
    settleStatus: row.tdSettleStatus || "NA",
    refNo: row.tdRefNo,
    authCode: row.tdAuthCode,
    bankName: row.tdBankName,
    cardDigits: row.tdCardLast4,
    instrumentDate: toDateInput(row.tdInstrumentDate) || null,
    notes: row.tdNotes,
    tempCredit: row.tempCredit
      ? {
          name: row.tempCredit.name ?? "",
          mobile: row.tempCredit.mobile ?? "",
          place: row.tempCredit.place ?? null,
          addr: row.tempCredit.addr ?? null,
          idRef: row.tempCredit.idRef ?? null,
          days: toNumber(row.tempCredit.days),
          notes: row.tempCredit.notes ?? null,
        }
      : null,
    cheque: row.cheque
      ? {
          drawerName: row.cheque.drawerName ?? null,
          bankBranch: row.cheque.bankBranch ?? null,
          ifsc: row.cheque.ifsc ?? null,
          micr: row.cheque.micr ?? null,
        }
      : null,
    loyaltyPoints: toNumber(row.tdUnitsUsed),
    loyaltyRate: toNumber(row.tdConversionRate),
  };
}

/**
 * A loaded bill, as a whole draft.
 *
 * **Built, then derived once.** Nothing is painted row by row through the
 * pricing engine (§16): the draft is assembled here and `pricing` stays
 * `"stored"` so the screen shows the figures the bill was SAVED with, until the
 * operator's first edit flips it to `live`. That is what a reopened bill has to
 * do — the masters and the policy have moved on since, and a bill must keep the
 * numbers it was raised with.
 *
 * `storedPricing` is deliberately NOT reconstructed from the payload here: it is
 * assembled by the caller, which is the only place that also has the loaded
 * document's own charge rows in engine shape. See `storedPricingOf`.
 */
export function parseLoadedBill(
  payload: BillPayload,
  context: { companyStateCode: string; companyStateName: string },
): SaleBillDraft {
  const items = (payload.items ?? []).filter((item) => item.sbiIsDeleted !== true);
  const charges = (payload.charges ?? []).filter((row) => row.cdIsDeleted !== true);
  const tenders = (payload.tenders ?? []).filter((row) => row.tdIsDeleted !== true);

  const base = createBillDraft({
    companyId: payload.sbCompanyId,
    branchId: payload.sbBranchId,
    accYear: payload.sbAccYear,
    companyStateCode: context.companyStateCode,
    companyStateName: context.companyStateName,
    billDate: toDateInput(payload.sbBillDate),
  });

  const posStateCode = (payload.sbPosStcd ?? "").trim();
  // Records written before the customer-state / POS split (§5) carry only one of
  // the two, so each falls back to the other rather than to a constant.
  const custStateCode = (payload.sbCustStcd ?? "").trim() || posStateCode;

  return {
    ...base,
    mode: "browse",
    // Every figure on screen is the one that was saved, and stays so until the
    // first edit. Qt needed `m_loading` for this; here it is a state field.
    pricing: "stored",
    isDirty: false,
    docId: payload.sbId,
    billSlno: payload.sbBillSlno ?? "",
    billRefno: payload.sbBillRefno ?? "",
    status: asEnum(payload.sbStatus, BILL_STATUSES, DEFAULT_BILL_STATUS),
    versionNo: payload.sbVersionNo ?? 0,
    // The optimistic lock `/bills/amend` takes back as `baseRevision`.
    revisionNo: payload.sbRevisionNo ?? 0,
    isNewEntry: false,
    isDeleted: payload.sbIsDeleted === true || Boolean(payload.sbCancelledOn),
    amending: false,
    draftFromAutoPost: false,
    // Read, never computed (§17.2). A save response of an older build carries
    // none of these; the screen then treats the bill as it would a new one.
    rights: rightsOf(payload.rights),
    locks: locksOf(payload.locks),
    posting: postingOf(payload.posting),
    notes: [],
    overrides: [],
    sources: sourcesOf(payload.sources),
    // Only a POSTED bill holds live set-offs; a reloaded DRAFT's `adjustments`
    // is `[]` because draft set-offs are not stored (§14.4).
    heldAdjustments:
      payload.sbStatus === "POSTED" ? heldAdjustmentsOf(payload.adjustments) : [],
    // The document's OWN policy snapshot, never the current session's: a bill
    // reopened next year still prices the way it was created.
    policy: defaultPolicy({
      freightCalcType: (payload.sbFreightCalcType ?? "").trim() || "manual",
      loadingCalcType: (payload.sbLoadingCalcType ?? "").trim() || "manual",
      discountAlterBaseRate: payload.sbDiscAlterBase === true,
      roundOffStep: toNumber(payload.sbRoundOffStep) || 1,
    }),
    customer: {
      ...emptyCustomer(),
      custId: payload.sbCustId ?? null,
      name: payload.sbCustName,
      masterName: payload.sbCustName,
      address: payload.sbCustAddr,
      place: payload.sbCustPlace,
      phone: payload.sbCustPhone,
      gstin: payload.sbCustGstin,
      gstType: payload.sbCustGstType,
      stateCode: custStateCode || null,
      priceLevel: clampPriceLevel(payload.sbPriceLevel ?? 1),
      // `debit_allowed` is the MASTER's answer and the payload carries no copy
      // of it. A loaded credit bill evidently was allowed, so it is not
      // re-litigated; a loaded cash bill says nothing either way.
      debitAllowed: payload.sbBillType === "CREDIT",
    },
    header: {
      ...base.header,
      usrRefno: payload.sbUsrRefno ?? "",
      billDate: toDateInput(payload.sbBillDate),
      billDatetime: payload.sbBillDatetime ?? base.header.billDatetime,
      docType: asEnum(payload.sbDocType, BILL_DOC_TYPES, DEFAULT_BILL_DOC_TYPE),
      billType: asEnum(payload.sbBillType, BILL_TYPES, DEFAULT_BILL_TYPE),
      dueDays: payload.sbDueDays ?? 0,
      dueDate: toDateInput(payload.sbDueDate) || "",
      categoryId: payload.sbCategoryId,
      people: {
        ...emptyPeople(),
        // The `uuid[]` columns hold one id on this screen; a row written
        // elsewhere with several keeps the first, which is what the form can
        // show. The rest are not silently dropped on save — an untouched people
        // block re-sends what it read.
        salesmanId: payload.sbSalesmanId?.[0] ?? null,
        agentId: payload.sbAgentId,
        driverId: payload.sbDriverId,
        loadmanId: payload.sbLoadmanId?.[0] ?? null,
        packedId: payload.sbPackedId?.[0] ?? null,
        supervisorId: payload.sbSupervisorId,
        vehicleId: payload.sbVehicleId,
        vehicleNo: payload.sbVehicleNo ?? "",
      },
      posStateCode,
      posStateName: payload.sbStateName ?? "",
      hasFreight: payload.sbHasFreight === true,
      hasLoad: payload.sbHasLoad === true,
      hasUnload: payload.sbHasUnload === true,
      hasPromo: payload.sbHasPromo === true,
      hasComm: payload.sbHasComm === true,
      hasLoyalty: payload.sbHasLoyalty === true,
      priceLevel: clampPriceLevel(payload.sbPriceLevel ?? 1),
      billMode: asEnum(payload.sbBillMode ?? null, BILL_MODES, DEFAULT_BILL_MODE),
      custPan: payload.sbCustPan ?? null,
      form60Ref: payload.sbForm60Ref ?? null,
      loyaltyMemberId: payload.sbLoyaltyMemberId ?? null,
      custPin: payload.sbCustPin ?? null,
    },
    // The band, from the flat columns (§19). `transport` (nested) says the same.
    transport: transportFromPayload(payload),
    terms: {
      ...emptyBillTerms(),
      remarks: payload.sbRemarks ?? "",
      paymentTerms: payload.sbPaymentTerms ?? "",
      deliveryTerms: payload.sbDeliveryTerms ?? "",
      termsConditions: payload.sbTermsConditions ?? "",
    },
    lines: items
      .slice()
      .sort((a, b) => (a.sbiLineNo ?? 0) - (b.sbiLineNo ?? 0))
      .map(lineFromPayload),
    charges: charges
      .slice()
      .sort((a, b) => (a.cdSlno ?? 0) - (b.cdSlno ?? 0))
      .map(chargeFromBillPayload),
    // The place of supply decides the tax, compared against the COMPANY's state
    // — never re-derived from the customer master, which may have moved.
    isLocalSale:
      posStateCode && context.companyStateCode
        ? posStateCode === context.companyStateCode
        : true,
    source: payload.sbSrcDocId
      ? {
          docType: payload.sbSrcDocType ?? "",
          docId: payload.sbSrcDocId,
          accYear: payload.sbSrcDocYear,
          refno: payload.sbSrcDocRefno,
          date: toDateInput(payload.sbSrcDocDate) || null,
        }
      : null,
    tenders: tenders
      .slice()
      .sort((a, b) => (a.tdRowNo ?? 0) - (b.tdRowNo ?? 0))
      .map(tenderFromPayload),
    // Absent ≠ empty (§14.4). A POSTED bill's `/get` adjustments are its live
    // set-offs: they rebuild the panel's rows so an amend re-sends what the
    // operator chose. A bill settled with credit whose adjustments did NOT
    // come back is not authoritative: the save omits the key entirely, and
    // the panel says so. A reloaded DRAFT's set-offs are not stored at all.
    adjustments: payload.sbStatus === "POSTED" ? rowsFromHeld(heldAdjustmentsOf(payload.adjustments)) : [],
    adjustmentsTouched: adjustmentsAuthoritative(
      payload.sbStatus === "POSTED" ? heldAdjustmentsOf(payload.adjustments).length : 0,
      toNumber(payload.sbAdvanceAmt),
      toNumber(payload.sbNoteAdjAmt),
    ),
    settlement: {
      ...emptySettlement(),
      tenderAmt: toNumber(payload.sbTenderAmt),
      surchargeAmt: toNumber(payload.sbSurchargeAmt),
      creditAmt: toNumber(payload.sbCreditAmt),
      // Both kinds of set-off (§14.5): the stored `sbPaidAmt` INCLUDES them,
      // so the counter part is `paid − advance − note` (§15.9). Before this an
      // amend sent an advance twice as "paid" and 500'd.
      adjustedAmt: toNumber(payload.sbAdvanceAmt) + toNumber(payload.sbNoteAdjAmt),
      refundAmt: toNumber(payload.sbRefundAmt),
      payStatus: payload.sbPayStatus || "UNPAID",
    },
  };
}

/** The flat `sbShip* / sbDispatch* / sbTransport* / sbLr* / sbDistanceKm` columns → the band. */
export function transportFromPayload(payload: BillPayload): SaleBillDraft["transport"] {
  return {
    from: {
      godownId: payload.sbDispatchGodownId ?? null,
      branchId: payload.sbDispatchBranchId ?? null,
      addrId: null,
      name: null,
      addr: null,
      place: null,
      pin: null,
      phone: null,
      stcd: null,
      gstin: null,
    },
    to: {
      godownId: null,
      branchId: null,
      addrId: payload.sbShipAddrId ?? null,
      name: payload.sbShipName ?? null,
      addr: payload.sbShipAddr ?? null,
      place: payload.sbShipPlace ?? null,
      // The PIN may arrive as a number or a string.
      pin: payload.sbShipPin === null || payload.sbShipPin === undefined ? null : String(payload.sbShipPin),
      phone: payload.sbShipPhone ?? null,
      stcd: payload.sbShipStcd ?? null,
      gstin: payload.sbShipGstin ?? null,
    },
    mode: (payload.sbTransportMode ?? "").toUpperCase(),
    transporterId: payload.sbTransporterId ?? null,
    transporterName: payload.sbTransporterName ?? null,
    transporterGstin: payload.sbTransporterGstin ?? null,
    lrNo: payload.sbLrNo ?? null,
    lrDate: toDateInput(payload.sbLrDate) || null,
    distanceKm:
      payload.sbDistanceKm === null || payload.sbDistanceKm === undefined
        ? null
        : toNumber(payload.sbDistanceKm),
  };
}

function rightsOf(value: BillPayload["rights"]): BillRights | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    post: value.post === true,
    cancel: value.cancel === true,
    amend: value.amend === true,
    override: value.override === true,
    retender: value.retender === true,
  };
}

function locksOf(value: BillPayload["locks"]): BillLocks | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    returns: toNumber(value.returns),
    allocations: toNumber(value.allocations),
    dayClosed: value.dayClosed === true,
    irnLive: value.irnLive === true,
    ewbLive: value.ewbLive === true,
    irnCancelWindowUntil: value.irnCancelWindowUntil ?? null,
    ewbValidUpto: value.ewbValidUpto ?? null,
    editable: {
      document: value.editable?.document === true,
      transportBand: value.editable?.transportBand === true,
    },
  };
}

function postingOf(value: BillPayload["posting"]): BillPostingBlock | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    voucherId: value.voucherId ?? null,
    voucherRefno: value.voucherRefno ?? null,
    postedOn: value.postedOn ?? null,
    registerId: value.registerId ?? null,
    cogsAmt: toNumber(value.cogsAmt),
    loyaltyEarned: toNumber(value.loyaltyEarned),
    loyaltyRedeemed: toNumber(value.loyaltyRedeemed),
    irn: {
      status: value.irn?.status ?? "NA",
      number: value.irn?.number ?? null,
      ackNo: value.irn?.ackNo ?? null,
      ackOn: value.irn?.ackOn ?? null,
      message: value.irn?.message ?? null,
    },
    ewb: {
      status: value.ewb?.status ?? "NA",
      number: value.ewb?.number ?? null,
      generatedOn: value.ewb?.generatedOn ?? null,
      validUpto: value.ewb?.validUpto ?? null,
      message: value.ewb?.message ?? null,
      vehicleNo: value.ewb?.vehicleNo ?? null,
    },
  };
}

function sourcesOf(value: BillPayload["sources"]): BillSourceSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((row) => row && typeof row === "object" && typeof row.docId === "string")
    .map((row) => ({
      kind: row.kind,
      docId: row.docId,
      accYear: row.accYear ?? "",
      refno: row.refno ?? null,
      date: toDateInput(row.date) || null,
      lines: toNumber(row.lines),
      takenQty: toNumber(row.takenQty),
      openQtyAfter: row.openQtyAfter === null || row.openQtyAfter === undefined ? null : toNumber(row.openQtyAfter),
    }));
}

function heldAdjustmentsOf(value: BillPayload["adjustments"]): BillAdjustmentSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((row) => row && typeof row === "object" && typeof row.againstBillId === "string")
    .map((row) => ({
      againstBillId: row.againstBillId,
      againstBillAccYear: row.againstBillAccYear ?? "",
      refno: row.refno ?? null,
      amount: toNumber(row.amount),
      adjType: row.adjType ?? "",
    }));
}

/**
 * What a lifecycle answer (the `/get` shape from `/post`, `/amend` or a
 * reload) changes on the draft WITHOUT repainting it: status, revision, the
 * rights, the locks and the posting block. The lines stay as the operator sees
 * them; a screen that wants the stored figures reloads.
 */
export function applyBillLifecycle(draft: SaleBillDraft, payload: BillPayload): SaleBillDraft {
  return {
    ...draft,
    docId: payload.sbId ?? draft.docId,
    billRefno: payload.sbBillRefno ?? draft.billRefno,
    billSlno: payload.sbBillSlno ?? draft.billSlno,
    status: asEnum(payload.sbStatus, BILL_STATUSES, DEFAULT_BILL_STATUS),
    versionNo: payload.sbVersionNo ?? draft.versionNo,
    revisionNo: payload.sbRevisionNo ?? draft.revisionNo,
    isNewEntry: false,
    isDeleted: payload.sbIsDeleted === true || Boolean(payload.sbCancelledOn),
    rights: rightsOf(payload.rights) ?? draft.rights,
    locks: locksOf(payload.locks) ?? draft.locks,
    posting: postingOf(payload.posting) ?? draft.posting,
    sources: payload.sources ? sourcesOf(payload.sources) : draft.sources,
    heldAdjustments:
      payload.sbStatus === "POSTED" && payload.adjustments
        ? heldAdjustmentsOf(payload.adjustments)
        : draft.heldAdjustments,
  };
}

/**
 * Fold a save response back into the draft.
 *
 * The response is deliberately NOT re-parsed as a fresh document: on the save
 * path the server performs no joins, so `sbiItemName` / `sbiUnitName` come back
 * `null` and re-parsing would blank every item name on screen. Only the
 * server-owned identities are taken — the document id, the voucher number and
 * refno assigned from the sequence, the version, and the per-line / per-charge /
 * per-tender ids that make the next save an update instead of a duplicate.
 *
 * Merged against whatever the state is when the response LANDS, not against the
 * draft the request was built from: an operator can commit another cell while
 * the POST is in flight.
 */
export function applyBillSaveResponse(
  draft: SaleBillDraft,
  payload: BillPayload,
  sentDraft?: SaleBillDraft,
): SaleBillDraft {
  const savedItems = (payload.items ?? []).filter((item) => item.sbiIsDeleted !== true);
  const savedCharges = (payload.charges ?? []).filter((row) => row.cdIsDeleted !== true);
  const savedTenders = (payload.tenders ?? []).filter((row) => row.tdIsDeleted !== true);

  const itemByLineNo = new Map(savedItems.map((item) => [item.sbiLineNo ?? 0, item]));
  const chargeBySlno = new Map(savedCharges.map((row) => [row.cdSlno ?? 0, row]));
  const tenderByRowNo = new Map(savedTenders.map((row) => [row.tdRowNo ?? 0, row]));

  let populated = 0;
  const lines = draft.lines.map((line) => {
    if (!line.itemId) {
      return line;
    }
    populated += 1;
    const saved = itemByLineNo.get(populated) ?? savedItems[populated - 1];
    return saved ? { ...line, sbiId: saved.sbiId } : line;
  });

  let chargeIndex = 0;
  const charges = draft.charges.map((row) => {
    if (!row.chgId || !row.ledgerCode) {
      return row;
    }
    chargeIndex += 1;
    const saved = chargeBySlno.get(chargeIndex) ?? savedCharges[chargeIndex - 1];
    return saved ? { ...row, cdId: saved.cdId } : row;
  });

  let tenderIndex = 0;
  const tenders = draft.tenders.map((row) => {
    if (!row.tenderId || row.keyed <= 0) {
      return row;
    }
    tenderIndex += 1;
    const saved = tenderByRowNo.get(tenderIndex) ?? savedTenders[tenderIndex - 1];
    return saved ? { ...row, tdId: saved.tdId } : row;
  });

  return {
    ...draft,
    docId: payload.sbId,
    // A string end to end: `sb_bill_slno` is a bigint, and a series that is not
    // purely numeric has to survive the round trip.
    billSlno: payload.sbBillSlno ?? draft.billSlno,
    billRefno: payload.sbBillRefno ?? draft.billRefno,
    versionNo: payload.sbVersionNo ?? draft.versionNo,
    revisionNo: payload.sbRevisionNo ?? draft.revisionNo,
    status: asEnum(payload.sbStatus, BILL_STATUSES, DEFAULT_BILL_STATUS),
    isNewEntry: false,
    isDeleted: payload.sbIsDeleted === true,
    // The save answers the `/get` shape, so the rights and locks arrive with it.
    rights: rightsOf(payload.rights) ?? draft.rights,
    locks: locksOf(payload.locks) ?? draft.locks,
    isDirty: sentDraft === undefined ? false : sentDraft !== draft,
    lines,
    charges,
    tenders,
    settlement: {
      ...draft.settlement,
      payStatus: payload.sbPayStatus || draft.settlement.payStatus,
    },
  };
}
