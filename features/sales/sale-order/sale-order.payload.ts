/**
 * Sale Order Entry — the pure translations between the draft and the wire.
 *
 * The three rules the quotation's builder states carry over verbatim: nothing
 * is repriced on load, the tenant context is the voucher's, and server-owned
 * fields are handed back untouched. On this screen "untouched" is enforced by
 * OMISSION — the advance block, the fulfilment caches and the per-line
 * fulfilment quartet are not in the DTO type at all, so they cannot be sent —
 * `applyPresentFields` then leaves the stored values exactly as they were.
 *
 * The tenders are the one translation the quotation does not have: every row
 * goes through `computeTenders`, so the payload's five money figures are the
 * same ones the dialog showed, and `tdTotalAmt` always equals
 * `round(tdAmount + tdSurchargeAmt, 2)` — the server re-derives it and 400s a
 * mismatch.
 */
import type { DocumentPricing, DocumentTotals, PricedChargeRow, PricedLine } from "@/domain/pricing";
import { money } from "@/domain/pricing";
import { chargeDto, chargeFromPayload, actorLabel } from "@/features/sales/quotation/quotation.payload";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import { clampPriceLevel, emptyCustomer } from "@/features/sales/quotation/quotation.state";
import type {
  DraftChargeRow,
  QuotationPayload,
} from "@/features/sales/quotation/quotation.types";
import { parseLoadedDocument as parseLoadedQuotation } from "@/features/sales/quotation/quotation.payload";
import {
  asEnum,
  toDateInput,
  toNullableNumber,
  toNullableText,
  toNumber,
} from "@/features/sales/quotation/quotation.utils";
import {
  DEFAULT_SALE_ORDER_STATUS,
  DELIVERY_MODES,
  FULFIL_STATUSES,
  LINE_STATUSES,
  ORDER_PRIORITIES,
  ORDER_TYPES,
  PAY_STATUSES,
  SALE_ORDER_DOC_TYPE,
  SALE_ORDER_STATUSES,
} from "./sale-order.constants";
import {
  createOrderDraftLine,
  emptyAdvance,
  emptyFulfilment,
  emptyOrderHeader,
  emptyOrderTerms,
  orderLineFromQuotationLine,
  policyFromPayload,
  stampLineSource,
} from "./sale-order.state";
import type {
  SaleOrderDraft,
  SaleOrderDraftLine,
  SaleOrderPayload,
  SaleOrderTenderPayload,
  SaveSaleOrderDto,
  SaveSaleOrderItemDto,
  SaveSaleOrderTenderDto,
  SettlementState,
  SourceTrail,
  TenderDraftRow,
} from "./sale-order.types";
import { computeTenders, payStatusOf } from "./tender/arithmetic";
import type { PricedTenderRow, TenderArithRow } from "./tender/arithmetic";
import { cardLast4OrNull, instrumentSpecOf, isPdc } from "./tender/instruments";
import { typeDefaultsOf } from "./tender/rows";

export type { SaveActor } from "@/features/sales/quotation/quotation.payload";

function dateOrNull(value: string): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Save — items
// ---------------------------------------------------------------------------

/**
 * One order line. Takes the FLAT line only: the readonly `fulfilment` branch is
 * not readable through this signature's usage and none of the quartet exists on
 * `SaveSaleOrderItemDto`, so a fulfilment figure cannot reach the wire.
 */
