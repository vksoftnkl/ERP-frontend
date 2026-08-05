/**
 * Quotation Entry — the two pure translations between the draft and the wire.
 *
 * `buildSavePayload` is the only place that knows the save contract's traps:
 *   - six fields are required on every request, create or update
 *     (`sqCompanyId`, `sqBranchId`, `sqAccYear`, `sqPriceLevel`, `sqCustName`,
 *     `sqUserId`) even though five of them are ignored on update;
 *   - `sqQuoteSlno` / `sqQuoteRefno` are assigned from the voucher sequence and
 *     ignored on input, so they are not sent at all;
 *   - a boolean may never be `null` — `OptionalBoolean` lets `null` through
 *     validation and it then hits a NOT NULL column as a 500;
 *   - `sqStatus` is CHECK-constrained upper case with no DTO validation;
 *   - `cdTaxApl` and `cdBeforeTax` are mutually exclusive (400);
 *   - the payload must contain ONLY declared fields — `forbidNonWhitelisted`
 *     turns a stray key into a 400.
 */
import type {
  DocumentPricing,
  DocumentTotals,
  PricedChargeRow,
  PricedLine,
} from "@/domain/pricing";
import { defaultPolicy } from "@/domain/pricing";
import {
  DEFAULT_QUOTATION_STATUS,
  QUOTATION_DOC_TYPE,
  QUOTATION_STATUSES,
  type QuotationStatus,
} from "./quotation.constants";
import { clampPriceLevel, createDraftLine, emptyCustomer, emptyTerms } from "./quotation.state";
import type {
  DraftChargeRow,
  DraftLine,
  QuotationDraft,
  QuotationPayload,
  SaveQuotationChargeDto,
  SaveQuotationDto,
  SaveQuotationItemDto,
} from "./quotation.types";
import {
  asEnum,
  nextRowKey,
  toDateInput,
  toNullableNumber,
  toNullableText,
  toNumber,
} from "./quotation.utils";

const CHARGE_ROLES = ["FREIGHT", "LOADING", "UNLOADING", "CASH_DISC", "OTHERS", "NONE"] as const;
const CHARGE_METHODS = ["FIXED", "QTY", "NET_QTY", "KG", "QTL", "TON", "PERCENT"] as const;
const CHARGE_TYPES = ["ADD", "DEDUCT"] as const;
const CHARGE_APPLY_ONS = ["FLAT", "QTY", "VALUE", "WEIGHT"] as const;
const CHARGE_COST_ALLOCS = ["VALUE", "QTY", "WEIGHT"] as const;

/** Actor / device context the save needs and the draft has no business holding. */
export type SaveActor = {
  userId: string;
  sessionId: string | null;
  deviceId: string | null;
  deviceType: string | null;
};

function statusOf(value: string): QuotationStatus {
  return asEnum(value, QUOTATION_STATUSES, DEFAULT_QUOTATION_STATUS);
}

