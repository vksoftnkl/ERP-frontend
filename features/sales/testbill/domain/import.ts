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
import { money } from "@/domain/pricing";
import { chargeFromPayload } from "@/features/sales/quotation/quotation.payload";
import { clampPriceLevel } from "@/features/sales/quotation/quotation.state";
import type {
  QuotationChargePayload,
  QuotationListRow,
  QuotationPayload,
} from "@/features/sales/quotation/quotation.types";
import type { OpenSourceDoc, OpenSourceLine } from "@/features/sales/testbill/api/bills";
import { carryFromOrderCharge } from "@/features/sales/testbill/domain/carry";
import { toDateInput, toNumber } from "@/features/sales/quotation/quotation.utils";
import type {
  SaleOrderItemPayload,
  SaleOrderPayload,
} from "@/features/sales/sale-order/sale-order.types";
import { BILL_SOURCE_DOC_TYPES } from "@/features/sales/testbill/constants";
import { createBillDraftLine } from "@/features/sales/testbill/state/factories";
import type {
  BillChargeRow,
  BillSourceSummary,
  BillSourceTrail,
  SaleBillDraft,
  SaleBillDraftLine,
} from "@/features/sales/testbill/types";

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
    /** Element 1 of the source's `uuid[]` (§7.9); null leaves the header's. */
    salesmanId: string | null;
    agentId: string | null;
    packedId: string | null;
    /** The term the source dictates, or null to leave the header's (§13.1: a quotation says nothing). */
    billType: "CASH" | "CREDIT" | null;
    charges: BillChargeRow[];
    chip: BillSourceSummary;
  },
): SaleBillDraft {
  const posStateCode = (values.posStcd ?? "").trim() || (values.custStcd ?? "").trim();
  return {
    ...draft,
    isDirty: true,
    pricing: "live",
    source,
    // The chip (§13.6): every source document once, first-seen order.
    sources: [values.chip],
    // The source's charges, ids cleared — the bill writes its own
    // `charge_detail` (§13.1, §13.2). An order's rows carry their carry facts.
    charges: values.charges,
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
      // Term (§13.2): CREDIT iff the order says so; a quotation says nothing.
      // The due days re-derive when the customer lookups land.
      billType: values.billType ?? draft.header.billType,
      dueDays: values.billType === "CASH" ? 0 : draft.header.dueDays,
      dueDate: values.billType === "CASH" ? "" : draft.header.dueDate,
      people: {
        ...draft.header.people,
        salesmanId: values.salesmanId ?? draft.header.people.salesmanId,
        salesmanName: values.salesmanId && values.salesmanId !== draft.header.people.salesmanId ? "" : draft.header.people.salesmanName,
        agentId: values.agentId ?? draft.header.people.agentId,
        agentName: values.agentId && values.agentId !== draft.header.people.agentId ? "" : draft.header.people.agentName,
        packedId: values.packedId ?? draft.header.people.packedId,
        packedName: values.packedId && values.packedId !== draft.header.people.packedId ? "" : draft.header.people.packedName,
      },
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
    // The trail is per line (§13.5): the DOCUMENT on `srcDocId`, the LINE on
    // `srcItemId` — the server keys its guards and draw-down on the latter.
    srcDocType: source.docType,
    srcDocId: source.docId,
    srcItemId: item.sqiId,
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
    salesmanId: payload.sqSalesmanId ?? null,
    agentId: payload.sqAgentId ?? null,
    packedId: null,
    // Term is not taken from a quotation (§13.1).
    billType: null,
    charges: carriedCharges(payload.charges ?? [], null),
    chip: {
      kind: "QUOTATION",
      docId: source.docId,
      accYear: source.accYear ?? "",
      refno: source.refno,
      date: source.date,
      lines: lines.length,
      takenQty: lines.reduce((sum, line) => sum + line.billQty, 0),
      openQtyAfter: null,
    },
  });

  return {
    draft: { ...painted, lines },
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
 * The source's charges, ready for the bill (§13.1, §13.2, §12.4).
 *
 * Every row rides across with its id CLEARED — the bill inserts its own
 * `txn_charge_detail` rows and must never claim the source's. An ORDER's rows
 * are stamped with their carry facts first (`srcCdId` = the order's `cdId`,
 * the order's year, basis PRORATA, the order amount), which is what lets
 * `/validate` propose this bill's share and the payload emit the carry keys.
 * A quotation's rows carry nothing: a quotation's charge is a quote, not a
 * balance to draw down.
 *
 * Nothing is dropped and nothing is re-seeded: a load or import REPLACES the
 * charges, so the auto-apply seed never survives onto an imported bill (§12.2).
 */
export function carriedCharges(
  source: readonly QuotationChargePayload[],
  orderAccYear: string | null,
): BillChargeRow[] {
  return source
    .filter((row) => Boolean(row.cdChgId))
    .map((row) => {
      const carry = orderAccYear
        ? carryFromOrderCharge({ cdId: row.cdId, cdAmount: toNumber(row.cdAmount) }, orderAccYear)
        : null;
      return {
        ...chargeFromPayload(row),
        cdId: null,
        ...(carry ? { carry } : {}),
      };
    });
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
    // The trail is per line (§13.5): the ORDER on `srcDocId`, the ORDER LINE
    // (`soi_id`) on `srcItemId`. The line id is what "Cancel on Order"
    // addresses and what the server draws fulfilment down by; the Qt model once
    // held it in `SrcDocId`, and that is not ported.
    srcDocType: source.docType,
    srcDocId: source.docId,
    srcItemId: item.soiId,
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
    salesmanId: payload.soSalesmanId?.[0] ?? null,
    agentId: payload.soAgentId ?? null,
    packedId: payload.soPackedId?.[0] ?? null,
    // Term = CREDIT iff `soOrderType === 'CREDIT'` (§13.2).
    billType: (payload.soOrderType ?? "").trim().toUpperCase() === "CREDIT" ? "CREDIT" : "CASH",
    // Populate, STAMP THE CARRY FACTS, clear the ids (§12.4, §13.2).
    charges: carriedCharges(payload.charges ?? [], payload.soAccYear),
    chip: {
      kind: "ORDER",
      docId: source.docId,
      accYear: source.accYear ?? "",
      refno: source.refno,
      date: source.date,
      lines: lines.length,
      takenQty: lines.reduce((sum, line) => sum + line.billQty, 0),
      openQtyAfter: null,
    },
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
    draft: { ...painted, lines },
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

// ---------------------------------------------------------------------------
// Open sources — append, never replace (§13.3, §13.4)
// ---------------------------------------------------------------------------

/** What the dialog hands back: one picked line and how much of it to take. */
export type OpenSourcePick = {
  doc: OpenSourceDoc;
  line: OpenSourceLine;
  takeQty: number;
};

export type AppendOutcome = {
  draft: SaleBillDraft;
  /** New lines, still to be priced through the lookup by the caller. */
  newLineKeys: string[];
  /** Existing lines topped up (same source line already on the bill). */
  toppedUp: number;
  /** Lines whose top-up hit the order cap and were clamped. */
  clamped: number;
};

const SOURCE_DOC_TYPE_OF: Record<"DC" | "ORDER", "DELIVERY_CHALLAN" | "SALES_ORDER"> = {
  DC: "DELIVERY_CHALLAN",
  ORDER: "SALES_ORDER",
};

/**
 * Put the picked lines onto the bill (§13.4):
 *
 *  - **same source line already on the bill** → top up to
 *    `min(have + take, orderQty)` ("a double-bill waiting to happen");
 *  - **new line** → `srcDocType`, `srcDocId`, `srcItemId = lineId`,
 *    `srcLineNo = lineNo`, `srcDocYear`, `orderQty = openQty` (the cap),
 *    `billQty = takeQty`, `rate`, `taxPerc`, level = the document's; the
 *    lookup fills the rest and KEEPS the source rate (§28 Q5).
 *
 * The header trail is set only by the first document; every document's refno
 * is kept for the chip. Free lines are left alone.
 */
export function appendOpenSourceLines(
  draft: SaleBillDraft,
  kind: "DC" | "ORDER",
  picks: readonly OpenSourcePick[],
): AppendOutcome {
  const docType = SOURCE_DOC_TYPE_OF[kind];
  const lines = draft.lines.slice();
  const newLineKeys: string[] = [];
  let toppedUp = 0;
  let clamped = 0;
  const chips = draft.sources.slice();
  let source = draft.source;

  for (const pick of picks) {
    const take = money(Math.max(0, pick.takeQty));
    if (take <= 0) {
      continue;
    }
    const existingIndex = lines.findIndex(
      (line) => line.itemId && !line.isFree && line.srcItemId === pick.line.lineId && line.srcDocId === pick.doc.docId,
    );
    if (existingIndex >= 0) {
      const have = lines[existingIndex];
      const cap = have.orderQty > 0 ? have.orderQty : Number.POSITIVE_INFINITY;
      const wanted = money(have.billQty + take);
      const next = Math.min(wanted, cap);
      if (next < wanted) {
        clamped += 1;
      }
      lines[existingIndex] = { ...have, billQty: next };
      toppedUp += 1;
    } else {
      const line = createBillDraftLine({
        priceLevel: draft.header.priceLevel,
        itemId: pick.line.itemId,
        itemUnitId: pick.line.unitId ?? "",
        itemName: pick.line.itemName ?? "",
        unitName: pick.line.unitName ?? "",
        hsnCode: pick.line.hsnCode,
        godownId: pick.line.godownId,
        batchNo: pick.line.batchNo,
        rate: money(pick.line.rate),
        actualPrice: money(pick.line.rate),
        gstPerc: pick.line.taxPerc,
        billQty: take,
        orderQty: money(pick.line.openQty),
        orderQtyLocked: true,
        srcDocType: docType,
        srcDocId: pick.doc.docId,
        srcItemId: pick.line.lineId,
        srcDocLineNo: pick.line.lineNo,
        srcDocYear: pick.doc.accYear,
        srcDocRefno: pick.doc.refno,
        srcItemQty: money(pick.line.docQty),
        stockGateResolved: false,
      });
      // Before the trailing blank row, never after it.
      const last = lines.length - 1;
      const at = last >= 0 && !lines[last].itemId ? last : lines.length;
      lines.splice(at, 0, line);
      newLineKeys.push(line.key);
    }
    if (!source) {
      source = {
        docType,
        docId: pick.doc.docId,
        accYear: pick.doc.accYear,
        refno: pick.doc.refno,
        date: pick.doc.date,
      };
    }
    const chip = chips.find((row) => row.docId === pick.doc.docId);
    if (chip) {
      chip.lines += existingIndex >= 0 ? 0 : 1;
      chip.takenQty = money(chip.takenQty + take);
    } else {
      chips.push({
        kind,
        docId: pick.doc.docId,
        accYear: pick.doc.accYear,
        refno: pick.doc.refno,
        date: pick.doc.date,
        lines: existingIndex >= 0 ? 0 : 1,
        takenQty: take,
        openQtyAfter: null,
      });
    }
  }

  return {
    draft: { ...draft, lines, source, sources: chips, isDirty: true, pricing: "live" },
    newLineKeys,
    toppedUp,
    clamped,
  };
}

/** "N line(s) ticked · goods value X" — the dialog's summary line (§13.4). */
export function openSourcesSummary(picks: readonly OpenSourcePick[]): string {
  const ticked = picks.filter((pick) => pick.takeQty > 0);
  const value = money(ticked.reduce((sum, pick) => sum + pick.takeQty * pick.line.rate, 0));
  return `${ticked.length} line${ticked.length === 1 ? "" : "s"} ticked · goods value ${value.toFixed(2)}`;
}
