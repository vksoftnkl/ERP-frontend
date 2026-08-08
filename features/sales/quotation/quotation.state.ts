/**
 * Quotation Entry — the draft, its factories and its state transitions. Pure: no
 * React, no Redux, no API, no clock except through the arguments it is handed.
 *
 * The reducer that drives these lives in `@/store/slices/quotationSlice` — this
 * module is what it, the payload builders and the tests all share, so a rule
 * like "before-tax wins over taxApl" or "editing the days re-derives the date"
 * is stated once and cannot drift between the three.
 *
 * The draft is the ONLY mutable state on the screen. Everything the operator
 * sees below the grids is `recalcDocument(draft)` in a `useMemo`, so there is
 * nothing to recalculate by hand and nothing to forget — the Qt rule that "every
 * handler ends in exactly one `recalcDocumentTotals()`" has no counterpart here.
 */
import { defaultPolicy, emptyChargeRow, emptyLine } from "@/domain/pricing";
import type {
  ChargeApplyOn,
  ChargeMethod,
  ChargeRole,
  ChargeType,
  VoucherPolicy,
} from "@/domain/pricing";
import {
  DEFAULT_FREIGHT_CALC_TYPE,
  DEFAULT_LOADING_CALC_TYPE,
  DEFAULT_POS_STATE_CODE,
  DEFAULT_POS_STATE_NAME,
  DEFAULT_QUOTATION_STATUS,
  DEFAULT_VALIDITY_DAYS,
  QUOTATION_DOC_TYPE,
  QUOTATION_STATUSES,
} from "./quotation.constants";
import type {
  ChargeMasterRow,
  CustomerDetailPayload,
  CustomerSnapshot,
  DraftChargeRow,
  DraftLine,
  ItemPriceLookupPayload,
  QuotationDraft,
  QuotationHeader,
  QuotationPayload,
  QuotationTerms,
} from "./quotation.types";
import { addDays, asEnum, daysBetween, nextRowKey, todayIso } from "./quotation.utils";

const CHARGE_ROLES: ChargeRole[] = [
  "FREIGHT",
  "LOADING",
  "UNLOADING",
  "CASH_DISC",
  "OTHERS",
  "NONE",
];
const CHARGE_METHODS: ChargeMethod[] = [
  "FIXED",
  "QTY",
  "NET_QTY",
  "KG",
  "QTL",
  "TON",
  "PERCENT",
];
const CHARGE_TYPES: ChargeType[] = ["ADD", "DEDUCT"];
const CHARGE_APPLY_ONS: ChargeApplyOn[] = ["FLAT", "QTY", "VALUE", "WEIGHT"];
const CHARGE_COST_ALLOCS = ["VALUE", "QTY", "WEIGHT"] as const;

/** Price levels are FK-checked server-side and the DTO has no range guard. */
export const MIN_PRICE_LEVEL = 1;
export const MAX_PRICE_LEVEL = 7;

export function clampPriceLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return MIN_PRICE_LEVEL;
  }
  return Math.min(MAX_PRICE_LEVEL, Math.max(MIN_PRICE_LEVEL, Math.trunc(level)));
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function emptyCustomer(): CustomerSnapshot {
  return {
    custId: null,
    name: "",
    masterName: "",
    englishName: null,
    address: null,
    place: null,
    phone: null,
    email: null,
    gstin: null,
    gstType: null,
    stateCode: null,
    stateName: null,
    areaId: null,
    areaName: null,
    distanceKm: null,
    allowDiscount: true,
    debitAllowed: false,
    debitDays: 0,
    debitLimit: 0,
    overdueBilling: false,
    localSales: true,
    priceLevel: MIN_PRICE_LEVEL,
    discPerc: 0,
    points: null,
    billedDate: null,
    tcsCompany: false,
  };
}

export function emptyHeader(quoteDate: string): QuotationHeader {
  return {
    usrRefno: "",
    quoteDate,
    // A new quotation opens with the standard validity window already counted
    // out; both fields are seeded because they are two views of one period and
    // nothing re-derives them until the operator edits one.
    validUntil: addDays(quoteDate, DEFAULT_VALIDITY_DAYS),
    validityDays: DEFAULT_VALIDITY_DAYS,
    contactPerson: "",
    contactNo: "",
    areaId: null,
    agentId: null,
    salesmanId: null,
    agentName: "",
    salesmanName: "",
    posStateCode: DEFAULT_POS_STATE_CODE,
    posStateName: DEFAULT_POS_STATE_NAME,
    hasFreight: false,
    hasLoad: false,
    hasUnload: false,
    hasPromo: false,
    priceLevel: MIN_PRICE_LEVEL,
  };
}