/** `''` and blanks become `null`; a date is sent as `yyyy-mm-dd`. */
function dateOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function itemDto(line: DraftLine, priced: PricedLine, index: number): SaveQuotationItemDto {
  return {
    // Present → update that line; absent → insert. An active line missing from
    // the array is soft deleted server-side, which is exactly what removing a
    // row should mean.
    ...(line.sqiId ? { sqiId: line.sqiId } : {}),
    sqiLineNo: index + 1,
    sqiItemId: line.itemId,
    sqiItemUnitId: line.itemUnitId,
    sqiPriceLevel: clampPriceLevel(line.priceLevel),
    sqiHsnCode: toNullableText(line.hsnCode, 8),
    sqiEanCode: toNullableText(line.barcode, 100),
    sqiBatchNo: toNullableText(line.batchNo, 100),
    sqiBatchDate: line.batchDate ? dateOrNull(line.batchDate) : null,
    sqiExpiryDate: line.expiryDate ? dateOrNull(line.expiryDate) : null,
    sqiIsTaxIncl: line.isInclusiveTax,
    sqiIsPromo: line.isPromo,
    sqiIsFree: line.isFree,
    // `ck_sqi_free_type` allows NULL, 'SCHEME' or 'SAMPLE' only — anything else
    // is a 500 from the database, so nothing else is ever sent.
    sqiFreeType: line.isFree ? (line.freeType === "SAMPLE" ? "SAMPLE" : "SCHEME") : null,
    sqiIsService: line.isService,
    sqiCaseQty: line.caseQty,
    sqiBillQty: line.billQty,
    sqiLengthQty: line.lengthQty,
    sqiNetQty: priced.netQty,
    sqiWeightQty: line.weight * line.billQty,
    sqiAvailableStock: line.stockQty ?? 0,
    sqiRate: line.rate,
    sqiRatePreTax: priced.rateBeforeTax,
    // The three keyed columns go out as keyed; the Amt columns carry what the
    // engine computed, which is what the grid showed and what the print needs.
    sqiItemDiscPerc: line.discPerc,
    sqiItemDiscQty: line.discPerQty,
    sqiItemDiscAmt: priced.discAmt,
    sqiSplDiscPerc: line.splDiscPerc,
    sqiSplDiscQty: line.splDiscPerQty,
    sqiSplDiscAmt: priced.splDiscAmt,
    sqiSchDiscPerc: line.schPerc,
    sqiSchDiscQty: line.schPerQty,
    sqiSchDiscAmt: priced.schAmt,
    sqiBillSchPerc: line.billSchDiscPerc,
    sqiBillSchQty: 0,
    sqiBillSchAmt: priced.billSchDiscAmt,
    sqiCashDiscPerc: line.cashDiscPerc,
    sqiCashDiscAmt: line.cashDiscAmt,
    sqiGrossAmt: priced.grossAmt,
    sqiTaxableAmt: priced.taxableAmt,
    sqiTaxPerc: line.gstPerc,
    sqiTaxAmt: priced.gstAmt,
    sqiCgstPerc: line.cgstPerc,
    sqiCgstAmt: priced.cgstAmt,
    sqiSgstPerc: line.sgstPerc,
    sqiSgstAmt: priced.sgstAmt,
    sqiIgstPerc: line.igstPerc,
    sqiIgstAmt: priced.igstAmt,
    sqiCessPerc: line.cessPerc,
    sqiCessPerUnit: line.cessPerUnit,
    sqiCessAmt: priced.cessAmt,
    sqiFreightQty: line.freightPerQty,
    sqiFreightAmt: priced.freightAmt,
    sqiLoadQty: line.loadingPerQty,
    sqiLoadAmt: priced.loadingAmt,
    sqiUnloadQty: 0,
    sqiUnloadAmt: 0,
    sqiNetAmt: priced.total,
    sqiCostPrice: line.costPrice,
    sqiMaxPrice: line.mrp,
    sqiMinPrice: line.minPrice,
    sqiActPrice: line.actualPrice,
    sqiQuotePrice: priced.netPrice,
    sqiItemProfit: priced.profit,
    sqiCostPreTax: line.costBeforeTax,
    sqiQuotePreTax: priced.netPriceBeforeTax,
    sqiProfitPreTax: priced.profitBeforeTax,
    sqiMrpSavings: line.mrp > 0 ? (line.mrp - priced.netPrice) * priced.netQty : null,
    sqiMrpSavingsPerc: line.mrp > 0 ? priced.savingsPerc : null,
    sqiNetGross: priced.netGross,
    sqiChrgBeforeTax: priced.chrgBeforeTax,
    sqiChrgAfterTax: priced.chrgAfterTax,
    sqiSchemeId: line.schemeId,
    sqiSchemeName: toNullableText(line.schemeName, 150),
    sqiRemarks: toNullableText(line.remarks, 250),
  };
}