export function buildSaveItemPayload(
  line: SaleOrderDraftLine,
  priced: PricedLine,
  index: number,
): SaveSaleOrderItemDto {
  return {
    ...(line.soiId ? { soiId: line.soiId } : {}),
    soiLineNo: index + 1,
    soiItemId: line.itemId,
    soiItemUnitId: line.itemUnitId,
    soiPriceLevel: clampPriceLevel(line.priceLevel),
    soiSrcDocType: line.srcDocType,
    soiSrcDocId: line.srcDocId,
    soiSrcDocAccYear: line.srcDocAccYear,
    soiSrcDocRefno: toNullableText(line.srcDocRefno, 100),
    soiSrcLineNo: line.srcLineNo,
    soiToBaseFactor: line.toBaseFactor,
    soiHsnCode: toNullableText(line.hsnCode, 8),
    soiEanCode: toNullableText(line.barcode, 100),
    soiSize: toNullableText(line.itemSize, 50),
    soiGodownId: line.godownId,
    soiIsTaxIncl: line.isInclusiveTax,
    soiIsPromo: line.isPromo,
    soiIsFree: line.isFree,
    // SCHEME / SAMPLE / REPLACEMENT or null — anything else is a 400.
    soiFreeType: line.isFree
      ? line.freeType === "SAMPLE" || line.freeType === "REPLACEMENT"
        ? line.freeType
        : "SCHEME"
      : null,
    soiIsService: line.isService,
    soiHasFreight: line.hasFreight,
    soiCaseQty: line.caseQty,
    // `soi_order_qty` is what fulfilment is judged against (ordered = delivered
    // + cancelled + pending), so it is the TOTAL units promised: the keyed
    // OrderQty when the operator stated one, else the priced net quantity.
    soiOrderQty: line.orderQty > 0 ? line.orderQty : priced.netQty,
    soiLengthQty: line.lengthQty,
    soiNetQty: priced.netQty,
    soiWeightQty: line.weight * line.billQty,
    soiAvailableStock: line.stockQty ?? 0,
    soiRate: line.rate,
    soiRatePreTax: priced.rateBeforeTax,
    soiRateDiff: priced.rateDiff,
    soiActPrice: line.actualPrice,
    soiMaxPrice: line.mrp,
    soiMinPrice: line.minPrice,
    soiCostPrice: line.costPrice,
    soiCostPreTax: line.costBeforeTax,
    soiItemDiscPerc: line.discPerc,
    soiItemDiscQty: line.discPerQty,
    soiItemDiscAmt: priced.discAmt,
    soiSplDiscPerc: line.splDiscPerc,
    soiSplDiscQty: line.splDiscPerQty,
    soiSplDiscAmt: priced.splDiscAmt,
    soiSchDiscPerc: line.schPerc,
    soiSchDiscQty: line.schPerQty,
    soiSchDiscAmt: priced.schAmt,
    soiBillSchPerc: line.billSchDiscPerc,
    soiBillSchQty: 0,
    soiBillSchAmt: priced.billSchDiscAmt,
    soiCashDiscPerc: line.cashDiscPerc,
    soiCashDiscAmt: line.cashDiscAmt,
    soiGrossAmt: priced.grossAmt,
    soiNetGross: priced.netGross,
    soiChrgBeforeTax: priced.chrgBeforeTax,
    soiChrgAfterTax: priced.chrgAfterTax,
    soiTaxableAmt: priced.taxableAmt,
    soiTaxPerc: line.gstPerc,
    soiTaxAmt: priced.gstAmt,
    soiCgstPerc: line.cgstPerc,
    soiCgstAmt: priced.cgstAmt,
    soiSgstPerc: line.sgstPerc,
    soiSgstAmt: priced.sgstAmt,
    soiIgstPerc: line.igstPerc,
    soiIgstAmt: priced.igstAmt,
    soiCessPerc: line.cessPerc,
    soiCessPerUnit: line.cessPerUnit,
    soiCessAmt: priced.cessAmt,
    soiFreightQty: line.freightPerQty,
    soiFreightAmt: priced.freightAmt,
    soiLoadQty: line.loadingPerQty,
    soiLoadAmt: priced.loadingAmt,
    soiUnloadQty: 0,
    soiUnloadAmt: 0,
    soiNetAmt: priced.total,
    soiSoldPrice: priced.netPrice,
    soiSoldPreTax: priced.netPriceBeforeTax,
    soiItemProfit: priced.profit,
    soiProfitPreTax: priced.profitBeforeTax,
    soiMrpSavings: line.mrp > 0 ? (line.mrp - priced.netPrice) * priced.netQty : null,
    soiMrpSavingsPerc: line.mrp > 0 ? priced.savingsPerc : null,
    soiDeliveryDate: line.deliveryDate ? dateOrNull(line.deliveryDate) : null,
    soiSalesmanId: line.salesmanId,
    soiSchemeId: line.schemeId,
    soiSchemeName: toNullableText(line.schemeName, 150),
    soiRemarks: toNullableText(line.remarks, 250),
  };
}

// ---------------------------------------------------------------------------
// Save — tenders
// ---------------------------------------------------------------------------

/** A draft tender row as the arithmetic sees it. */
export function toArithRow(row: TenderDraftRow): TenderArithRow {
  return {
    key: row.key,
    keyed: row.keyed,
    allowChange: row.allowChange,
    surcharge: { perc: row.surchargePerc, flat: row.surchargeFlat },
  };
}

/**
 * One `td*` object per settled row (the plan's §9). Every money figure comes
 * from `computeTenders` — the dialog and the payload cannot disagree.
 */
export function buildTenderPayload(
  row: TenderDraftRow,
  priced: PricedTenderRow,
  index: number,
  documentDate: string,
  actor: SaveActor,
): SaveSaleOrderTenderDto {
  const spec = instrumentSpecOf(row.typeCode);
  const isCheque = row.typeCode === "CHEQUE";
  const instrumentDate = row.instrumentDate ? dateOrNull(row.instrumentDate) : null;
  return {
    ...(row.tdId ? { tdId: row.tdId } : {}),
    tdRowNo: index + 1,
    tdTenderId: row.tenderId,
    tdTenderTypeId: row.tenderTypeId,
    tdTenderLedgerId: row.tenderLedgerId,
    tdAmount: priced.base,
    tdSurchargePerc: row.surchargePerc,
    tdSurchargeAmt: priced.surcharge,
    tdSurchargeLedgerId: row.surchargeLedgerId,
    tdTotalAmt: priced.total,
    tdReceivedAmt: priced.received,
    tdChangeAmt: priced.change,
    tdRefNo: toNullableText(row.refNo, 100),
    tdAuthCode: toNullableText(row.authCode, 50),
    // Four digits or null — a cheque (or any digit-less type) goes out null.
    tdCardLast4: spec.cardLast4 ? cardLast4OrNull(row.cardDigits) : null,
    tdBankName: toNullableText(row.bankName, 150),
    tdPayerVpa: null,
    tdInstrumentDate: instrumentDate,
    // Only a cheque's date makes it a post-dated instrument; a card's expiry
    // also lives in tdInstrumentDate and must never flag PDC.
    tdIsPdc: isCheque ? isPdc(instrumentDate, documentDate) : false,
    tdSettleStatus: row.settleStatus || "NA",
    tdSettleLedgerId: row.settleLedgerId,
    tdExpectedSettleOn: documentDate
      ? addDaysIso(documentDate, row.settlementDays)
      : null,
    tdNotes: toNullableText(row.notes, 250),
    tdCreatedBy: actorLabel(actor),
    tdModifiedBy: actorLabel(actor),
  };
}

