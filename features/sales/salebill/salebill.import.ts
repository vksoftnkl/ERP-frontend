/**
 * Sale Bill Entry — importing a quotation (Ctrl+F3) or a sales order (Ctrl+F4).
 *
 * Two entry points, one shape: pick → fetch by id **with the source's own
 * accounting year** → paint. Both stamp the source trail (`sbSrcDoc*` on the
 * header, `srcDocId` per line), and neither ever reprices: the engine runs over
 * the draft that comes out of here, once, like any other edit.
 *
 * Pure — no React, no API. The caller does the fetching; this does the
 * translating, so every rule below is unit-testable without a server.
 *
 * The rules that are not obvious, and each is a way to bill the wrong quantity:
 *
 *  - **Quoted figures are KEPT.** A quotation is a promise; the bill opens on
 *    the numbers the customer was quoted, and the operator reviews quantities
 *    anyway.
 *  - **An order imports the PENDING quantity**, never the ordered one, and a
 *    line with nothing pending is skipped and counted. Billing the full quantity
 *    a second time is exactly the mistake this screen must not make.
 *  - **The order's `Size` crosses only on a whole first delivery** — nothing
 *    delivered and nothing cancelled. `"12*6*2*10"` describes all ten boards; on
 *    a part delivery it would print dimensions for ten against a quantity of six.
 *  - **An already-billed quotation is REFUSED.** The Qt picker has no such check
 *    and no status filter, so the same quotation can be billed twice. That is
 *    the one behaviour §13 explicitly says to fix rather than carry over.
 *
 * Known losses, and they are SCHEMA gaps rather than client bugs — do not spend
 * a sprint "fixing" them here: `sale_quotation_item` has no salesman or stock
 * column at all, and `sale_order_item` has no batch columns. The fields cannot
 * cross because they do not exist on the source. The GODOWN is the one that
 * looks like such a gap and is not: the column does not exist either, but
 * `GET /quotations/get` stamps every line with the quotation branch's default
 * one, so it crosses like any other field.
 */
import { clampPriceLevel } from "@/features/sales/quotation/quotation.state";
import type {
  QuotationListRow,
  QuotationPayload,
} from "@/features/sales/quotation/quotation.types";
import { toDateInput, toNumber } from "@/features/sales/quotation/quotation.utils";
import type {
  SaleOrderItemPayload,
  SaleOrderPayload,
} from "@/features/sales/sale-order/sale-order.types";
import { BILL_SOURCE_DOC_TYPES } from "./salebill.constants";
import { createBillDraftLine } from "./salebill.state";
import type { BillSourceTrail, SaleBillDraft, SaleBillDraftLine } from "./salebill.types";

/** What an import produced, and what it could not bring across. */
export type ImportOutcome = {
  draft: SaleBillDraft;
  /** Lines that crossed. */
  imported: number;
  /** Lines skipped because nothing was left to bill, shown as a count. */
  skipped: number;
  /** A sentence for the operator, or `null` when everything crossed cleanly. */
  note: string | null;
};

/** Why a source document may not be billed at all. */
export type ImportRefusal = { reason: string };

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Whether this quotation may be billed — **the fix §13 asks for**.
 *
 * The Qt picker offers every quotation, filters nothing and checks no status, so
 * one can be billed twice. Three refusals, in the order an operator would hit
 * them:
 *
 *  - already converted (`sq_converted_doc_id` names the document it became);
 *  - cancelled or soft-deleted;
 *  - a status that says the promise is closed.
 *
 * The list row is what the picker has in hand, so the check runs there — before
 * the fetch, before anything is painted.
 */
export function quotationImportRefusal(row: QuotationListRow): ImportRefusal | null {
  if (row.sq_converted_doc_id) {
    return {
      reason: `Quotation ${row.sq_quote_refno ?? ""} has already been converted into another document. Billing it again would sell the same goods twice.`.trim(),
    };
  }
  if (row.sq_cancelled_on) {
    return { reason: `Quotation ${row.sq_quote_refno ?? ""} was cancelled.`.trim() };
  }
  if (row.sq_is_deleted === true || row.sq_is_deleted === "true") {
    return { reason: `Quotation ${row.sq_quote_refno ?? ""} has been deleted.`.trim() };
  }
  const status = (row.sq_status ?? "").trim().toUpperCase();
  if (status === "CONVERTED" || status === "CANCELLED" || status === "EXPIRED") {
    return {
      reason: `Quotation ${row.sq_quote_refno ?? ""} is ${status.toLowerCase()} and cannot be billed.`.trim(),
    };
  }
  return null;
}