export function emptyTerms(): QuotationTerms {
  return { remarks: "", paymentTerms: "", deliveryTerms: "", termsConditions: "" };
}

/**
 * `seedDocumentPolicy` — the session's charge settings are copied onto the
 * document exactly twice: when a new quotation is started, and on Clear. After
 * that `draft.policy` is the only source, so changing the company setting
 * between two quotations cannot reprice the one already on screen.
 *
 * These are FIXED values, not defaults waiting for an operator: the entry screen
 * exposes no Freight Basis / Loading Basis / discount-alters-base controls, so a
 * new quotation always carries the policy stamped here. Change it here (or pass
 * an override) to change it for every new document. A loaded document still
 * prices under the policy it was saved with — that comes off the payload.
 */
export function seedDocumentPolicy(overrides: Partial<VoucherPolicy> = {}): VoucherPolicy {
  return defaultPolicy({
    freightCalcType: DEFAULT_FREIGHT_CALC_TYPE,
    loadingCalcType: DEFAULT_LOADING_CALC_TYPE,
    discountAlterBaseRate: false,
    ...overrides,
  });
}

export type DraftContext = {
  companyId: string;
  branchId: string;
  accYear: string;
  companyStateCode: string;
  quoteDate?: string;
  policy?: Partial<VoucherPolicy>;
};

export function createDraft(context: DraftContext): QuotationDraft {
  const quoteDate = context.quoteDate || todayIso();
  return {
    mode: "entry",
    pricing: "live",
    isDirty: false,
    companyId: context.companyId,
    branchId: context.branchId,
    accYear: context.accYear,
    companyStateCode: context.companyStateCode,
    docId: null,
    quoteSlno: "",
    quoteRefno: "",
    revisionNo: 0,
    docType: QUOTATION_DOC_TYPE,
    status: DEFAULT_QUOTATION_STATUS,
    isNewEntry: true,
    isDeleted: false,
    holdId: null,
    holdNo: "",
    policy: seedDocumentPolicy(context.policy),
    customer: emptyCustomer(),
    header: emptyHeader(quoteDate),
    terms: emptyTerms(),
    lines: [],
    charges: [],
    isLocalSale: resolveLocalSale(DEFAULT_POS_STATE_CODE, context.companyStateCode, true),
    freightBands: [],
    storedPricing: null,
  };
}

export function createDraftLine(overrides: Partial<DraftLine> = {}): DraftLine {
  return {
    ...emptyLine(),
    key: nextRowKey("line"),
    sqiId: null,
    itemUnitId: "",
    unitId: "",
    toBaseFactorKnown: true,
    unitName: "",
    itemName: "",
    itemCode: null,
    aliasName: null,
    hsnCode: null,
    barcode: null,
    batchNo: null,
    batchDate: null,
    expiryDate: null,
    godownId: null,
    godownName: null,
    stockQty: null,
    reorderQty: null,
    orderQty: 0,
    priceLevel: MIN_PRICE_LEVEL,
    schemeId: null,
    schemeName: null,
    schemeFlag: false,
    isPromo: false,
    isService: false,
    freeType: null,
    cashDiscPerc: 0,
    cashDiscAmt: 0,
    remarks: null,
    itemSize: null,
    decimalCount: 2,
    batchConfig: 0,
    allowNegative: false,
    groupId: null,
    brandId: null,
    sectionId: null,
    categoryId: null,
    salesmanId: null,
    salesmanName: null,
    srcDocId: null,
    ...overrides,
  };
}

/**
 * Build a charge line's `cd*` snapshot from the master row.
 *
 * The one place a naive copy breaks: `charge_master` has no guard against
 * `chgTaxApl && chgBeforeTax` both being true (its CHECK constraints were
 * dropped and the master's own form renders two independent checkboxes), while
 * the quotation service rejects that combination with a 400 on `cdTaxApl`. So the
 * conflict is resolved here, at snapshot time: **before-tax wins** — a charge
 * folded into the goods' taxable value is taxed at the item's rate and cannot
 * also carry its own GST.
 */