function chargeDto(
  row: DraftChargeRow,
  priced: PricedChargeRow | undefined,
  index: number,
  totals: { totQty: number; totWeight: number },
): SaveQuotationChargeDto {
  // `cdTaxApl` and `cdBeforeTax` are mutually exclusive server-side, judged on
  // the merged row. The draft already resolves this at snapshot time; belt and
  // braces here so a hand-edited row cannot 400 the whole save.
  const beforeTax = row.beforeTax;
  const taxApl = row.taxApl && !beforeTax;

  return {
    ...(row.cdId ? { cdId: row.cdId } : {}),
    cdSlno: index + 1,
    cdChgId: row.chgId,
    cdLedgerCode: row.ledgerCode,
    cdChgName: toNullableText(row.chgName, 100),
    cdRole: asEnum(row.role, CHARGE_ROLES, "NONE"),
    cdMethod: asEnum(row.method, CHARGE_METHODS, "FIXED"),
    cdType: asEnum(row.type, CHARGE_TYPES, "ADD"),
    cdApplyOn: asEnum(row.applyOn, CHARGE_APPLY_ONS, "FLAT"),
    cdCostAlloc: row.costAlloc ? asEnum(row.costAlloc, CHARGE_COST_ALLOCS, "VALUE") : null,
    cdLandingCost: row.landingCost,
    cdBeforeTax: beforeTax,
    cdTaxApl: taxApl,
    cdSepPost: row.sepPost,
    cdUnit: toNullableText(row.unit, 15),
    // The quantity and weight the row was measured against. Nothing reads them
    // back — the engine re-derives every basis from the lines — but a stored
    // charge line that cannot say what it was computed on is unauditable.
    cdQtyVal: totals.totQty,
    cdWeight: totals.totWeight,
    cdRate: row.rate,
    cdAmount: priced?.amountValue ?? row.amount,
    cdHsn: toNullableText(row.hsn, 15),
    cdTaxPerc: priced?.taxPercApplied ?? 0,
    cdTaxAmt: priced?.taxAmt ?? 0,
    cdCgstPerc: priced?.cgstPercApplied ?? 0,
    cdCgstAmt: priced?.cgstAmt ?? 0,
    cdSgstPerc: priced?.sgstPercApplied ?? 0,
    cdSgstAmt: priced?.sgstAmt ?? 0,
    cdIgstPerc: priced?.igstPercApplied ?? 0,
    cdIgstAmt: priced?.igstAmt ?? 0,
    cdCessPerc: 0,
    cdCessAmt: 0,
    cdNetAmt: priced?.netAmt ?? row.amount,
    cdRemarks: toNullableText(row.remarks, 255),
    cdIsActive: row.isActive,
  };
}