/**
 * Whether this order may be billed. The order picker IS the pending list, so
 * this is the second gate rather than the only one — a cancelled or fully
 * delivered order is refused with a reason rather than silently importing zero
 * lines.
 */
export function orderImportRefusal(payload: SaleOrderPayload): ImportRefusal | null {
  const refno = payload.soOrderRefno ?? "";
  const status = (payload.soStatus ?? "").trim().toUpperCase();
  if (payload.soIsDeleted === true) {
    return { reason: `Order ${refno} has been deleted.`.trim() };
  }
  if (status === "CANCELLED") {
    return { reason: `Order ${refno} was cancelled.`.trim() };
  }
  if (status === "COMPLETED" || status === "CLOSED") {
    return {
      reason: `Order ${refno} is ${status.toLowerCase()} — every line has already been delivered or written off.`.trim(),
    };
  }
  const pending = (payload.items ?? [])
    .filter((item) => item.soiIsDeleted !== true)
    .reduce((total, item) => total + toNumber(item.soiPendingQty), 0);
  if (pending <= 0) {
    return { reason: `Order ${refno} has nothing left to bill.`.trim() };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shared painting
// ---------------------------------------------------------------------------

/**
 * Everything an import does to the draft that is not the lines: the source
 * trail, the customer snapshot, the place of supply and the charges.
 *
 * The charges ride across **with their ids cleared** — the bill inserts its own
 * `txn_charge_detail` rows and must never claim the source's. Same for the line
 * ids, which is why the line builders below start from `createBillDraftLine()`.
 *
 * The POS the source was priced under carries over and stays overridable: a
 * quotation raised for a ship-to across a state line was quoted at IGST, and
 * silently re-taxing it on import would change the money the customer was
 * promised.
 */
function paintCommon(
  draft: SaleBillDraft,
  source: BillSourceTrail,
  values: {
    custId: string | null;
    custName: string;
    custAddr: string | null;
    custPlace: string | null;
    custPhone: string | null;
    custGstin: string | null;
    custGstType: string | null;
    custStcd: string | null;
    posStcd: string | null;
    stateName: string | null;
    priceLevel: number;
    hasFreight: boolean;
    hasLoad: boolean;
    hasUnload: boolean;
    hasPromo: boolean;
    terms: { remarks: string; paymentTerms: string; deliveryTerms: string; termsConditions: string };
    freightCalcType: string;
    loadingCalcType: string;
    discAlterBase: boolean;
  },
): SaleBillDraft {
  const posStateCode = (values.posStcd ?? "").trim() || (values.custStcd ?? "").trim();
  return {
    ...draft,
    isDirty: true,
    pricing: "live",
    source,
    customer: {
      ...draft.customer,
      custId: values.custId,
      name: values.custName,
      // Blank on purpose, as on the quotation screen: the imported bill already
      // names its customer in the Customer Name field below, and the Existing
      // Customer box is the picker for LINKING one — it opens ready to search
      // and fills in again only if the operator picks somebody else. `custId`
      // above is what keeps the link; this is only what the box reads back.
      masterName: "",
      address: values.custAddr,
      place: values.custPlace,
      phone: values.custPhone,
      gstin: values.custGstin,
      gstType: values.custGstType,
      stateCode: (values.custStcd ?? "").trim() || posStateCode || null,
      priceLevel: clampPriceLevel(values.priceLevel),
    },
    header: {
      ...draft.header,
      posStateCode,
      posStateName: values.stateName ?? draft.header.posStateName,
      priceLevel: clampPriceLevel(values.priceLevel),
      hasFreight: values.hasFreight,
      hasLoad: values.hasLoad,
      hasUnload: values.hasUnload,
      hasPromo: values.hasPromo,
    },
    terms: { ...draft.terms, ...values.terms },
    // The document's own pricing policy crosses too, or the bill would reprice
    // the quoted goods under today's settings.
    policy: {
      ...draft.policy,
      freightCalcType: values.freightCalcType || draft.policy.freightCalcType,
      loadingCalcType: values.loadingCalcType || draft.policy.loadingCalcType,
      discountAlterBaseRate: values.discAlterBase,
    },
    isLocalSale:
      posStateCode && draft.companyStateCode
        ? posStateCode === draft.companyStateCode
        : draft.isLocalSale,
    // A fresh document's own settlement: the source's money is the SOURCE's.
    tenders: [],
    adjustments: [],
    adjustmentsTouched: false,
  };
}

// ---------------------------------------------------------------------------
// Quotation (Ctrl+F3)
// ---------------------------------------------------------------------------

/**
 * One quotation line onto a bill line.
 *
 * **The quoted figures are kept verbatim** — rate, every discount, the tax block
 * — because a quotation is a promise and the bill opens on the numbers the
 * customer was given.
 *
 * The stock gate is left UNRESOLVED. The Qt screen leaves `AllowNegative` empty
 * here, which turns the gate ON against a month-old stock snapshot; the honest
 * answer is that neither the flag nor today's stock is known until the item
 * lookup is re-run (§7.2).
 *
 * No salesman or stock crosses, because `sale_quotation_item` has no such
 * column. The GODOWN does, even though the column does not exist: the GET
 * stamps every line with the quotation branch's default godown, and that is
 * exactly the value a bill line needs (`sbi_godown_id` is NOT NULL). A branch
 * with no default still answers null, so `validate.ts` keeps saying which line
 * needs re-picking rather than letting the server 400.
 */
function billLineFromQuotationItem(
  item: NonNullable<QuotationPayload["items"]>[number],
  source: BillSourceTrail,
): SaleBillDraftLine {
  return {
    ...createBillDraftLine(),
    itemId: item.sqiItemId,
    itemUnitId: item.sqiItemUnitId,
    itemName: item.sqiItemName ?? "",
    unitName: item.sqiUnitName ?? "",
    hsnCode: item.sqiHsnCode,
    barcode: item.sqiEanCode,
    itemSize: item.sqiSize,
    godownId: item.sqiGodownId ?? null,
    godownName: item.sqiGodownName ?? null,
    batchNo: item.sqiBatchNo,
    batchDate: toDateInput(item.sqiBatchDate) || null,
    expiryDate: toDateInput(item.sqiExpiryDate) || null,
    priceLevel: clampPriceLevel(item.sqiPriceLevel ?? 1),
    isInclusiveTax: item.sqiIsTaxIncl === true,
    isPromo: item.sqiIsPromo === true,
    isFree: item.sqiIsFree === true,
    freeType: item.sqiFreeType,
    isService: item.sqiIsService === true,
    caseQty: toNumber(item.sqiCaseQty),
    billQty: toNumber(item.sqiBillQty),
    lengthQty: toNumber(item.sqiLengthQty),
    rate: toNumber(item.sqiRate),
    actualPrice: toNumber(item.sqiActPrice),
    mrp: toNumber(item.sqiMaxPrice),
    minPrice: toNumber(item.sqiMinPrice),
    costPrice: toNumber(item.sqiCostPrice),
    costBeforeTax: toNumber(item.sqiCostPreTax),
    discPerc: toNumber(item.sqiItemDiscPerc),
    discPerQty: toNumber(item.sqiItemDiscQty),
    splDiscPerc: toNumber(item.sqiSplDiscPerc),
    splDiscPerQty: toNumber(item.sqiSplDiscQty),
    schPerc: toNumber(item.sqiSchDiscPerc),
    schPerQty: toNumber(item.sqiSchDiscQty),
    billSchDiscPerc: toNumber(item.sqiBillSchPerc),
    cashDiscPerc: toNumber(item.sqiCashDiscPerc),
    cashDiscAmt: toNumber(item.sqiCashDiscAmt),
    gstPerc: toNumber(item.sqiTaxPerc),
    cgstPerc: toNumber(item.sqiCgstPerc),
    sgstPerc: toNumber(item.sqiSgstPerc),
    igstPerc: toNumber(item.sqiIgstPerc),
    cessPerc: toNumber(item.sqiCessPerc),
    cessPerUnit: toNumber(item.sqiCessPerUnit),
    freightPerQty: toNumber(item.sqiFreightQty),
    loadingPerQty: toNumber(item.sqiLoadQty),
    weight: divideOrZero(toNumber(item.sqiWeightQty), toNumber(item.sqiBillQty)),
    schemeId: item.sqiSchemeId,
    schemeName: item.sqiSchemeName,
    remarks: item.sqiRemarks,
    srcDocType: source.docType,
    srcDocId: item.sqiId,
    srcDocYear: source.accYear,
    srcDocRefno: source.refno,
    srcDocLineNo: item.sqiLineNo,
    srcItemQty: toNumber(item.sqiBillQty),
    // A quotation promises nothing about quantity, so there is no cap.
    orderQtyLocked: false,
    // The quotation GET RESOLVES this from today's godown, company and item
    // rows rather than reading a stored column, so it is as current as a
    // re-lookup and crosses like any other field; `null` (no item join) is not
    // a licence and reads false. `sqiAvailableStock` is a snapshot and does not
    // cross, which is why the line still arrives unresolved: an item that may
    // NOT go negative is judged only after its own price lookup has run.
    allowNegative: item.sqiAllowNegativeStock === true,
    stockGateResolved: false,
  };
}

function divideOrZero(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function importQuotation(draft: SaleBillDraft, payload: QuotationPayload): ImportOutcome {
  const source: BillSourceTrail = {
    docType: BILL_SOURCE_DOC_TYPES[0],
    docId: payload.sqId,
    // The SOURCE's own year, not the bill's: every txn table is partitioned by
    // it, and a March quotation really can be billed in April.
    accYear: payload.sqAccYear,
    refno: payload.sqQuoteRefno,
    date: toDateInput(payload.sqQuoteDate) || null,
  };
  const items = (payload.items ?? []).filter((item) => item.sqiIsDeleted !== true);
  const lines = items.map((item) => billLineFromQuotationItem(item, source));

  const painted = paintCommon(draft, source, {
    custId: payload.sqCustId,
    custName: payload.sqCustName,
    custAddr: payload.sqCustAddr,
    custPlace: payload.sqCustPlace,
    custPhone: payload.sqCustPhone,
    custGstin: payload.sqCustGstin,
    custGstType: payload.sqCustGstType,
    custStcd: payload.sqCustStcd,
    posStcd: payload.sqPosStcd,
    stateName: payload.sqStateName,
    priceLevel: payload.sqPriceLevel,
    hasFreight: payload.sqHasFreight === true,
    hasLoad: payload.sqHasLoad === true,
    hasUnload: payload.sqHasUnload === true,
    hasPromo: payload.sqHasPromo === true,
    terms: {
      remarks: payload.sqRemarks ?? "",
      paymentTerms: payload.sqPaymentTerms ?? "",
      deliveryTerms: payload.sqDeliveryTerms ?? "",
      termsConditions: payload.sqTermsConditions ?? "",
    },
    freightCalcType: payload.sqFreightCalcType ?? "",
    loadingCalcType: payload.sqLoadingCalcType ?? "",
    discAlterBase: payload.sqDiscAlterBase === true,
  });

  return {
    draft: { ...painted, lines, charges: freshChargeGrid() },
    imported: lines.length,
    skipped: 0,
    note: importQuotationNote(lines),
  };
}

/**
 * What the operator is told after a quotation import.
 *
 * The godown now crosses with the lines, so the re-pick hint is only earned
 * when a line actually arrived without one — a quotation raised on a branch
 * with no default godown. Saying it every time trains the operator to ignore it.
 */
function importQuotationNote(lines: SaleBillDraftLine[]): string {
  if (lines.length === 0) {
    return "That quotation has no lines on it.";
  }
  const missing = lines.filter((line) => !line.godownId).length;
  return missing === 0
    ? "Quoted rates and discounts were kept — check the quantities before saving."
    : `Quoted rates and discounts were kept — check the quantities, and re-pick ${
        missing === 1 ? "the line that has" : `the ${missing} lines that have`
      } no godown.`;
}

/**
 * The charge grid an import leaves behind: EMPTY.
 *
 * Two rules meet here and they agree on the answer. Charges ride across "with
 * their ids cleared" (§13) — the bill inserts its own `txn_charge_detail` rows
 * and carrying the source's `cdId` would make the save try to update a row
 * belonging to another document. And every load / restore / import path must
 * clear the grid first (§6, guard 2), so that the auto-apply seed can run on a
 * document that genuinely has no charges.
 *
 * Clearing it is what lets the standing charges re-seed from `chg_auto_apply`
 * against the bill's own customer and flags; merging the source's rows in as
 * well would price the same freight twice.
 */
function freshChargeGrid(): [] {
  return [];
}

// ---------------------------------------------------------------------------
// Sales order (Ctrl+F4)
// ---------------------------------------------------------------------------

/**
 * Whether an order line's `Size` may cross.
 *
 * Only on a WHOLE first delivery — nothing delivered and nothing cancelled.
 * `"12*6*2*10"` describes all ten boards; carried onto a part delivery it would
 * print dimensions for ten against a quantity of six, and the dimensions are
 * what the customer measures the timber against.
 */
export function sizeCrossesOn(item: SaleOrderItemPayload): boolean {
  return toNumber(item.soiDeliveredQty) === 0 && toNumber(item.soiCancelledQty) === 0;
}

function billLineFromOrderItem(
  item: SaleOrderItemPayload,
  source: BillSourceTrail,
): SaleBillDraftLine {
  const pending = toNumber(item.soiPendingQty);
  const ordered = toNumber(item.soiOrderQty);
  const factor = toNumber(item.soiToBaseFactor) || 1;
  const lengthQty = toNumber(item.soiLengthQty);
  // The order stores case / length / NET and no loose quantity of its own, so
  // the billable loose figure is recovered the same way the order screen
  // recovers its own — except against what is PENDING rather than what was
  // ordered.
  const caseQty = 0;
  const loose = pending - caseQty * factor;
  const billQty = lengthQty > 0 ? loose / lengthQty : loose;
  return {
    ...createBillDraftLine(),
    itemId: item.soiItemId,
    itemUnitId: item.soiItemUnitId,
    itemName: item.soiItemName ?? "",
    unitName: item.soiUnitName ?? "",
    hsnCode: item.soiHsnCode,
    barcode: item.soiEanCode,
    // Only on a whole first delivery — see `sizeCrossesOn`.
    itemSize: sizeCrossesOn(item) ? item.soiSize : null,
    godownId: item.soiGodownId,
    godownName: item.soiGodownName ?? null,
    priceLevel: clampPriceLevel(item.soiPriceLevel ?? 1),
    isInclusiveTax: item.soiIsTaxIncl === true,
    isPromo: item.soiIsPromo === true,
    isFree: item.soiIsFree === true,
    freeType: item.soiFreeType,
    isService: item.soiIsService === true,
    hasFreight: item.soiHasFreight === true,
    toBaseFactor: factor,
    toBaseFactorKnown: true,
    caseQty,
    // The PENDING quantity, never the ordered one.
    billQty,
    lengthQty,
    rate: toNumber(item.soiRate),
    actualPrice: toNumber(item.soiActPrice),
    mrp: toNumber(item.soiMaxPrice),
    minPrice: toNumber(item.soiMinPrice),
    costPrice: toNumber(item.soiCostPrice),
    costBeforeTax: toNumber(item.soiCostPreTax),
    discPerc: toNumber(item.soiItemDiscPerc),
    discPerQty: toNumber(item.soiItemDiscQty),
    splDiscPerc: toNumber(item.soiSplDiscPerc),
    splDiscPerQty: toNumber(item.soiSplDiscQty),
    schPerc: toNumber(item.soiSchDiscPerc),
    schPerQty: toNumber(item.soiSchDiscQty),
    billSchDiscPerc: toNumber(item.soiBillSchPerc),
    gstPerc: toNumber(item.soiTaxPerc),
    cgstPerc: toNumber(item.soiCgstPerc),
    sgstPerc: toNumber(item.soiSgstPerc),
    igstPerc: toNumber(item.soiIgstPerc),
    cessPerc: toNumber(item.soiCessPerc),
    cessPerUnit: toNumber(item.soiCessPerUnit),
    freightPerQty: toNumber(item.soiFreightQty),
    loadingPerQty: toNumber(item.soiLoadQty),
    weight: divideOrZero(toNumber(item.soiWeightQty), toNumber(item.soiOrderQty)),
    salesmanId: item.soiSalesmanId ?? null,
    schemeId: item.soiSchemeId,
    schemeName: item.soiSchemeName,
    remarks: item.soiRemarks,
    // The source trail names the ORDER LINE (`soi_id`), not the order: that is
    // what "Cancel on Order" addresses, and what the server re-derives
    // fulfilment from.
    srcDocType: source.docType,
    srcDocId: item.soiId,
    srcDocYear: source.accYear,
    srcDocRefno: source.refno,
    srcDocLineNo: item.soiLineNo,
    // What the order actually ORDERED, for the server's own arithmetic.
    srcItemQty: ordered,
    // `orderQty` holds what is still PENDING, and the cell is read-only: a cap
    // the operator can raise by hand is no cap at all (§7.3).
    orderQty: billQty,
    orderQtyLocked: true,
    source: {
      pendingQty: pending,
      lineStatus: item.soiLineStatus ?? "PENDING",
    },
    // No batch columns on `sale_order_item` — a schema gap, not a bug here.
    stockGateResolved: false,
  };
}

export function importOrder(draft: SaleBillDraft, payload: SaleOrderPayload): ImportOutcome {
  const source: BillSourceTrail = {
    docType: BILL_SOURCE_DOC_TYPES[1],
    docId: payload.soId,
    accYear: payload.soAccYear,
    refno: payload.soOrderRefno,
    date: toDateInput(payload.soOrderDate) || null,
  };
  const items = (payload.items ?? []).filter((item) => item.soiIsDeleted !== true);
  // A line with nothing pending is SKIPPED and counted — it has already been
  // billed or written off, and importing it would bill the same goods twice.
  const billable = items.filter((item) => toNumber(item.soiPendingQty) > 0);
  const lines = billable.map((item) => billLineFromOrderItem(item, source));
  const skipped = items.length - billable.length;

  const painted = paintCommon(draft, source, {
    custId: payload.soCustId,
    custName: payload.soCustName,
    custAddr: payload.soCustAddr,
    custPlace: payload.soCustPlace,
    custPhone: payload.soCustPhone,
    custGstin: payload.soCustGstin,
    custGstType: payload.soCustGstType,
    custStcd: payload.soCustStcd,
    posStcd: payload.soPosStcd,
    stateName: payload.soStateName,
    priceLevel: payload.soPriceLevel,
    hasFreight: payload.soHasFreight === true,
    hasLoad: payload.soHasLoad === true,
    hasUnload: payload.soHasUnload === true,
    hasPromo: payload.soHasPromo === true,
    terms: {
      remarks: payload.soRemarks ?? "",
      paymentTerms: payload.soPaymentTerms ?? "",
      deliveryTerms: payload.soDeliveryTerms ?? "",
      termsConditions: payload.soTermsConditions ?? "",
    },
    freightCalcType: payload.soFreightCalcType ?? "",
    loadingCalcType: payload.soLoadingCalcType ?? "",
    discAlterBase: payload.soDiscAlterBase === true,
  });

  const notes: string[] = [];
  if (skipped > 0) {
    notes.push(
      `${skipped} line${skipped === 1 ? "" : "s"} had nothing left to bill and ${skipped === 1 ? "was" : "were"} skipped.`,
    );
  }
  if (lines.length > 0) {
    notes.push("Quantities are the order's PENDING figures and are capped there.");
  }

  return {
    draft: { ...painted, lines, charges: freshChargeGrid() },
    imported: lines.length,
    skipped,
    note: notes.length > 0 ? notes.join(" ") : null,
  };
}

/**
 * Which of the customer's open credits THIS order raised, pre-filled at their
 * full pending amount (§10).
 *
 * An order's advance is held against the order, so importing it should offer
 * that advance back without the operator hunting for it. Matched on the credit's
 * `srcDocId` — and read in the SOURCE document's accounting year, which is why
 * the open-credits endpoint takes no year at all: a March advance really does
 * settle an April invoice.
 */
export function creditsRaisedBy(
  credits: SaleBillDraft["openCredits"],
  orderId: string,
): SaleBillDraft["adjustments"] {
  return credits
    .filter((credit) => credit.srcDocId === orderId && credit.pendingAmount > 0)
    .map((credit, index) => ({
      key: `adj-import-${index}-${credit.billId}`,
      credit,
      amount: credit.pendingAmount,
    }));
}