function addDaysIso(date: string, days: number): string {
  if (!days) {
    return date;
  }
  const time = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(time)) {
    return date;
  }
  const shifted = new Date(time + days * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** The rows worth sending: a picked tender with money on it. */
export function settledTenderRows(rows: TenderDraftRow[]): TenderDraftRow[] {
  return rows.filter((row) => Boolean(row.tenderId) && row.keyed > 0);
}

// ---------------------------------------------------------------------------
// Save — the document
// ---------------------------------------------------------------------------

export function buildSavePayload(
  draft: SaleOrderDraft,
  pricing: DocumentPricing,
  actor: SaveActor,
): SaveSaleOrderDto {
  const totals = pricing.totals;
  const lineIndexes = draft.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => Boolean(line.itemId));
  const chargeRows = draft.charges.filter((row) => Boolean(row.chgId) && Boolean(row.ledgerCode));
  const pricedByKey = new Map(pricing.charges.map((row) => [row.key, row]));
  const chargeTotals = { totQty: totals.totQty, totWeight: totals.totWeight };

  const tenderRows = settledTenderRows(draft.tenders);
  const tenderComputation = computeTenders(tenderRows.map(toArithRow), totals.bill);
  const settled = tenderComputation.totals.settled;

  return {
    ...(draft.docId ? { soId: draft.docId } : {}),
    soCompanyId: draft.companyId,
    soBranchId: draft.branchId,
    soAccYear: draft.accYear,
    soPriceLevel: clampPriceLevel(draft.header.priceLevel),
    soCustName: draft.customer.name.trim(),
    soCustId: draft.customer.custId ?? "",
    soUserId: actor.userId,
    soDeviceId: actor.deviceId ?? "",
    soCreatedBy: actorLabel(actor),
    soModifiedBy: actorLabel(actor),
    soSessionId: actor.sessionId,
    soDocType: draft.docType || SALE_ORDER_DOC_TYPE,
    soOrderType: asEnum(draft.header.orderType, ORDER_TYPES, "CASH"),
    soUsrRefno: toNullableText(draft.header.usrRefno, 100),
    soOrderDate: draft.header.orderDate,
    soDeliveryDate: dateOrNull(draft.header.deliveryDate),
    soDeliverySlot: toNullableText(draft.header.deliverySlot, 30),
    soPriority: asEnum(draft.header.priority, ORDER_PRIORITIES, "NORMAL"),
    soValidUntil: dateOrNull(draft.header.validUntil),
    soDeliveryMode: asEnum(draft.header.deliveryMode, DELIVERY_MODES, "STORE_PICKUP"),
    soStatus: asEnum(draft.status, SALE_ORDER_STATUSES, DEFAULT_SALE_ORDER_STATUS),
    // Source — null when there is no source (the plan's §9), so a cleared
    // import genuinely clears the stored columns.
    soSrcDocType: draft.source?.docType ?? null,
    soSrcDocId: draft.source?.docId ?? null,
    soSrcDocAccYear: draft.source?.accYear ?? null,
    soSrcDocRefno: draft.source?.refno ?? null,
    soSrcDocDate: draft.source?.date ?? null,
    soCustAddr: toNullableText(draft.customer.address, 500),
    soCustPlace: toNullableText(draft.customer.place, 100),
    soCustPhone: toNullableText(draft.customer.phone, 20),
    soCustEmail: toNullableText(draft.customer.email, 150),
    soCustGstin: toNullableText(draft.customer.gstin, 15),
    soCustGstType: toNullableText(draft.customer.gstType, 20),
    soCustStcd: toNullableText(draft.customer.stateCode, 2),
    soPosStcd: toNullableText(draft.header.posStateCode, 2),
    soStateName: toNullableText(draft.header.posStateName, 100),
    soContactPerson: toNullableText(draft.header.contactPerson, 150),
    soContactPhone: toNullableText(draft.header.contactNo, 20),
    soHasLoad: draft.header.hasLoad,
    soHasUnload: draft.header.hasUnload,
    soHasFreight: draft.header.hasFreight,
    soHasPromo: draft.header.hasPromo,
    soHasLoyalty: draft.header.hasLoyalty,
    // Both are `uuid[]` columns with no nullable form: one id or an empty list,
    // never null.
    soSalesmanId: draft.header.salesmanId ? [draft.header.salesmanId] : [],
    soPackedId: draft.header.packedId ? [draft.header.packedId] : [],
    soAgentId: draft.header.agentId,
    soTotItems: totals.totItems,
    soTotWeight: totals.totWeight,
    soTotBags: totals.totQty,
    soGrossAmt: totals.grossAmt,
    soItemDisc: totals.itemDisc,
    soSplDisc: totals.splDisc,
    soSchDisc: totals.schDisc,
    soBillSchDisc: totals.billSchDisc,
    soTaxableAmt: totals.docTaxable,
    soCgstAmt: totals.docCgst,
    soSgstAmt: totals.docSgst,
    soIgstAmt: totals.docIgst,
    soCessAmt: totals.docCess,
    soTaxAmt: totals.docTax,
    soFreightAmt: totals.freightAmt,
    soLoadAmt: totals.loadAmt,
    soUnloadAmt: totals.unloadAmt,
    soOtherAmt1: totals.cashDiscAmt,
    soOtherAmt2: totals.otherAmt,
    soRoundOff: totals.roundOff,
    soOrderAmt: totals.bill,
    soTotalCost: totals.totalCost,
    soMarginAmt: totals.marginAmt,
    soMarginPerc: totals.marginPerc,
    soMrpSavings: totals.savingAmt,
    soMrpSavingsPerc: totals.savingPerc,
    // Settlement roll-ups (the plan's §5.1): gross across the counter, the fee,
    // and a status decided by the NET.
    soTenderAmt: tenderRows.length > 0 ? tenderComputation.totals.tendered : draft.settlement.tenderAmt,
    soSurchargeAmt:
      tenderRows.length > 0 ? tenderComputation.totals.surcharge : draft.settlement.surchargeAmt,
    soRefundAmt: draft.settlement.refundAmt,
    soPayStatus:
      tenderRows.length > 0
        ? payStatusOf(money(settled - draft.settlement.refundAmt), totals.bill)
        : asEnum(draft.settlement.payStatus, PAY_STATUSES, "UNPAID"),
    soPaymentTerms: toNullableText(draft.terms.paymentTerms, 250),
    soDeliveryTerms: toNullableText(draft.terms.deliveryTerms, 250),
    soTermsConditions: toNullableText(draft.terms.termsConditions),
    soRemarks: toNullableText(draft.terms.remarks, 500),
    soFreightCalcType: draft.policy.freightCalcType.trim().toLowerCase() || null,
    soLoadingCalcType: draft.policy.loadingCalcType.trim().toLowerCase() || null,
    soDiscAlterBase: draft.policy.discountAlterBaseRate,
    items: lineIndexes.map(({ line, index }, position) =>
      buildSaveItemPayload(line, pricing.lines[index], position),
    ),
    charges: chargeRows.map((row, position) =>
      chargeDto(row, pricedByKey.get(row.key), position, chargeTotals),
    ),
    // Omitted entirely when the draft has no settled rows AND never had any —
    // `undefined` leaves stored tenders untouched, `[]` would retire them all.
    ...(tenderRows.length > 0 || draft.tenders.some((row) => row.tdId)
      ? {
          tenders: tenderRows.map((row, position) =>
            buildTenderPayload(
              row,
              tenderComputation.rows[position],
              position,
              draft.header.orderDate,
              actor,
            ),
          ),
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function lineFromPayload(item: NonNullable<SaleOrderPayload["items"]>[number]): SaleOrderDraftLine {
  const caseQty = toNumber(item.soiCaseQty);
  const storedFactor = toNumber(item.soiToBaseFactor);
  const factor = storedFactor > 0 ? storedFactor : 1;
  const netQty = toNumber(item.soiNetQty);
  const lengthQty = toNumber(item.soiLengthQty);
  // There is no `soi_bill_qty` column: the entity stores case / length / NET,
  // and the keyed loose quantity is recovered exactly because — unlike the
  // quotation — the base factor IS persisted here.
  const loose = netQty - caseQty * factor;
  const billQty = lengthQty > 0 ? loose / lengthQty : loose;
  return {
    ...createOrderDraftLine(),
    soiId: item.soiId,
    itemId: item.soiItemId,
    itemUnitId: item.soiItemUnitId,
    itemName: item.soiItemName ?? "",
    unitName: item.soiUnitName ?? "",
    hsnCode: item.soiHsnCode,
    barcode: item.soiEanCode,
    itemSize: item.soiSize,
    godownId: item.soiGodownId,
    godownName: item.soiGodownName,
    priceLevel: clampPriceLevel(item.soiPriceLevel ?? 1),
    isInclusiveTax: item.soiIsTaxIncl === true,
    isPromo: item.soiIsPromo === true,
    isFree: item.soiIsFree === true,
    freeType: item.soiFreeType,
    isService: item.soiIsService === true,
    caseQty,
    billQty,
    orderQty: toNumber(item.soiOrderQty),
    lengthQty,
    // Persisted on this voucher (unlike the quotation), so no back-derivation
    // and no placeholder-1 trap.
    toBaseFactor: factor,
    toBaseFactorKnown: storedFactor > 0,
    weight: billQty !== 0 ? toNumber(item.soiWeightQty) / billQty : toNumber(item.soiWeightQty),
    stockQty: toNullableNumber(item.soiAvailableStock),
    rate: toNumber(item.soiRate),
    discPerc: toNumber(item.soiItemDiscPerc),
    discPerQty: toNumber(item.soiItemDiscQty),
    discAmt: toNumber(item.soiItemDiscAmt),
    splDiscPerc: toNumber(item.soiSplDiscPerc),
    splDiscPerQty: toNumber(item.soiSplDiscQty),
    splDiscAmt: toNumber(item.soiSplDiscAmt),
    schPerc: toNumber(item.soiSchDiscPerc),
    schPerQty: toNumber(item.soiSchDiscQty),
    schAmt: toNumber(item.soiSchDiscAmt),
    billSchDiscPerc: toNumber(item.soiBillSchPerc),
    cashDiscPerc: toNumber(item.soiCashDiscPerc),
    cashDiscAmt: toNumber(item.soiCashDiscAmt),
    gstPerc: toNumber(item.soiTaxPerc),
    cgstPerc: toNumber(item.soiCgstPerc),
    sgstPerc: toNumber(item.soiSgstPerc),
    igstPerc: toNumber(item.soiIgstPerc),
    cessPerc: toNumber(item.soiCessPerc),
    cessPerUnit: toNumber(item.soiCessPerUnit),
    mrp: toNumber(item.soiMaxPrice),
    minPrice: toNumber(item.soiMinPrice),
    actualPrice: toNumber(item.soiActPrice),
    costPrice: toNumber(item.soiCostPrice),
    costBeforeTax: toNumber(item.soiCostPreTax),
    freightPerQty: toNumber(item.soiFreightQty),
    loadingPerQty: toNumber(item.soiLoadQty),
    hasFreight: item.soiHasFreight === true || toNumber(item.soiFreightAmt) > 0,
    schemeId: item.soiSchemeId,
    schemeName: item.soiSchemeName,
    schemeFlag: Boolean(item.soiSchemeId),
    salesmanId: item.soiSalesmanId,
    remarks: item.soiRemarks,
    decimalCount: item.soiDecimalCount ?? 2,
    groupId: item.soiGroupId,
    brandId: item.soiBrandId,
    sectionId: item.soiSectionId,
    categoryId: item.soiCategoryId,
    srcDocType: item.soiSrcDocType,
    srcDocId: item.soiSrcDocId,
    srcDocAccYear: item.soiSrcDocAccYear,
    srcDocRefno: item.soiSrcDocRefno,
    srcLineNo: item.soiSrcLineNo,
    deliveryDate: item.soiDeliveryDate ? toDateInput(item.soiDeliveryDate) : null,
    // The server-owned quartet, in its readonly branch — painted, never posted.
    fulfilment: {
      deliveredQty: toNumber(item.soiDeliveredQty),
      cancelledQty: toNumber(item.soiCancelledQty),
      pendingQty: toNumber(item.soiPendingQty),
      lineStatus: asEnum(item.soiLineStatus, LINE_STATUSES, "PENDING"),
    },
  };
}

/**
 * A loaded tender row. `keyed` is reconstructed as base + change (what crossed
 * the counter before change came back), and the flat surcharge component as
 * `stored surcharge − perc part` so `computeTenders` reproduces the stored
 * figures exactly on an unchanged round trip.
 */
export function tenderRowFromPayload(tender: SaleOrderTenderPayload): TenderDraftRow {
  const typeId =
    typeof tender.tdTenderTypeId === "number"
      ? tender.tdTenderTypeId
      : Number.parseInt(tender.tdTenderTypeId, 10) || 0;
  const defaults = typeDefaultsOf(typeId);
  const base = toNumber(tender.tdAmount);
  const change = toNumber(tender.tdChangeAmt);
  const surchargePerc = toNumber(tender.tdSurchargePerc);
  const percPart = money((base * surchargePerc) / 100);
  const surchargeFlat = Math.max(0, money(toNumber(tender.tdSurchargeAmt) - percPart));
  return {
    key: `tender-loaded-${tender.tdId}`,
    tdId: tender.tdId,
    tenderId: tender.tdTenderId,
    tenderTypeId: typeId,
    typeCode: defaults.code,
    tenderName: tender.tdTenderName ?? defaults.displayName,
    tenderLedgerId: tender.tdTenderLedgerId,
    settleLedgerId: tender.tdSettleLedgerId,
    surchargeLedgerId: tender.tdSurchargeLedgerId,
    surchargePerc,
    surchargeFlat,
    settlementDays: 0,
    allowChange: defaults.allowChange || change > 0,
    needsRef: defaults.needsRef,
    keyed: money(base + change),
    settleStatus: tender.tdSettleStatus || "NA",
    refNo: tender.tdRefNo,
    authCode: tender.tdAuthCode,
    bankName: tender.tdBankName,
    cardDigits: tender.tdCardLast4,
    instrumentDate: tender.tdInstrumentDate ? toDateInput(tender.tdInstrumentDate) : null,
    notes: tender.tdNotes,
  };
}

/** The stored figures, verbatim, in the engine's shape — nothing recomputed. */
function storedPricingOf(
  payload: SaleOrderPayload,
  lines: SaleOrderDraftLine[],
  charges: DraftChargeRow[],
): DocumentPricing {
  const items = (payload.items ?? []).filter((item) => item.soiIsDeleted !== true);
  const storedCharges = (payload.charges ?? []).filter((charge) => charge.cdIsDeleted !== true);
  const pricedLines: PricedLine[] = lines.map((line, index) => {
    const item = items[index];
    const netQty = toNumber(item?.soiNetQty);
    return {
      ...line,
      netQty,
      rateBeforeTax: toNumber(item?.soiRatePreTax),
      grossAmt: toNumber(item?.soiGrossAmt),
      netGross: toNumber(item?.soiNetGross),
      discAmt: toNumber(item?.soiItemDiscAmt),
      splDiscAmt: toNumber(item?.soiSplDiscAmt),
      schAmt: toNumber(item?.soiSchDiscAmt),
      billSchDiscAmt: toNumber(item?.soiBillSchAmt),
      freightAmt: toNumber(item?.soiFreightAmt),
      loadingAmt: toNumber(item?.soiLoadAmt),
      chrgBeforeTax: toNumber(item?.soiChrgBeforeTax),
      chrgAfterTax: toNumber(item?.soiChrgAfterTax),
      taxableAmt: toNumber(item?.soiTaxableAmt),
      cgstAmt: toNumber(item?.soiCgstAmt),
      sgstAmt: toNumber(item?.soiSgstAmt),
      igstAmt: toNumber(item?.soiIgstAmt),
      gstAmt: toNumber(item?.soiTaxAmt),
      cessAmt: toNumber(item?.soiCessAmt),
      total: toNumber(item?.soiNetAmt),
      netPrice: toNumber(item?.soiSoldPrice),
      netPriceBeforeTax: toNumber(item?.soiSoldPreTax),
      savingsPerc: toNumber(item?.soiMrpSavingsPerc),
      profit: toNumber(item?.soiItemProfit),
      profitBeforeTax: toNumber(item?.soiProfitPreTax),
      rateDiff: toNumber(item?.soiRateDiff ?? 0) || toNumber(item?.soiRate) - toNumber(item?.soiActPrice),
    };
  });
  const pricedCharges: PricedChargeRow[] = charges.map((row, index) => {
    const stored = storedCharges[index];
    return {
      ...row,
      amountValue: toNumber(stored?.cdAmount),
      shares: [],
      taxPercApplied: toNumber(stored?.cdTaxPerc),
      cgstPercApplied: toNumber(stored?.cdCgstPerc),
      sgstPercApplied: toNumber(stored?.cdSgstPerc),
      igstPercApplied: toNumber(stored?.cdIgstPerc),
      cgstAmt: toNumber(stored?.cdCgstAmt),
      sgstAmt: toNumber(stored?.cdSgstAmt),
      igstAmt: toNumber(stored?.cdIgstAmt),
      taxAmt: toNumber(stored?.cdTaxAmt),
      cessAmt: toNumber(stored?.cdCessAmt),
      netAmt: toNumber(stored?.cdNetAmt),
    };
  });
  const sumLines = (pick: (line: PricedLine) => number): number =>
    pricedLines.reduce((total, line) => total + pick(line), 0);
  const chargeOwnTax = pricedCharges.reduce((total, row) => total + row.taxAmt, 0);
  const chargeTaxable = pricedCharges
    .filter((row) => row.taxApl && !row.beforeTax)
    .reduce((total, row) => total + row.amountValue, 0);
  const afterTaxNonTaxable = pricedCharges
    .filter((row) => !row.beforeTax && !row.taxApl)
    .reduce((total, row) => total + row.amountValue, 0);
  const byRole = (roles: string[]): number =>
    pricedCharges
      .filter((row) => roles.includes(row.role))
      .reduce((total, row) => total + row.amountValue, 0);
  const totals: DocumentTotals = {
    grossAmt: toNumber(payload.soGrossAmt),
    netGross: sumLines((line) => line.netGross),
    itemDisc: toNumber(payload.soItemDisc),
    splDisc: toNumber(payload.soSplDisc),
    schDisc: toNumber(payload.soSchDisc),
    billSchDisc: toNumber(payload.soBillSchDisc),
    lineTaxable: sumLines((line) => line.taxableAmt),
    lineCgst: sumLines((line) => line.cgstAmt),
    lineSgst: sumLines((line) => line.sgstAmt),
    lineIgst: sumLines((line) => line.igstAmt),
    lineCess: sumLines((line) => line.cessAmt),
    lineTax: sumLines((line) => line.gstAmt + line.cessAmt),
    lineTotal: sumLines((line) => line.total),
    totQty: toNumber(payload.soTotBags),
    totWeight: toNumber(payload.soTotWeight),
    totItems: payload.soTotItems ?? pricedLines.length,
    totalCost: toNumber(payload.soTotalCost),
    totalProfit: sumLines((line) => line.profit * line.netQty),
    totalProfitBeforeTax: sumLines((line) => line.profitBeforeTax * line.netQty),
    totalLoyaltyPv: sumLines((line) => line.loyaltyPv * line.netQty),
    totalRateDiff: sumLines((line) => line.rateDiff * line.netQty),
    freeSchemeAmount: sumLines((line) => (line.isFree ? line.grossAmt : 0)),
    freightAmt: toNumber(payload.soFreightAmt),
    loadAmt: toNumber(payload.soLoadAmt),
    unloadAmt: toNumber(payload.soUnloadAmt),
    cashDiscAmt: byRole(["CASH_DISC"]),
    otherAmt: byRole(["OTHERS", "NONE"]),
    chargeTaxable,
    chargeOwnTax,
    afterTaxNonTaxable,
    docTaxable: toNumber(payload.soTaxableAmt),
    docCgst: toNumber(payload.soCgstAmt),
    docSgst: toNumber(payload.soSgstAmt),
    docIgst: toNumber(payload.soIgstAmt),
    docCess: toNumber(payload.soCessAmt),
    docTax: toNumber(payload.soTaxAmt),
    amount: toNumber(payload.soOrderAmt) - toNumber(payload.soRoundOff),
    roundOff: toNumber(payload.soRoundOff),
    bill: toNumber(payload.soOrderAmt),
    savingAmt: toNumber(payload.soMrpSavings),
    savingPerc: toNumber(payload.soMrpSavingsPerc),
    marginAmt: toNumber(payload.soMarginAmt),
    marginPerc: toNumber(payload.soMarginPerc),
  };
  return { lines: pricedLines, charges: pricedCharges, totals };
}

/** The source trail — derived from `soSrcDocId`, never toggled (the plan's §6). */
export function sourceTrailOf(payload: SaleOrderPayload): SourceTrail | null {
  if (!payload.soSrcDocId) {
    return null;
  }
  return {
    docType: payload.soSrcDocType ?? "",
    docId: payload.soSrcDocId,
    accYear: payload.soSrcDocAccYear,
    refno: payload.soSrcDocRefno,
    date: payload.soSrcDocDate ? toDateInput(payload.soSrcDocDate) : null,
  };
}

export function settlementFromPayload(payload: SaleOrderPayload): SettlementState {
  return {
    tenderAmt: toNumber(payload.soTenderAmt),
    surchargeAmt: toNumber(payload.soSurchargeAmt),
    refundAmt: toNumber(payload.soRefundAmt),
    payStatus: asEnum(payload.soPayStatus, PAY_STATUSES, "UNPAID"),
  };
}

/** Turn a loaded order into a draft — the quotation's three load rules intact. */
export function parseLoadedDocument(
  payload: SaleOrderPayload,
  fallbackCompanyStateCode: string,
): SaleOrderDraft {
  const orderDate = toDateInput(payload.soOrderDate) || "";
  const lines = (payload.items ?? [])
    .filter((item) => item.soiIsDeleted !== true)
    .map(lineFromPayload);
  const charges = (payload.charges ?? [])
    .filter((charge) => charge.cdIsDeleted !== true)
    .map(chargeFromPayload);
  const tenders = (payload.tenders ?? [])
    .filter((tender) => tender.tdIsDeleted !== true)
    .map(tenderRowFromPayload);
  const localTax = toNumber(payload.soCgstAmt) + toNumber(payload.soSgstAmt);
  const interStateTax = toNumber(payload.soIgstAmt);
  const posStateCode = payload.soPosStcd ?? "";
  const isLocalSale =
    localTax > 0 || interStateTax > 0
      ? localTax > 0
      : !posStateCode || posStateCode === fallbackCompanyStateCode;
  const salesmanId = payload.soSalesmanId?.[0] ?? null;
  const salesmanName = payload.soSalesmanName?.[0] ?? "";

  return {
    mode: "browse",
    pricing: "stored",
    isDirty: false,
    companyId: payload.soCompanyId,
    branchId: payload.soBranchId,
    accYear: payload.soAccYear,
    companyStateCode: fallbackCompanyStateCode,
    docId: payload.soId,
    orderSlno: payload.soOrderSlno ?? "",
    orderRefno: payload.soOrderRefno ?? "",
    versionNo: payload.soVersionNo ?? 0,
    docType: payload.soDocType || SALE_ORDER_DOC_TYPE,
    status: asEnum(payload.soStatus, SALE_ORDER_STATUSES, DEFAULT_SALE_ORDER_STATUS),
    isNewEntry: false,
    isDeleted: payload.soIsDeleted === true,
    policy: policyFromPayload(payload),
    customer: {
      ...emptyCustomer(),
      custId: payload.soCustId,
      name: payload.soCustName ?? "",
      masterName: payload.soCustName ?? "",
      address: payload.soCustAddr,
      place: payload.soCustPlace,
      phone: payload.soCustPhone,
      email: payload.soCustEmail,
      gstin: payload.soCustGstin,
      gstType: payload.soCustGstType,
      stateCode: payload.soCustStcd,
      stateName: payload.soStateName,
      localSales: isLocalSale,
      priceLevel: clampPriceLevel(payload.soPriceLevel ?? 1),
    },
    header: {
      ...emptyOrderHeader(orderDate),
      usrRefno: payload.soUsrRefno ?? "",
      orderDate,
      deliveryDate: toDateInput(payload.soDeliveryDate) || "",
      deliverySlot: payload.soDeliverySlot ?? "",
      validUntil: toDateInput(payload.soValidUntil) || "",
      priority: asEnum(payload.soPriority, ORDER_PRIORITIES, "NORMAL"),
      orderType: asEnum(payload.soOrderType, ORDER_TYPES, "CASH"),
      deliveryMode: asEnum(payload.soDeliveryMode, DELIVERY_MODES, "STORE_PICKUP"),
      contactPerson: payload.soContactPerson ?? "",
      contactNo: payload.soContactPhone ?? "",
      salesmanId,
      salesmanName: salesmanName ?? "",
      agentId: payload.soAgentId,
      agentName: "",
      packedId: payload.soPackedId?.[0] ?? null,
      // The GET resolves salesman names only, so the packer's reads blank until
      // the field is re-picked — the same documented gap the agent name has.
      packedName: "",
      posStateCode,
      posStateName: payload.soStateName ?? "",
      hasFreight: payload.soHasFreight === true,
      hasLoad: payload.soHasLoad === true,
      hasUnload: payload.soHasUnload === true,
      hasPromo: payload.soHasPromo === true,
      hasLoyalty: payload.soHasLoyalty === true,
      priceLevel: clampPriceLevel(payload.soPriceLevel ?? 1),
    },
    terms: {
      ...emptyOrderTerms(),
      remarks: payload.soRemarks ?? "",
      paymentTerms: payload.soPaymentTerms ?? "",
      deliveryTerms: payload.soDeliveryTerms ?? "",
      termsConditions: payload.soTermsConditions ?? "",
    },
    lines,
    charges,
    isLocalSale,
    freightBands: [],
    storedPricing: storedPricingOf(payload, lines, charges),
    source: sourceTrailOf(payload),
    tenders,
    settlement: settlementFromPayload(payload),
    advance: {
      ...emptyAdvance(),
      policy: payload.soAdvancePolicy,
      perc: toNumber(payload.soAdvancePerc),
      required: toNumber(payload.soAdvanceRequired),
      dueDate: payload.soAdvanceDueDate ? toDateInput(payload.soAdvanceDueDate) : null,
      isMandatory: payload.soIsAdvanceMandatory === true,
      ledgerId: payload.soAdvanceLedgerId,
      recdAmt: toNumber(payload.soAdvanceRecdAmt),
      adjustedAmt: toNumber(payload.soAdvanceAdjustedAmt),
      refundAmt: toNumber(payload.soAdvanceRefundAmt),
      forfeitAmt: toNumber(payload.soAdvanceForfeitAmt),
      balanceAmt: toNumber(payload.soAdvanceBalanceAmt),
      status: payload.soAdvanceStatus,
      recdOn: payload.soAdvanceRecdOn,
    },
    fulfilment: {
      ...emptyFulfilment(),
      status: asEnum(payload.soFulfilStatus, FULFIL_STATUSES, "PENDING"),
      billedAmt: toNumber(payload.soBilledAmt),
      cancelledAmt: toNumber(payload.soCancelledAmt),
      pendingAmt: toNumber(payload.soPendingAmt),
      deliveredItems: payload.soDeliveredItems ?? 0,
      lastBilledOn: payload.soLastBilledOn,
      completedOn: payload.soCompletedOn,
    },
    creditOverride: false,
    partyCredit: null,
  };
}

// ---------------------------------------------------------------------------
// Import (Ctrl+F3) — a quotation becomes a fresh order draft
// ---------------------------------------------------------------------------

/**
 * Stamp `soSrcDoc*` on the draft and `soiSrcDoc*` per line (the plan's §6).
 * The customer, terms, policy, lines and charges carry over; the identity does
 * not — this order has never been saved. The caller derives the customer lock
 * from `source`, not from a flag set here.
 */
export function importQuotationAsOrder(
  quotation: QuotationPayload,
  fallbackCompanyStateCode: string,
  orderDate: string,
): SaleOrderDraft {
  const quotationDraft = parseLoadedQuotation(quotation, fallbackCompanyStateCode);
  const source: SourceTrail = {
    docType: quotation.sqDocType || "QUOTATION",
    docId: quotation.sqId,
    accYear: quotation.sqAccYear,
    refno: quotation.sqQuoteRefno,
    date: toDateInput(quotation.sqQuoteDate) || null,
  };
  const items = (quotation.items ?? []).filter((item) => item.sqiIsDeleted !== true);
  return {
    mode: "entry",
    pricing: "live",
    isDirty: true,
    companyId: quotationDraft.companyId,
    branchId: quotationDraft.branchId,
    accYear: quotationDraft.accYear,
    companyStateCode: quotationDraft.companyStateCode,
    docId: null,
    orderSlno: "",
    orderRefno: "",
    versionNo: 0,
    docType: SALE_ORDER_DOC_TYPE,
    status: DEFAULT_SALE_ORDER_STATUS,
    isNewEntry: true,
    isDeleted: false,
    policy: quotationDraft.policy,
    customer: quotationDraft.customer,
    header: {
      ...emptyOrderHeader(orderDate),
      contactPerson: quotationDraft.header.contactPerson,
      contactNo: quotationDraft.header.contactNo,
      salesmanId: quotationDraft.header.salesmanId,
      salesmanName: quotationDraft.header.salesmanName,
      agentId: quotationDraft.header.agentId,
      agentName: quotationDraft.header.agentName,
      posStateCode: quotationDraft.header.posStateCode,
      posStateName: quotationDraft.header.posStateName,
      hasFreight: quotationDraft.header.hasFreight,
      hasLoad: quotationDraft.header.hasLoad,
      hasUnload: quotationDraft.header.hasUnload,
      hasPromo: quotationDraft.header.hasPromo,
      priceLevel: quotationDraft.header.priceLevel,
    },
    terms: quotationDraft.terms,
    lines: quotationDraft.lines.map((line, index) =>
      stampLineSource(
        orderLineFromQuotationLine(line),
        source,
        items[index]?.sqiLineNo ?? index + 1,
      ),
    ),
    charges: quotationDraft.charges.map((row) => ({ ...row, cdId: null })),
    isLocalSale: quotationDraft.isLocalSale,
    freightBands: [],
    storedPricing: null,
    source,
    tenders: [],
    settlement: { tenderAmt: 0, surchargeAmt: 0, refundAmt: 0, payStatus: "UNPAID" },
    advance: emptyAdvance(),
    fulfilment: emptyFulfilment(),
    creditOverride: false,
    partyCredit: null,
  };
}