export function chargeRowFromMaster(master: ChargeMasterRow): DraftChargeRow {
  const beforeTax = master.chgBeforeTax === true;
  const taxApl = master.chgTaxApl === true && !beforeTax;
  const taxPerc = taxApl ? (master.ledGstRate ?? 0) : 0;
  const half = taxPerc / 2;

  return {
    ...emptyChargeRow(),
    key: nextRowKey("charge"),
    cdId: null,
    chgId: master.chgId,
    chgName: master.chgName,
    ledgerCode: master.chgLedgerCode,
    ledgerName: master.chgLedgerName,
    role: asEnum(master.chgRole, CHARGE_ROLES, "NONE"),
    method: asEnum(master.chgMethod, CHARGE_METHODS, "FIXED"),
    type: asEnum(master.chgType, CHARGE_TYPES, "ADD"),
    applyOn: asEnum(master.chgApplyOn, CHARGE_APPLY_ONS, "FLAT"),
    costAlloc: master.chgCostAlloc
      ? asEnum(master.chgCostAlloc, CHARGE_COST_ALLOCS, "VALUE")
      : null,
    beforeTax,
    taxApl,
    landingCost: master.chgLandingCost === true,
    sepPost: master.chgSepPost === true,
    // `chgDefaultRate` seeds the rate; from then on it belongs to the operator.
    rate: master.chgDefaultRate ?? 0,
    amount: 0,
    taxPerc,
    cgstPerc: half,
    sgstPerc: half,
    igstPerc: taxPerc,
    cessPerc: 0,
    hsn: master.ledHsnSac,
    taxCode: null,
    unit: null,
    qtyVal: null,
    weight: null,
    remarks: null,
    isActive: true,
  };
}

/**
 * Fill a line from `/master-lookups/item-price`.
 *
 * `item_uc_id` is the unit-conversion id (`iuc_id`) — the value the line stores
 * and the payload sends as `sqiItemUnitId`. A `null` loading/freight charge means
 * "nothing resolved" (the policy is manual, or the master holds 0), never zero,
 * so it lands as 0 and stays editable.
 *
 * Not available from this lookup and therefore left alone: `hsnCode` (the payload
 * has no HSN field), `unitId` (the raw unit id — `base_unit_id` is the *base*
 * unit's, not this conversion's) and `aliasName`.
 */
export function applyItemPrice(
  line: DraftLine,
  lookup: ItemPriceLookupPayload,
  extra: { unitName?: string; unitId?: string } = {},
): DraftLine {
  return {
    ...line,
    itemId: lookup.item_id,
    itemUnitId: lookup.item_uc_id,
    unitName: extra.unitName ?? lookup.unit_name ?? line.unitName,
    unitId: extra.unitId ?? line.unitId,
    itemName: lookup.item_name,
    itemCode: lookup.item_code,
    barcode: lookup.barcode ?? line.barcode,
    godownId: lookup.godown_id,
    godownName: lookup.godown_name || null,
    stockQty: lookup.stock,
    reorderQty: lookup.reorder_qty,
    toBaseFactor: lookup.base_factor || 1,
    toBaseFactorKnown: true,
    priceLevel: clampPriceLevel(lookup.price_level),
    rate: lookup.sales_price,
    // The item's own standard price for this level. `rateDiff` measures the keyed
    // rate against it, so on a fresh fill the difference is 0.
    actualPrice: lookup.sales_price,
    mrp: lookup.max_price,
    minPrice: lookup.min_price,
    costPrice: lookup.cost_price,
    costBeforeTax: lookup.cost_wot,
    discPerc: lookup.disc_perc,
    discPerQty: lookup.disc_qty,
    discAmt: 0,
    gstPerc: lookup.gst_rate,
    cgstPerc: lookup.cgst_perc,
    sgstPerc: lookup.sgst_perc,
    igstPerc: lookup.igst_perc,
    cessPerc: lookup.cess_perc,
    cessPerUnit: lookup.cess_unit,
    isInclusiveTax: lookup.item_incl_tax,
    weight: lookup.iuc_uom_weight,
    loyaltyPv: lookup.loyalty_pv,
    hasFreight: lookup.add_freight,
    freightPerQty: lookup.freight_charge ?? 0,
    loadingPerQty: lookup.loading_charge ?? 0,
    decimalCount: lookup.decimal_count,
    batchConfig: lookup.batch_config,
    allowNegative: lookup.allow_negative_stock,
    isService: lookup.service_item === "Y",
    isPromo: lookup.allow_promo,
    groupId: lookup.item_group_id,
    brandId: lookup.item_brand_id,
    sectionId: lookup.item_section_id,
    categoryId: lookup.item_category_id,
  };
}

