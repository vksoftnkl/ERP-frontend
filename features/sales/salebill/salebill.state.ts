/**
 * Sale Bill Entry — the draft, its factories and its state transitions. Pure:
 * no React, no Redux, no API, no clock except through the arguments it is
 * handed.
 *
 * Everything the quotation already states once is imported, not restated: the
 * customer snapshot, the item-price fill, the charge-row snapshot, the
 * place-of-supply rule and the price-level clamp are the same rules on all three
 * sales screens. What lives here is what the BILL adds.
 *
 * The reducer that drives these lives in `@/store/slices/saleBillSlice`.
 */
import type { VoucherPolicy } from "@/domain/pricing";
import {
  clampPriceLevel,
  createDraftLine as createQuotationDraftLine,
  applyItemPrice as applyQuotationItemPrice,
  emptyCustomer,
  resolveLocalSale,
  seedDocumentPolicy,
} from "@/features/sales/quotation/quotation.state";
import type {
  CustomerSnapshot,
  ItemPriceLookupPayload,
} from "@/features/sales/quotation/quotation.types";
import { addDays, daysBetween, todayIso } from "@/features/sales/quotation/quotation.utils";
import {
  DEFAULT_BILL_DOC_TYPE,
  DEFAULT_BILL_STATUS,
  DEFAULT_BILL_TYPE,
  DEFAULT_DUE_DAYS,
  DEFAULT_PAY_STATUS,
} from "./salebill.constants";
import type {
  BillPeople,
  BillSettlement,
  SaleBillDraft,
  SaleBillDraftLine,
  SaleBillHeader,
  SaleBillTerms,
} from "./salebill.types";

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

/**
 * `sb_bill_datetime` as the counter's clock reads it, to the second, in LOCAL
 * time — not `toISOString()`, which would stamp a 09:30 bill as 04:00Z and make
 * every counter's day boundary depend on the reader's timezone.
 *
 * Taken once when a bill is started and left alone: the operator keys the date,
 * never the time.
 */
export function nowStamp(at: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  );
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function emptyPeople(): BillPeople {
  return {
    salesmanId: null,
    salesmanName: "",
    agentId: null,
    agentName: "",
    driverId: null,
    driverName: "",
    loadmanId: null,
    loadmanName: "",
    packedId: null,
    packedName: "",
    supervisorId: null,
    supervisorName: "",
    vehicleId: null,
    vehicleNo: "",
  };
}

export function emptySettlement(): BillSettlement {
  return {
    tenderAmt: 0,
    surchargeAmt: 0,
    creditAmt: 0,
    adjustedAmt: 0,
    refundAmt: 0,
    payStatus: DEFAULT_PAY_STATUS,
  };
}

export function emptyBillHeader(billDate: string, billDatetime: string): SaleBillHeader {
  return {
    usrRefno: "",
    billDate,
    billDatetime,
    docType: DEFAULT_BILL_DOC_TYPE,
    billType: DEFAULT_BILL_TYPE,
    // A CASH bill has no due period at all; both stay zeroed until the term is
    // switched, at which point the customer master's own credit days seed them.
    dueDays: DEFAULT_DUE_DAYS,
    dueDate: "",
    categoryId: null,
    contactPerson: "",
    contactNo: "",
    people: emptyPeople(),
    // Seeded from the company on mount (`companyStateSet`), not from a constant:
    // the default place of supply is where the COMPANY is, and hard-coding
    // 33 / Tamil Nadu puts every other state's first bill on the wrong tax.
    posStateCode: "",
    posStateName: "",
    hasFreight: false,
    hasLoad: false,
    hasUnload: false,
    hasPromo: false,
    hasComm: false,
    hasLoyalty: false,
    priceLevel: 1,
  };
}

export function emptyBillTerms(): SaleBillTerms {
  return { remarks: "", paymentTerms: "", deliveryTerms: "", termsConditions: "" };
}

export type BillDraftContext = {
  companyId: string;
  branchId: string;
  accYear: string;
  companyStateCode: string;
  companyStateName?: string;
  billDate?: string;
  billDatetime?: string;
  policy?: Partial<VoucherPolicy>;
};