export function buildSavePayload(
  draft: QuotationDraft,
  pricing: DocumentPricing,
  actor: SaveActor,
): SaveQuotationDto {
  const totals = pricing.totals;
  // A line with no item is a row the operator started and abandoned; it is
  // skipped rather than rejected.
  const lineIndexes = draft.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => Boolean(line.itemId));
  const chargeRows = draft.charges.filter((row) => Boolean(row.chgId) && Boolean(row.ledgerCode));
  const pricedByKey = new Map(pricing.charges.map((row) => [row.key, row]));
  const chargeTotals = { totQty: totals.totQty, totWeight: totals.totWeight };

  return {
    ...(draft.docId ? { sqId: draft.docId } : {}),
    // Required on every request. Five of the six are ignored on update, but
    // omitting any of them is a 400 either way.
    sqCompanyId: draft.companyId,
    sqBranchId: draft.branchId,
    sqAccYear: draft.accYear,
    sqPriceLevel: clampPriceLevel(draft.header.priceLevel),
    sqCustName: draft.customer.name.trim(),
    sqUserId: actor.userId,

    sqDocType: draft.docType || QUOTATION_DOC_TYPE,
    sqUsrRefno: toNullableText(draft.header.usrRefno, 100),
    sqQuoteDate: draft.header.quoteDate,
    sqValidUntil: dateOrNull(draft.header.validUntil),
    sqValidityDays: draft.header.validityDays || null,
    sqRevisionNo: draft.revisionNo,
    sqSessionId: actor.sessionId,

    sqCustId: draft.customer.custId,
    sqCustAreaId: draft.header.areaId,
    sqCustAddr: toNullableText(draft.customer.address, 500),
    sqCustPlace: toNullableText(draft.customer.place, 100),
    sqCustPhone: toNullableText(draft.customer.phone, 20),
    sqCustEmail: toNullableText(draft.customer.email, 150),
    sqCustGstin: toNullableText(draft.customer.gstin, 15),
    sqCustGstType: toNullableText(draft.customer.gstType, 20),
    sqCustStcd: toNullableText(draft.customer.stateCode, 2),
    sqPosStcd: toNullableText(draft.header.posStateCode, 2),
    sqStateName: toNullableText(draft.header.posStateName, 100),
    sqContactPerson: toNullableText(draft.header.contactPerson, 150),
    sqContactPhone: toNullableText(draft.header.contactNo, 20),

    sqHasLoad: draft.header.hasLoad,
    sqHasUnload: draft.header.hasUnload,
    sqHasFreight: draft.header.hasFreight,
    sqHasPromo: draft.header.hasPromo,

    sqSalesmanId: draft.header.salesmanId,
    sqAgentId: draft.header.agentId,

    sqTotItems: totals.totItems,
    sqTotWeight: totals.totWeight,
    // "Bags" is the piece count the document was quoted in.
    sqTotBags: totals.totQty,
    sqGrossAmt: totals.grossAmt,
    sqItemDisc: totals.itemDisc,
    sqSplDisc: totals.splDisc,
    sqSchDisc: totals.schDisc,
    sqBillSchDisc: totals.billSchDisc,
    sqTaxableAmt: totals.docTaxable,
    sqCgstAmt: totals.docCgst,
    sqSgstAmt: totals.docSgst,
    sqIgstAmt: totals.docIgst,
    sqCessAmt: totals.docCess,
    sqTaxAmt: totals.docTax,
    sqFreightAmt: totals.freightAmt,
    sqLoadAmt: totals.loadAmt,
    sqUnloadAmt: totals.unloadAmt,
    sqOtherAmt1: totals.cashDiscAmt,
    sqOtherAmt2: totals.otherAmt,
    sqRoundOff: totals.roundOff,
    sqQuoteAmt: totals.bill,
    sqTotalCost: totals.totalCost,
    sqMarginAmt: totals.marginAmt,
    sqMarginPerc: totals.marginPerc,
    sqMrpSavings: totals.savingAmt,
    sqMrpSavingsPerc: totals.savingPerc,

    sqPaymentTerms: toNullableText(draft.terms.paymentTerms, 250),
    sqDeliveryTerms: toNullableText(draft.terms.deliveryTerms, 250),
    sqTermsConditions: toNullableText(draft.terms.termsConditions),
    sqRemarks: toNullableText(draft.terms.remarks, 500),
    sqStatus: statusOf(draft.status),

    sqDeviceType: toNullableText(actor.deviceType, 20),
    sqDeviceId: toNullableText(actor.deviceId),

    // Lower case, and NOT normalised by the DTO: these are the same vocabulary
    // as `/item-price`'s `loading_type` / `freight_type`, so a value stored in
    // any other case can never be fed back into the lookup.
    sqFreightCalcType: draft.policy.freightCalcType.trim().toLowerCase() || null,
    sqLoadingCalcType: draft.policy.loadingCalcType.trim().toLowerCase() || null,
    sqDiscAlterBase: draft.policy.discountAlterBaseRate,

    items: lineIndexes.map(({ line, index }, position) =>
      itemDto(line, pricing.lines[index], position),
    ),
    charges: chargeRows.map((row, position) =>
      chargeDto(row, pricedByKey.get(row.key), position, chargeTotals),
    ),
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function lineFromPayload(item: NonNullable<QuotationPayload["items"]>[number]): DraftLine {
  const caseQty = toNumber(item.sqiCaseQty);
  const billQty = toNumber(item.sqiBillQty);
  const lengthQty = toNumber(item.sqiLengthQty);
  const netQty = toNumber(item.sqiNetQty);

  // `sqi_to_base_factor` is not persisted, so it is back-derived from the stored
  // quantities: netQty = caseQty × factor + billQty × (lengthQty || 1).
  // Unrecoverable on a line with no case quantity — it loads as 1 there, which
  // keeps `netQty` right for that line but means the case half of any newly
  // keyed quantity contributes nothing until an item is re-picked.
  const loose = billQty * (lengthQty > 0 ? lengthQty : 1);
  const toBaseFactor = caseQty !== 0 ? (netQty - loose) / caseQty : 1;

  return createDraftLine({
    key: nextRowKey("line"),
    sqiId: item.sqiId,
    itemId: item.sqiItemId,
    itemUnitId: item.sqiItemUnitId,
    itemName: item.sqiItemName ?? "",
    unitName: item.sqiUnitName ?? "",
    hsnCode: item.sqiHsnCode,
    barcode: item.sqiEanCode,
    batchNo: item.sqiBatchNo,
    batchDate: item.sqiBatchDate ? toDateInput(item.sqiBatchDate) : null,
    expiryDate: item.sqiExpiryDate ? toDateInput(item.sqiExpiryDate) : null,
    priceLevel: clampPriceLevel(item.sqiPriceLevel ?? 1),
    isInclusiveTax: item.sqiIsTaxIncl === true,
    isPromo: item.sqiIsPromo === true,
    isFree: item.sqiIsFree === true,
    freeType: item.sqiFreeType,
    isService: item.sqiIsService === true,
    caseQty,
    billQty,
    lengthQty,
    toBaseFactor: Number.isFinite(toBaseFactor) && toBaseFactor > 0 ? toBaseFactor : 1,
    // With no case quantity there is nothing to divide, so the 1 above is a
    // placeholder, not the item's real factor: keying a Case Qty against it would
    // quote a fraction of the correct money. The screen recovers the real factor
    // from the item lookup the first time Case Qty is touched.
    toBaseFactorKnown: caseQty !== 0,
    weight: billQty !== 0 ? toNumber(item.sqiWeightQty) / billQty : toNumber(item.sqiWeightQty),
    stockQty: toNullableNumber(item.sqiAvailableStock),
    rate: toNumber(item.sqiRate),
    discPerc: toNumber(item.sqiItemDiscPerc),
    discPerQty: toNumber(item.sqiItemDiscQty),
    discAmt: toNumber(item.sqiItemDiscAmt),
    splDiscPerc: toNumber(item.sqiSplDiscPerc),
    splDiscPerQty: toNumber(item.sqiSplDiscQty),
    splDiscAmt: toNumber(item.sqiSplDiscAmt),
    schPerc: toNumber(item.sqiSchDiscPerc),
    schPerQty: toNumber(item.sqiSchDiscQty),
    schAmt: toNumber(item.sqiSchDiscAmt),
    billSchDiscPerc: toNumber(item.sqiBillSchPerc),
    cashDiscPerc: toNumber(item.sqiCashDiscPerc),
    cashDiscAmt: toNumber(item.sqiCashDiscAmt),
    gstPerc: toNumber(item.sqiTaxPerc),
    cgstPerc: toNumber(item.sqiCgstPerc),
    sgstPerc: toNumber(item.sqiSgstPerc),
    igstPerc: toNumber(item.sqiIgstPerc),
    cessPerc: toNumber(item.sqiCessPerc),
    cessPerUnit: toNumber(item.sqiCessPerUnit),
    mrp: toNumber(item.sqiMaxPrice),
    minPrice: toNumber(item.sqiMinPrice),
    actualPrice: toNumber(item.sqiActPrice),
    costPrice: toNumber(item.sqiCostPrice),
    costBeforeTax: toNumber(item.sqiCostPreTax),
    freightPerQty: toNumber(item.sqiFreightQty),
    loadingPerQty: toNumber(item.sqiLoadQty),
    hasFreight: toNumber(item.sqiFreightQty) > 0 || toNumber(item.sqiFreightAmt) > 0,
    schemeId: item.sqiSchemeId,
    schemeName: item.sqiSchemeName,
    schemeFlag: Boolean(item.sqiSchemeId),
    remarks: item.sqiRemarks,
  });
}

function chargeFromPayload(
  charge: NonNullable<QuotationPayload["charges"]>[number],
): DraftChargeRow {
  const taxPerc = toNumber(charge.cdTaxPerc);
  return {
    key: nextRowKey("charge"),
    cdId: charge.cdId,
    chgId: charge.cdChgId,
    chgName: charge.cdChgName ?? "",
    ledgerCode: charge.cdLedgerCode,
    // The quotation payload performs no ledger join, so the name is resolved
    // from the cached charge master rather than read back.
    ledgerName: null,
    role: asEnum(charge.cdRole, CHARGE_ROLES, "NONE"),
    method: asEnum(charge.cdMethod, CHARGE_METHODS, "FIXED"),
    type: asEnum(charge.cdType, CHARGE_TYPES, "ADD"),
    applyOn: asEnum(charge.cdApplyOn, CHARGE_APPLY_ONS, "FLAT"),
    costAlloc: charge.cdCostAlloc ? asEnum(charge.cdCostAlloc, CHARGE_COST_ALLOCS, "VALUE") : null,
    beforeTax: charge.cdBeforeTax === true,
    taxApl: charge.cdTaxApl === true,
    landingCost: charge.cdLandingCost === true,
    sepPost: charge.cdSepPost === true,
    // `cd_rate` and `cd_amount` are stored as magnitudes and signed totals
    // respectively — `cd_type` carries the sign — so the keyed amount is read
    // back as its absolute value. Without the `abs`, reloading a DEDUCT row that
    // was priced by total negates it a second time on the next edit.
    rate: Math.abs(toNumber(charge.cdRate)),
    amount: toNumber(charge.cdRate) === 0 ? Math.abs(toNumber(charge.cdAmount)) : 0,
    taxPerc,
    cgstPerc: toNumber(charge.cdCgstPerc) || taxPerc / 2,
    sgstPerc: toNumber(charge.cdSgstPerc) || taxPerc / 2,
    igstPerc: toNumber(charge.cdIgstPerc) || taxPerc,
    cessPerc: toNumber(charge.cdCessPerc),
    hsn: charge.cdHsn,
    taxCode: charge.cdTaxCode,
    unit: charge.cdUnit,
    qtyVal: toNullableNumber(charge.cdQtyVal),
    weight: toNullableNumber(charge.cdWeight),
    remarks: charge.cdRemarks,
    isActive: charge.cdIsActive !== false,
  };
}

/**
 * The saved document, in the shape the engine produces, with every figure read
 * straight out of the payload. This is what "nothing is repriced on load" means
 * in practice: the grids and the totals strip render this, not a recalculation,
 * so a document keeps the numbers it was quoted with even after the masters and
 * the policy have moved on.
 *
 * The only arithmetic here is addition of stored per-line values for the few
 * document totals the header does not persist (they are sums of what is already
 * on screen, not a re-pricing of anything).
 */
function storedPricingOf(
  payload: QuotationPayload,
  lines: DraftLine[],
  charges: DraftChargeRow[],
): DocumentPricing {
  const items = (payload.items ?? []).filter((item) => item.sqiIsDeleted !== true);
  const storedCharges = (payload.charges ?? []).filter((charge) => charge.cdIsDeleted !== true);

  const pricedLines: PricedLine[] = lines.map((line, index) => {
    const item = items[index];
    const netQty = toNumber(item?.sqiNetQty);
    return {
      ...line,
      netQty,
      rateBeforeTax: toNumber(item?.sqiRatePreTax),
      grossAmt: toNumber(item?.sqiGrossAmt),
      netGross: toNumber(item?.sqiNetGross),
      discAmt: toNumber(item?.sqiItemDiscAmt),
      splDiscAmt: toNumber(item?.sqiSplDiscAmt),
      schAmt: toNumber(item?.sqiSchDiscAmt),
      billSchDiscAmt: toNumber(item?.sqiBillSchAmt),
      freightAmt: toNumber(item?.sqiFreightAmt),
      loadingAmt: toNumber(item?.sqiLoadAmt),
      chrgBeforeTax: toNumber(item?.sqiChrgBeforeTax),
      chrgAfterTax: toNumber(item?.sqiChrgAfterTax),
      taxableAmt: toNumber(item?.sqiTaxableAmt),
      cgstAmt: toNumber(item?.sqiCgstAmt),
      sgstAmt: toNumber(item?.sqiSgstAmt),
      igstAmt: toNumber(item?.sqiIgstAmt),
      gstAmt: toNumber(item?.sqiTaxAmt),
      cessAmt: toNumber(item?.sqiCessAmt),
      total: toNumber(item?.sqiNetAmt),
      netPrice: toNumber(item?.sqiQuotePrice),
      netPriceBeforeTax: toNumber(item?.sqiQuotePreTax),
      savingsPerc: toNumber(item?.sqiMrpSavingsPerc),
      profit: toNumber(item?.sqiItemProfit),
      profitBeforeTax: toNumber(item?.sqiProfitPreTax),
      rateDiff: toNumber(item?.sqiRate) - toNumber(item?.sqiActPrice),
    };
  });

  const pricedCharges: PricedChargeRow[] = charges.map((row, index) => {
    const stored = storedCharges[index];
    const amountValue = toNumber(stored?.cdAmount);
    return {
      ...row,
      amountValue,
      // The per-line split is not persisted; the lines' own stored
      // `chrgBeforeTax`/`chrgAfterTax` already carry it.
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
    grossAmt: toNumber(payload.sqGrossAmt),
    netGross: sumLines((line) => line.netGross),
    itemDisc: toNumber(payload.sqItemDisc),
    splDisc: toNumber(payload.sqSplDisc),
    schDisc: toNumber(payload.sqSchDisc),
    billSchDisc: toNumber(payload.sqBillSchDisc),
    lineTaxable: sumLines((line) => line.taxableAmt),
    lineCgst: sumLines((line) => line.cgstAmt),
    lineSgst: sumLines((line) => line.sgstAmt),
    lineIgst: sumLines((line) => line.igstAmt),
    lineCess: sumLines((line) => line.cessAmt),
    lineTax: sumLines((line) => line.gstAmt + line.cessAmt),
    lineTotal: sumLines((line) => line.total),
    totQty: toNumber(payload.sqTotBags),
    totWeight: toNumber(payload.sqTotWeight),
    totItems: payload.sqTotItems ?? pricedLines.length,
    totalCost: toNumber(payload.sqTotalCost),
    totalProfit: sumLines((line) => line.profit * line.netQty),
    totalProfitBeforeTax: sumLines((line) => line.profitBeforeTax * line.netQty),
    totalLoyaltyPv: sumLines((line) => line.loyaltyPv * line.netQty),
    totalRateDiff: sumLines((line) => line.rateDiff * line.netQty),
    freeSchemeAmount: sumLines((line) => (line.isFree ? line.grossAmt : 0)),
    freightAmt: toNumber(payload.sqFreightAmt),
    loadAmt: toNumber(payload.sqLoadAmt),
    unloadAmt: toNumber(payload.sqUnloadAmt),
    cashDiscAmt: byRole(["CASH_DISC"]),
    otherAmt: byRole(["OTHERS", "NONE"]),
    chargeTaxable,
    chargeOwnTax,
    afterTaxNonTaxable,
    docTaxable: toNumber(payload.sqTaxableAmt),
    docCgst: toNumber(payload.sqCgstAmt),
    docSgst: toNumber(payload.sqSgstAmt),
    docIgst: toNumber(payload.sqIgstAmt),
    docCess: toNumber(payload.sqCessAmt),
    docTax: toNumber(payload.sqTaxAmt),
    amount: toNumber(payload.sqQuoteAmt) - toNumber(payload.sqRoundOff),
    roundOff: toNumber(payload.sqRoundOff),
    bill: toNumber(payload.sqQuoteAmt),
    savingAmt: toNumber(payload.sqMrpSavings),
    savingPerc: toNumber(payload.sqMrpSavingsPerc),
    marginAmt: toNumber(payload.sqMarginAmt),
    marginPerc: toNumber(payload.sqMarginPerc),
  };

  return { lines: pricedLines, charges: pricedCharges, totals };
}

/**
 * Turn a loaded document into a draft.
 *
 * Three rules carry over from the Qt client intact:
 *
 *  1. **Nothing is repriced on load.** The draft comes back `pricing: "stored"`,
 *     so every figure shown is the one that was saved; the first edit flips it
 *     to `live` and only then does the engine run — under *this document's*
 *     policy, not the session's.
 *  2. **Tenant context is the voucher's.** `sqCompanyId/BranchId/AccYear`
 *     overwrite the draft's, so an admin can open another company's or year's
 *     document and every later lookup and the save quote that one.
 *  3. **Server-owned fields are handed back untouched** — `sqQuoteSlno` stays a
 *     string end to end (a non-numeric series like `QT/0001` must survive the
 *     round trip), and `sqRevisionNo` / `sqDocType` are re-sent as loaded.
 *
 * The document's tax split is read from its own stored amounts: cgst+sgst
 * present means it was a local supply. Only a zero-tax document falls back to
 * comparing the place of supply, since the state it would be compared against is
 * the *voucher's* company's, and the client only knows the session company's.
 */
export function parseLoadedDocument(
  payload: QuotationPayload,
  fallbackCompanyStateCode: string,
): QuotationDraft {
  const quoteDate = toDateInput(payload.sqQuoteDate) || "";
  const validUntil = toDateInput(payload.sqValidUntil) || "";
  const lines = (payload.items ?? []).filter((item) => item.sqiIsDeleted !== true).map(lineFromPayload);
  const charges = (payload.charges ?? [])
    .filter((charge) => charge.cdIsDeleted !== true)
    .map(chargeFromPayload);

  const localTax = toNumber(payload.sqCgstAmt) + toNumber(payload.sqSgstAmt);
  const interStateTax = toNumber(payload.sqIgstAmt);
  const posStateCode = payload.sqPosStcd ?? "";
  const isLocalSale =
    localTax > 0 || interStateTax > 0
      ? localTax > 0
      : !posStateCode || posStateCode === fallbackCompanyStateCode;

  return {
    mode: "browse",
    pricing: "stored",
    isDirty: false,
    companyId: payload.sqCompanyId,
    branchId: payload.sqBranchId,
    accYear: payload.sqAccYear,
    companyStateCode: fallbackCompanyStateCode,
    docId: payload.sqId,
    quoteSlno: payload.sqQuoteSlno ?? "",
    quoteRefno: payload.sqQuoteRefno ?? "",
    revisionNo: payload.sqRevisionNo ?? 0,
    docType: payload.sqDocType || QUOTATION_DOC_TYPE,
    status: statusOf(payload.sqStatus ?? DEFAULT_QUOTATION_STATUS),
    isNewEntry: false,
    // A soft-deleted document still loads and still reads — it is the write
    // side that is closed off. See `QuotationDraft.isDeleted`.
    isDeleted: payload.sqIsDeleted === true,
    // The policy comes off the document; a legacy row with none falls back to
    // the engine default, never to the current session setting.
    policy: defaultPolicy({
      freightCalcType: (payload.sqFreightCalcType ?? "").trim() || "manual",
      loadingCalcType: (payload.sqLoadingCalcType ?? "").trim() || "manual",
      discountAlterBaseRate: payload.sqDiscAlterBase === true,
    }),
    customer: {
      ...emptyCustomer(),
      custId: payload.sqCustId,
      name: payload.sqCustName ?? "",
      address: payload.sqCustAddr,
      place: payload.sqCustPlace,
      phone: payload.sqCustPhone,
      email: payload.sqCustEmail,
      gstin: payload.sqCustGstin,
      gstType: payload.sqCustGstType,
      stateCode: payload.sqCustStcd,
      stateName: payload.sqStateName,
      areaId: payload.sqCustAreaId,
      localSales: isLocalSale,
      priceLevel: clampPriceLevel(payload.sqPriceLevel ?? 1),
    },
    header: {
      usrRefno: payload.sqUsrRefno ?? "",
      quoteDate,
      validUntil,
      validityDays: payload.sqValidityDays ?? 0,
      contactPerson: payload.sqContactPerson ?? "",
      contactNo: payload.sqContactPhone ?? "",
      areaId: payload.sqCustAreaId,
      agentId: payload.sqAgentId,
      salesmanId: payload.sqSalesmanId,
      // The GET carries no agent/salesman name, so both read blank until the
      // field is re-picked. Documented gap, not a parsing miss.
      agentName: "",
      salesmanName: "",
      posStateCode,
      posStateName: payload.sqStateName ?? "",
      hasFreight: payload.sqHasFreight === true,
      hasLoad: payload.sqHasLoad === true,
      hasUnload: payload.sqHasUnload === true,
      hasPromo: payload.sqHasPromo === true,
      priceLevel: clampPriceLevel(payload.sqPriceLevel ?? 1),
    },
    terms: {
      ...emptyTerms(),
      remarks: payload.sqRemarks ?? "",
      paymentTerms: payload.sqPaymentTerms ?? "",
      deliveryTerms: payload.sqDeliveryTerms ?? "",
      termsConditions: payload.sqTermsConditions ?? "",
    },
    lines,
    charges,
    isLocalSale,
    freightBands: [],
    storedPricing: storedPricingOf(payload, lines, charges),
  };
}