export function customerFromDetail(detail: CustomerDetailPayload): CustomerSnapshot {
  return {
    custId: detail.cust_id,
    name: detail.cust_name,
    masterName: detail.cust_name,
    englishName: detail.cust_ename,
    address: detail.cust_address,
    place: detail.cust_place,
    phone: detail.cust_phone1,
    email: null,
    gstin: detail.gst_no || detail.ecommerce_gstin,
    gstType: detail.gst_type,
    stateCode: detail.state_code || null,
    stateName: detail.state_name || null,
    areaId: detail.area_id || null,
    areaName: detail.area_name,
    distanceKm: detail.distance_km,
    allowDiscount: detail.allow_discount,
    debitAllowed: detail.debit_allowed,
    debitDays: detail.debit_days,
    debitLimit: detail.debit_limit,
    overdueBilling: detail.overdue_billing,
    localSales: detail.local_sales,
    // 1-based on the master and 1-based on `/item-price`, so it passes straight
    // through. Shifting it once put a level-1 customer on level 2.
    priceLevel: clampPriceLevel(detail.price_level),
    discPerc: detail.cust_disc_perc,
    points: detail.cust_points,
    billedDate: detail.billed_date,
    tcsCompany: detail.tcs_company,
  };
}

/**
 * Place of supply decides which tax the document carries, and nothing else. An
 * empty state code is ignored — clearing the dropdown is not a request to re-tax
 * the document.
 */
export function resolveLocalSale(
  posStateCode: string,
  companyStateCode: string,
  fallback: boolean,
): boolean {
  const pos = (posStateCode ?? "").trim();
  const company = (companyStateCode ?? "").trim();
  if (!pos || !company) {
    return fallback;
  }
  return pos === company;
}

/**
 * "Copy as new" — the toolbar action that starts a fresh, unsaved document
 * pre-filled from the one on screen (customer, terms, policy, lines, charges),
 * the same way the Qt screen's own Copy-as-New worked.
 *
 * Only the server-owned identity is stripped: `docId`/`quoteSlno`/`quoteRefno`
 * are allocated inside the create transaction, so keeping them would make the
 * next save look like an update of the source document instead of a new one.
 * Each line's and charge's own `sqiId`/`cdId` are cleared for the same reason.
 * The quote date is reset to today and `validUntil` re-derived from it, exactly
 * as `applyHeaderField` already does for an operator edit to the date.
 *
 * `isDeleted` is cleared with the identity: the copy is a document that has
 * never existed server-side, so it cannot be deleted. This is deliberately the
 * ONE action a soft-deleted quotation still allows — it is how the operator
 * rescues the contents of one without resurrecting it.
 *
 * The hold link goes with the identity for the same reason: the copy is not the
 * cart that was parked, so holding it must park a second one rather than
 * overwrite the original.
 */
export function copyDraftAsNew(draft: QuotationDraft, quoteDate: string): QuotationDraft {
  return {
    ...draft,
    mode: "entry",
    pricing: "live",
    isDirty: true,
    docId: null,
    quoteSlno: "",
    quoteRefno: "",
    revisionNo: 0,
    status: DEFAULT_QUOTATION_STATUS,
    isNewEntry: true,
    isDeleted: false,
    holdId: null,
    holdNo: "",
    header: applyHeaderField(draft.header, "quoteDate", quoteDate),
    lines: draft.lines.map((line) => ({ ...line, sqiId: null })),
    charges: draft.charges.map((row) => ({ ...row, cdId: null })),
    storedPricing: null,
  };
}

/**
 * Fold a save response back into the draft.
 *
 * The response is deliberately NOT re-parsed as a fresh document: on the save
 * path the server performs no joins, so `sqiItemName` / `sqiUnitName` come back
 * `null` and re-parsing would blank every item name on screen. Only the
 * server-owned identities are taken — the document id, the voucher number and
 * refno assigned from the sequence, the revision, and the per-line / per-charge
 * ids that make the next save an update instead of a duplicate.
 *
 * `sqQuoteSlno` stays a string end to end: a non-numeric series like `QT/0001`
 * has to survive the round trip, so it is never parsed as an integer.
 *
 * This lives with the reducer, not with the payload builders, because it has to
 * merge into whatever the state is when the response lands — an operator can
 * commit another cell while the POST is in flight.
 */