export function createBillDraft(context: BillDraftContext): SaleBillDraft {
  const billDate = context.billDate || todayIso();
  const companyStateCode = context.companyStateCode ?? "";
  const companyStateName = context.companyStateName ?? "";
  return {
    mode: "entry",
    pricing: "live",
    isDirty: false,
    companyId: context.companyId,
    branchId: context.branchId,
    accYear: context.accYear,
    companyStateCode,
    companyStateName,
    docId: null,
    billSlno: "",
    billRefno: "",
    status: DEFAULT_BILL_STATUS,
    versionNo: 0,
    isNewEntry: true,
    isDeleted: false,
    policy: seedDocumentPolicy(context.policy),
    customer: emptyCustomer(),
    header: {
      ...emptyBillHeader(billDate, context.billDatetime || nowStamp()),
      posStateCode: companyStateCode,
      posStateName: companyStateName,
    },
    terms: emptyBillTerms(),
    lines: [],
    charges: [],
    // A document with no place of supply yet is local until told otherwise —
    // the overwhelming majority of counter sales are, and an IGST default would
    // mis-tax every one of them in the gap before the company state arrives.
    isLocalSale: resolveLocalSale(companyStateCode, companyStateCode, true),
    freightBands: [],
    storedPricing: null,
    source: null,
    tenders: [],
    adjustments: [],
    adjustmentsFrom: "bill",
    adjustmentsTouched: false,
    openCredits: [],
    settlement: emptySettlement(),
    partyCredit: null,
    holdId: null,
    holdNo: "",
  };
}

/** A blank bill line: the quotation's blank line plus the bill-only columns. */
export function createBillDraftLine(
  overrides: Partial<SaleBillDraftLine> = {},
): SaleBillDraftLine {
  return {
    ...createQuotationDraftLine(),
    sbiId: null,
    stockId: null,
    serialNo: null,
    srcDocType: null,
    srcDocYear: null,
    srcDocRefno: null,
    srcDocLineNo: null,
    srcItemQty: null,
    orderQtyLocked: false,
    // A blank row has no item, so there is nothing to judge and nothing to
    // resolve. It flips true the moment the price lookup fills the row.
    stockGateResolved: false,
    ...overrides,
  };
}

/**
 * Fill a line from `/master-lookups/item-price`.
 *
 * The quotation's own mapper does the whole job — the bill adds nothing to the
 * fill itself — but it also answers the ONE question the bill has that the
 * quotation does not: the negative-stock gate (§7.2). `allow_negative_stock` and
 * `stock` both come back on this payload, which is precisely why re-resolving
 * through the lookup is the fix for the Qt screen's three incompatible
 * behaviours: the flag is the item's and the stock figure is today's.
 *
 * Anything that fills a line WITHOUT going through here (a load, an import) must
 * leave `stockGateResolved` false, so the gate reports itself unavailable rather
 * than passing or failing on a month-old snapshot.
 */
export function applyBillItemPrice(
  line: SaleBillDraftLine,
  lookup: ItemPriceLookupPayload,
  extra: { unitName?: string; unitId?: string } = {},
): SaleBillDraftLine {
  return {
    ...line,
    ...applyQuotationItemPrice(line, lookup, extra),
    stockGateResolved: true,
  };
}

// ---------------------------------------------------------------------------
// Header transitions
// ---------------------------------------------------------------------------

/**
 * `dueDate` and `dueDays` are two views of one period counted from `billDate` —
 * the quotation's validity pair under another name. Editing the days (or moving
 * the bill date) re-derives the date; editing the date re-derives the days,
 * floored at 0.
 *
 * A `dueDate` before `billDate` is deliberately left standing as keyed and
 * refused at save: silently "correcting" the operator's date is worse than
 * telling them.
 */
function syncDuePair(
  header: SaleBillHeader,
  edited: "billDate" | "dueDate" | "dueDays",
): SaleBillHeader {
  if (edited === "dueDate") {
    const days = header.dueDate ? daysBetween(header.billDate, header.dueDate) : 0;
    return { ...header, dueDays: days === null ? header.dueDays : Math.max(0, days) };
  }
  if (!header.dueDays || header.dueDays <= 0) {
    // Moving the bill date of a bill with no credit period says nothing about
    // the due date, so it is left alone; clearing the DAYS clears the date.
    return edited === "billDate" ? header : { ...header, dueDate: "" };
  }
  const dueDate = addDays(header.billDate, header.dueDays);
  return dueDate ? { ...header, dueDate } : header;
}

/**
 * One header field, with the fields that are not independent of it kept in step.
 *
 * Switching the term to CASH clears the due period rather than leaving it
 * standing: a cash bill that still names a due date would print one, and the
 * payload sends due days / due date only for CREDIT anyway — so a stale pair is
 * a thing on screen that nothing downstream agrees exists.
 */
export function applyBillHeaderField(
  header: SaleBillHeader,
  field: keyof SaleBillHeader,
  value: string | number | boolean,
): SaleBillHeader {
  const next = { ...header, [field]: value } as SaleBillHeader;
  if (field === "billDate" || field === "dueDate" || field === "dueDays") {
    return syncDuePair(next, field);
  }
  if (field === "priceLevel") {
    return { ...next, priceLevel: clampPriceLevel(Number(value)) };
  }
  if (field === "billType" && value === "CASH") {
    return { ...next, dueDays: 0, dueDate: "" };
  }
  return next;
}