export function applySaveResponse(
  draft: QuotationDraft,
  payload: QuotationPayload,
  /**
   * The draft the request was built from. When it is still the current one,
   * nothing was committed while the POST was in flight and the document is
   * genuinely saved; when it is not, the operator's later edit is unsaved and
   * the dirty flag has to stand.
   */
  sentDraft?: QuotationDraft,
): QuotationDraft {
  const savedItems = (payload.items ?? []).filter((item) => item.sqiIsDeleted !== true);
  const savedCharges = (payload.charges ?? []).filter((charge) => charge.cdIsDeleted !== true);

  // The payload was built from the populated lines in order, numbered from 1,
  // and the response comes back sorted by that same line number.
  const itemByLineNo = new Map(savedItems.map((item) => [item.sqiLineNo ?? 0, item]));
  const chargeBySlno = new Map(savedCharges.map((charge) => [charge.cdSlno ?? 0, charge]));

  let populated = 0;
  const lines = draft.lines.map((line) => {
    if (!line.itemId) {
      return line;
    }
    populated += 1;
    const saved = itemByLineNo.get(populated) ?? savedItems[populated - 1];
    return saved ? { ...line, sqiId: saved.sqiId } : line;
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

  return {
    ...draft,
    docId: payload.sqId,
    quoteSlno: payload.sqQuoteSlno ?? draft.quoteSlno,
    quoteRefno: payload.sqQuoteRefno ?? draft.quoteRefno,
    revisionNo: payload.sqRevisionNo ?? draft.revisionNo,
    docType: payload.sqDocType || draft.docType,
    status: asEnum(payload.sqStatus, QUOTATION_STATUSES, DEFAULT_QUOTATION_STATUS),
    isNewEntry: false,
    isDeleted: payload.sqIsDeleted === true,
    isDirty: sentDraft === undefined ? false : sentDraft !== draft,
    lines,
    charges,
  };
}

// ---------------------------------------------------------------------------
// Header transitions
// ---------------------------------------------------------------------------

/**
 * `validUntil` and `validityDays` are two views of one period counted from
 * `quoteDate`. Editing the days (or moving the quote date) re-derives the date;
 * editing the date re-derives the days, floored at 0.
 *
 * A `validUntil` before `quoteDate` is deliberately left standing as keyed and
 * rejected at save — silently "correcting" the operator's date is worse than
 * telling them.
 */
function syncValidityPair(
  header: QuotationHeader,
  edited: "quoteDate" | "validUntil" | "validityDays",
): QuotationHeader {
  if (edited === "validUntil") {
    const days = header.validUntil ? daysBetween(header.quoteDate, header.validUntil) : 0;
    return { ...header, validityDays: days === null ? header.validityDays : Math.max(0, days) };
  }
  if (!header.validityDays || header.validityDays <= 0) {
    return edited === "quoteDate" ? header : { ...header, validUntil: "" };
  }
  const validUntil = addDays(header.quoteDate, header.validityDays);
  return validUntil ? { ...header, validUntil } : header;
}

/**
 * One header field, with the two fields that are not independent of it kept in
 * step. The slice's `headerFieldSet` is this function and nothing else.
 */
export function applyHeaderField(
  header: QuotationHeader,
  field: keyof QuotationHeader,
  value: string | number | boolean,
): QuotationHeader {
  const next = { ...header, [field]: value } as QuotationHeader;
  if (field === "quoteDate" || field === "validUntil" || field === "validityDays") {
    return syncValidityPair(next, field);
  }
  if (field === "priceLevel") {
    return { ...next, priceLevel: clampPriceLevel(Number(value)) };
  }
  return next;
}

/** A blank charge row: no charge picked yet, so it prices to nothing. */
export function createDraftChargeRow(overrides: Partial<DraftChargeRow> = {}): DraftChargeRow {
  return {
    ...emptyChargeRow(),
    key: nextRowKey("charge"),
    cdId: null,
    chgName: "",
    ledgerCode: "",
    ledgerName: null,
    hsn: null,
    taxCode: null,
    unit: null,
    qtyVal: null,
    weight: null,
    cessPerc: 0,
    sepPost: false,
    landingCost: false,
    costAlloc: null,
    remarks: null,
    isActive: true,
    ...overrides,
  };
}