/**
 * The credit period a customer brings with them.
 *
 * Applied only when the bill is already on CREDIT terms, and only when the
 * master actually states a period: seeding a due date onto a cash sale would
 * print one, and overwriting a period the operator has keyed would undo their
 * decision. `debit_days` of 0 means "no stated period", not "due today".
 */
export function seedCreditPeriod(
  header: SaleBillHeader,
  customer: CustomerSnapshot,
): SaleBillHeader {
  if (header.billType !== "CREDIT" || customer.debitDays <= 0 || header.dueDays > 0) {
    return header;
  }
  return applyBillHeaderField(header, "dueDays", customer.debitDays);
}

// ---------------------------------------------------------------------------
// The customer lock (§4.3)
// ---------------------------------------------------------------------------

/**
 * Whether changing the customer would throw away money that has already been
 * accounted for.
 *
 * This is the question `confirmCustomerChange` asks. It is an explicit guard,
 * NOT a `useEffect` that reacts to a customer id changing — the difference is
 * whether the operator is asked *before* their settlement disappears or after.
 */
export function customerChangeCosts(draft: SaleBillDraft): {
  tendered: number;
  adjusted: number;
  blocked: boolean;
} {
  // Read off the ROWS, not off the roll-ups: `settlement` is a display figure
  // written by `updateSettlementDisplay`, and a draft restored from a hold or an
  // autosave carries its rows before anything has recomputed the strip.
  const tendered = draft.tenders.reduce((total, row) => total + Math.max(0, row.keyed), 0);
  const adjusted = draft.adjustments.reduce((total, row) => total + Math.max(0, row.amount), 0);
  return { tendered, adjusted, blocked: tendered > 0 || adjusted > 0 };
}

/**
 * Everything a customer change invalidates, cleared in one place.
 *
 * The settlement goes because it was taken from — or on account of — the party
 * that is being replaced, and the adjustments go with it because a credit note
 * belongs to the customer who holds it. The credit panel goes because it is an
 * answer about a party this bill no longer names.
 */
export function clearCustomerBoundState(draft: SaleBillDraft): SaleBillDraft {
  return {
    ...draft,
    tenders: [],
    adjustments: [],
    adjustmentsFrom: "bill",
    // Cleared, not reset: the operator is about to be offered a different
    // party's credits, and this bill has not handled THOSE yet.
    adjustmentsTouched: false,
    // The offered list goes too: it was an answer about the party being
    // replaced, and leaving it would let the panel adjust another customer's
    // credit against this bill.
    openCredits: [],
    settlement: emptySettlement(),
    partyCredit: null,
    freightBands: [],
  };
}

// ---------------------------------------------------------------------------
// Copy as new
// ---------------------------------------------------------------------------

/**
 * "Copy as new" — a fresh, unsaved bill pre-filled from the one on screen.
 *
 * Only the server-owned identity is stripped, plus everything that belongs to
 * the ORIGINAL transaction rather than to a fresh promise: the number, the
 * status, the source trail (header and per line), the money that was taken, and
 * the hold link. A copy that kept the source trail would make one order look
 * billed twice; one that kept the settlement would claim money nobody paid.
 *
 * The bill date is reset to today, the timestamp re-taken, and the due period
 * re-derived from the new date exactly as an operator edit to the date would.
 */
export function copyBillDraftAsNew(
  draft: SaleBillDraft,
  billDate: string,
  billDatetime: string = nowStamp(),
): SaleBillDraft {
  return {
    ...draft,
    mode: "entry",
    pricing: "live",
    isDirty: true,
    docId: null,
    billSlno: "",
    billRefno: "",
    status: DEFAULT_BILL_STATUS,
    versionNo: 0,
    isNewEntry: true,
    isDeleted: false,
    header: {
      ...applyBillHeaderField(draft.header, "billDate", billDate),
      billDatetime,
    },
    source: null,
    lines: draft.lines.map((line) => ({
      ...line,
      sbiId: null,
      srcDocType: null,
      srcDocId: null,
      srcDocYear: null,
      srcDocRefno: null,
      srcDocLineNo: null,
      srcItemQty: null,
      orderQtyLocked: false,
      source: undefined,
    })),
    charges: draft.charges.map((row) => ({ ...row, cdId: null })),
    tenders: [],
    adjustments: [],
    adjustmentsFrom: "bill",
    adjustmentsTouched: false,
    openCredits: draft.openCredits,
    settlement: emptySettlement(),
    holdId: null,
    holdNo: "",
    storedPricing: null,
  };
}
