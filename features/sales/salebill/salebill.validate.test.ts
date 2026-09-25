/**
 * Sale Bill Entry — the save gate (§14).
 *
 * The order matters as much as the rules: the FIRST failure wins, so the
 * operator is sent to one field rather than handed a list. Every message names
 * the row number.
 *
 * Two of these are the bill's own and neither is arithmetic — the negative-stock
 * gate and the order cap — and the first of them is the one the Qt screen has
 * three incompatible versions of.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument, type DocumentPricing } from "@/domain/pricing";
import { createBillDraft, createBillDraftLine } from "./salebill.state";
import {
  advanceAdjusted,
  noteAdjusted,
  settledAmountOf,
  stockGateOf,
  totalAdjusted,
  validateAdjustments,
  validateSaveInputs,
} from "./salebill.validate";
import type { AdjustableCredit, SaleBillDraft, SaleBillDraftLine } from "./salebill.types";

const CONTEXT = {
  companyId: "c1",
  branchId: "b1",
  accYear: "2026-2027",
  companyStateCode: "33",
  companyStateName: "Tamil Nadu",
  billDate: "2026-09-12",
};

function line(overrides: Partial<SaleBillDraftLine> = {}): SaleBillDraftLine {
  return createBillDraftLine({
    itemId: "i1",
    itemName: "TEAK PLANK",
    itemUnitId: "u1",
    godownId: "g1",
    billQty: 2,
    rate: 100,
    gstPerc: 18,
    cgstPerc: 9,
    sgstPerc: 9,
    igstPerc: 18,
    stockQty: 10,
    stockGateResolved: true,
    ...overrides,
  });
}

/** A saveable bill: a customer, one priced line, and nothing owing. */
function billable(overrides: Partial<SaleBillDraft> = {}): SaleBillDraft {
  const base = createBillDraft(CONTEXT);
  return {
    ...base,
    customer: { ...base.customer, custId: "cust-1", name: "ACME" },
    lines: [line()],
    ...overrides,
  };
}

function priceOf(draft: SaleBillDraft): DocumentPricing {
  return recalcDocument(draft.lines, draft.charges, draft.policy, {
    isLocalSale: draft.isLocalSale,
    hasFreight: draft.header.hasFreight,
    hasLoad: draft.header.hasLoad,
    hasUnload: draft.header.hasUnload,
  });
}

/** Settle a cash bill in full, so the gate reaches whatever is being tested. */
function settled(draft: SaleBillDraft): SaleBillDraft {
  const bill = priceOf(draft).totals.bill;
  return {
    ...draft,
    tenders: [
      {
        key: "t1",
        tdId: null,
        tenderId: "tnd-1",
        tenderTypeId: 1,
        typeCode: "CASH",
        tenderName: "Cash",
        tenderLedgerId: null,
        settleLedgerId: null,
        surchargeLedgerId: null,
        surchargePerc: 0,
        surchargeFlat: 0,
        settlementDays: 0,
        minAmount: 0,
        maxAmount: null,
        conversionRate: 1,
        editSurcharge: false,
        allowChange: true,
        needsRef: false,
        hotkey: null,
        keyed: bill,
        settleStatus: "NA",
        refNo: null,
        authCode: null,
        bankName: null,
        cardDigits: null,
        instrumentDate: null,
        notes: null,
      },
    ],
  };
}

function check(draft: SaleBillDraft, context = {}) {
  return validateSaveInputs(draft, priceOf(draft), context);
}

// ---------------------------------------------------------------------------
// The negative-stock gate (§7.2)
// ---------------------------------------------------------------------------

describe("stockGateOf — three answers, and the third is the one Qt cannot give", () => {
  it("passes when there is enough stock", () => {
    expect(stockGateOf(line({ billQty: 2, stockQty: 10 }))).toBe("pass");
  });

  it("fails when there is not, and the item forbids negative stock", () => {
    expect(stockGateOf(line({ billQty: 20, stockQty: 10 }))).toBe("fail");
  });

  it("passes when the item allows negative stock", () => {
    expect(stockGateOf(line({ billQty: 20, stockQty: 10, allowNegative: true }))).toBe("pass");
  });

  it("passes a service line — there is no stock to draw down", () => {
    expect(stockGateOf(line({ billQty: 20, stockQty: 0, isService: true }))).toBe("pass");
  });

  it("is UNAVAILABLE on a line whose lookup has not been re-run", () => {
    // A loaded or imported line. Qt hard-codes AllowNegative to "Y" here (gate
    // silently OFF) on its own load path and on the order import, and leaves it
    // empty on the quotation import (gate ON against a month-old stock
    // snapshot) — three behaviours for one rule. None is ported: the honest
    // answer is that the gate cannot be judged.
    expect(stockGateOf(line({ stockGateResolved: false }))).toBe("unavailable");
  });

  it("is UNAVAILABLE when the lookup answered with no stock figure at all", () => {
    expect(stockGateOf(line({ stockQty: null }))).toBe("unavailable");
  });

  it("has no opinion about a row with no quantity on it", () => {
    expect(stockGateOf(line({ billQty: 0, stockGateResolved: false }))).toBe("pass");
  });
});

// ---------------------------------------------------------------------------
// The gate, in order
// ---------------------------------------------------------------------------

describe("validateSaveInputs — in the plan's order, first failure wins", () => {
  it("wants a customer name before anything else", () => {
    const draft = createBillDraft(CONTEXT);
    // No customer AND no lines: the customer is what it complains about.
    expect(check(draft)?.field).toBe("sale-bill-customer");
    expect(check(draft)?.message).toBe("Select a customer.");
  });

  it("lets a walk-in with no master record through the customer gate", () => {
    // A name is all this screen asks for — it no longer insists on `sbCustId`.
    const base = createBillDraft(CONTEXT);
    const named = { ...base, customer: { ...base.customer, name: "WALK IN" } };
    expect(check(named)?.field).not.toBe("sale-bill-customer");
  });

  it("wants at least one item row", () => {
    const base = billable({ lines: [] });
    expect(check(base)?.field).toBe("items");
  });

  it("refuses a bill dated into another accounting year", () => {
    // `sb_acc_year` is immutable after create, half the primary key AND the
    // voucher sequence's period key, so a bill dated across 1 April cannot be
    // filed under this year. Refused rather than silently re-tenanted.
    const draft = billable();
    draft.header = { ...draft.header, billDate: "2027-05-01" };
    expect(check(draft)?.field).toBe("sale-bill-date");
  });

  it("refuses a line with no quantity, naming the row", () => {
    const violation = check(billable({ lines: [line({ billQty: 0 })] }));
    expect(violation?.message).toContain("Row 1");
    expect(violation?.message).toContain("Quantity cannot be zero");
  });

  it("refuses a line with no godown BEFORE the server has to", () => {
    // `sbi_godown_id` is NOT NULL and `@RequiredUuid`. The item lookup fills it
    // but can legitimately answer null, and there is no godown picker yet — so
    // this is the difference between a clear refusal and an opaque 400 after the
    // operator has pressed save on a settled bill.
    const violation = check(billable({ lines: [line({ godownId: null })] }));
    expect(violation?.message).toContain("godown");
  });

  it("refuses a rate below the minimum selling price", () => {
    const violation = check(billable({ lines: [line({ rate: 50, minPrice: 80 })] }));
    expect(violation?.field).toBe("rate");
    expect(violation?.message).toContain("minimum selling price");
  });

  it("refuses a rate above MRP, unless the operator may skip it", () => {
    // Settled, so that waiving the MRP gate reaches the END of the run rather
    // than tripping over the settlement gate two rules later.
    const draft = settled(billable({ lines: [line({ rate: 400, mrp: 320 })] }));
    expect(check(draft)?.message).toContain("cannot exceed MRP");
    expect(check(draft, { skipMrp: true })).toBeNull();
  });

  it("refuses a line that would go negative on an item that forbids it", () => {
    const violation = check(billable({ lines: [line({ billQty: 20, stockQty: 10 })] }));
    expect(violation?.message).toContain("in stock");
    expect(violation?.confirm).toBeUndefined();
  });

  it("ASKS rather than refuses when the stock position is unknown", () => {
    // Not a refusal — a question. The operator may know the stock is there;
    // what they may not do is be told nothing.
    const violation = check(billable({ lines: [line({ stockGateResolved: false })] }));
    expect(violation?.confirm).toBe(true);
    expect(violation?.message).toContain("could not be established");
  });

  it("refuses over-billing an order line, and lets the setting waive it", () => {
    const draft = settled(
      billable({ lines: [line({ billQty: 5, orderQty: 2, orderQtyLocked: true })] }),
    );
    expect(check(draft)?.message).toContain("against an order quantity");
    expect(check(draft, { allowBillOverOrderQty: true })).toBeNull();
  });
});

describe("the credit term (§14.5)", () => {
  function creditBill(overrides: Partial<SaleBillDraft["header"]> = {}): SaleBillDraft {
    const base = billable();
    return {
      ...base,
      customer: { ...base.customer, debitAllowed: true },
      header: { ...base.header, billType: "CREDIT", ...overrides },
    };
  }

  it("accepts a credit bill with a period, and needs no settlement for it", () => {
    // The party debit is what stays open; demanding cover for it would make the
    // term meaningless.
    expect(check(creditBill({ dueDays: 30, dueDate: "2026-10-12" }))).toBeNull();
  });

  it("refuses a due date before the bill date", () => {
    const violation = check(creditBill({ dueDays: 1, dueDate: "2026-09-01" }));
    expect(violation?.field).toBe("sale-bill-due-date");
  });

  it("REFUSES a cash-only customer on credit — §28 Q1, 'credit anyway' is not offered", () => {
    const base = billable();
    const draft: SaleBillDraft = {
      ...base,
      customer: { ...base.customer, debitAllowed: false },
      header: { ...base.header, billType: "CREDIT", dueDays: 30, dueDate: "2026-10-12" },
    };
    const violation = check(draft);
    expect(violation?.confirm).toBeUndefined();
    expect(violation?.message).toBe("This customer is not allowed to buy on credit.");
  });

  it("wants no due days: the server derives them, and a cash-term bill sends none", () => {
    // Due days are seeded from the party's credit days (§7.6); a zero is not
    // a refusal here, `/validate` judges the term.
    expect(check(creditBill())?.field).not.toBe("sale-bill-due-days");
  });
});

describe("the credit standing (§17.3 step 8) — a confirm, never a verdict", () => {
  function overLimit(mode: "OFF" | "WARN" | "REFUSE" = "REFUSE"): SaleBillDraft {
    const base = billable();
    return {
      ...base,
      customer: { ...base.customer, debitAllowed: true },
      header: { ...base.header, billType: "CREDIT", dueDays: 30, dueDate: "2026-10-12" },
      party: {
        partyId: "cust-1",
        billDate: "2026-09-12",
        party: {
          ledId: "cust-1",
          name: "ACME",
          gstType: null,
          gstin: null,
          stateCode: "33",
          isWalkIn: false,
          panNo: null,
          panVerifiedOn: null,
          form60On: null,
          creditAllowed: true,
          defaultPriceLevel: 1,
          addr: null,
          place: null,
          pin: null,
          phone: null,
          areaId: null,
          areaName: null,
          distanceKm: null,
          salesmanId: null,
          salesmanName: null,
          freightCharge: false,
          loadingCharge: false,
          unloadingCharge: false,
          allowDiscount: true,
          allowPromotion: true,
          allowLoyalty: false,
        },
        credit: {
          limitAmount: 50000,
          limitBills: 10,
          creditDays: 30,
          used: 90000,
          openBills: 4,
          oldestOpenDays: 12,
          amtExceeded: true,
          billExceeded: false,
          daysExceeded: false,
          mode,
        },
        cashToday: 0,
        advances: [],
        creditNotes: [],
        loyalty: null,
        shipTo: [],
        tempCredits: [],
        openSources: { dc: 0, orders: 0 },
      },
    };
  }

  it("asks when the amount limit is breached — /validate is the authority", () => {
    const violation = check(overLimit());
    expect(violation?.confirm).toBe(true);
    expect(violation?.message).toContain("exhausted");
  });

  it("asks under WARN too: the flag is the party's, the mode is what the server will do", () => {
    expect(check(overLimit("WARN"))?.confirm).toBe(true);
  });

  it("says nothing at all when the credit check is switched off", () => {
    expect(check(overLimit("OFF"))).toBeNull();
  });

  it("says nothing before party-context has landed — there is no figure to judge", () => {
    const draft = overLimit();
    draft.party = null;
    expect(check(draft)).toBeNull();
  });
});

function creditRow(amount: number, billType: AdjustableCredit["billType"], pending = amount) {
  return {
    key: `a-${billType}-${amount}`,
    amount,
    credit: {
      billId: `abl-${billType}`,
      billAccYear: "2025-2026",
      billType,
      drCr: "CR" as const,
      docRefno: billType === "ADVANCE" ? "SO-2201" : "SR-4412",
      docDate: "2026-03-30",
      billAmount: pending,
      pendingAmount: pending,
      status: "OPEN" as const,
      srcModule: "SALES",
      srcDocType: null,
      srcDocId: null,
      srcAccYear: "2025-2026",
      narration: null,
      adjType: (billType === "ADVANCE" ? "ADVANCE_ADJUST" : "NOTE_ADJUST") as
        | "ADVANCE_ADJUST"
        | "NOTE_ADJUST",
      settlementMode: (billType === "ADVANCE" ? "ADVANCE" : "CREDIT_NOTE") as
        | "ADVANCE"
        | "CREDIT_NOTE",
    },
  };
}

describe("check 7 — settled + adjusted may not exceed the bill (§17.3)", () => {
  it("passes a cash bill nothing has been taken against: the plain route settles it in cash (§15.9)", () => {
    expect(check(billable())).toBeNull();
  });

  it("passes once the tenders cover it", () => {
    expect(check(settled(billable()))).toBeNull();
  });

  it("refuses tenders that, with the set-off, exceed the bill — unless the tender is being re-opened", () => {
    const draft = settled(billable());
    const bill = priceOf(draft).totals.bill;
    const over: SaleBillDraft = {
      ...draft,
      adjustments: [creditRow(100, "ADVANCE")],
      tenders: [{ ...draft.tenders[0], keyed: bill, allowChange: false }],
    };
    const violation = check(over);
    expect(violation?.field).toBe("sale-bill-tender");
    expect(violation?.message).toContain("Re-open settlement (F5)");
    expect(check(over, { openingTender: true })).toBeNull();
    expect(check(over, { allowExcessTender: true })).toBeNull();
  });

  it("counts an ADJUSTMENT as settlement, though it is not a tender", () => {
    // Different rows, different tables, different postings — but a credit note
    // the customer holds is money already taken.
    const draft = billable();
    const bill = priceOf(draft).totals.bill;
    const withCredit: SaleBillDraft = {
      ...draft,
      adjustments: [
        {
          key: "a1",
          amount: bill,
          credit: {
            billId: "abl-1",
            billAccYear: "2025-2026",
            billType: "SALES_RETURN",
            drCr: "CR",
            docRefno: "SR-4412",
            docDate: "2026-03-30",
            billAmount: bill,
            pendingAmount: bill,
            status: "OPEN",
            srcModule: "SALES",
            srcDocType: "SALE_RETURN",
            srcDocId: "sr-1",
            srcAccYear: "2025-2026",
            narration: null,
            adjType: "NOTE_ADJUST",
            settlementMode: "CREDIT_NOTE",
          },
        },
      ],
    };
    expect(check(withCredit)).toBeNull();
  });

  it("does not let a surcharge look like settlement", () => {
    // The surcharge is the bank's cut, not the shop's takings: it settles no
    // part of the bill, so it never counts toward `settledAmountOf`.
    const draft = billable();
    const bill = priceOf(draft).totals.bill;
    const short = settled(draft);
    short.tenders = [
      { ...short.tenders[0], keyed: bill - 10, allowChange: false, surchargePerc: 5 },
    ];
    expect(settledAmountOf(short, priceOf(short))).toBe(Math.round((bill - 10) * 100) / 100);
  });
});

describe("the salesman (§17.3 step 4) and the ledger on a charge (step 11)", () => {
  it("wants a salesman only when the branch says so", () => {
    const draft = settled(billable());
    expect(check(draft, { salesmanMandatory: true })?.message).toBe("Select a salesman.");
    expect(check(draft)).toBeNull();
  });

  it("refuses a charge row without a posting ledger", () => {
    const draft = settled(billable());
    draft.charges = [
      {
        key: "c1",
        cdId: null,
        chgId: "chg-1",
        chgName: "PACKING",
        ledgerCode: "",
        ledgerName: null,
        role: "NONE",
        method: "FIXED",
        type: "ADD",
        applyOn: "FLAT",
        beforeTax: false,
        taxApl: false,
        rate: 0,
        amount: 10,
        taxPerc: 0,
        cgstPerc: 0,
        sgstPerc: 0,
        igstPerc: 0,
        cessPerc: 0,
        hsn: null,
        taxCode: null,
        unit: null,
        qtyVal: null,
        weight: null,
        sepPost: false,
        landingCost: false,
        costAlloc: null,
        remarks: null,
        isActive: true,
      },
    ];
    expect(check(draft)?.message).toContain("has no posting ledger");
  });

  it("refuses a zero rate on a paid line, and lets free-item tax waive it", () => {
    const draft = settled(billable({ lines: [line({ rate: 0 })] }));
    expect(check(draft)?.message).toContain("Rate cannot be zero");
    expect(check(draft, { freeItemTax: true })?.message).not.toContain("Rate cannot be zero");
  });
});

describe("the charge-role gate (§17.3 step 12)", () => {
  it("refuses a bill whose items price freight but whose grid has no freight row", () => {
    // Only when the items actually carry a freight amount: a Freight tick on a
    // bill with no per-qty freight bills nothing, so nothing is missing.
    const draft = settled(billable({ lines: [line({ hasFreight: true, freightPerQty: 5 })] }));
    draft.header = { ...draft.header, hasFreight: true };
    draft.policy = { ...draft.policy, freightCalcType: "item" };
    expect(check(draft)?.field).toBe("charges");
    expect(check(draft)?.message).toContain("Freight");
  });

  it("says nothing when the calc type is manual — the operator types the charge in", () => {
    const draft = settled(billable({ lines: [line({ hasFreight: true, freightPerQty: 5 })] }));
    draft.header = { ...draft.header, hasFreight: true };
    draft.policy = { ...draft.policy, freightCalcType: "manual" };
    expect(check(draft)).toBeNull();
  });

  it("is satisfied by a charge row in that role", () => {
    const draft = settled(billable({ lines: [line({ loadingPerQty: 2 })] }));
    draft.policy = { ...draft.policy, loadingCalcType: "item" };
    draft.header = { ...draft.header, hasLoad: true };
    draft.charges = [
      {
        key: "c1",
        cdId: null,
        chgId: "chg-1",
        chgName: "COOLY",
        ledgerCode: "led-1",
        ledgerName: null,
        role: "LOADING",
        method: "FIXED",
        type: "ADD",
        applyOn: "FLAT",
        beforeTax: false,
        taxApl: false,
        rate: 0,
        amount: 0,
        taxPerc: 0,
        cgstPerc: 0,
        sgstPerc: 0,
        igstPerc: 0,
        cessPerc: 0,
        hsn: null,
        taxCode: null,
        unit: null,
        qtyVal: null,
        weight: null,
        sepPost: false,
        landingCost: false,
        costAlloc: null,
        remarks: null,
        isActive: true,
      },
    ];
    expect(check(draft)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Adjustments (§10)
// ---------------------------------------------------------------------------

describe("the adjustment sums the settlement strip reads", () => {
  // A cart big enough for the credits to be a PART of, not larger than: a
  // 20-plank line at 100 prices to 2,360 with tax.
  const draft = billable({
    lines: [line({ billQty: 20, stockQty: 100 })],
    adjustments: [creditRow(300, "ADVANCE"), creditRow(200, "SALES_RETURN")],
  });

  it("splits advances from credit notes, because they post differently", () => {
    expect(advanceAdjusted(draft)).toBe(300);
    expect(noteAdjusted(draft)).toBe(200);
    expect(totalAdjusted(draft)).toBe(500);
  });

  it("reconciles: tender + adjustment together settle the bill", () => {
    // §19's case. The two halves are different money in different tables and the
    // bill is covered by their sum.
    const pricing = priceOf(draft);
    const bill = pricing.totals.bill;
    const withTender = settled({ ...draft, tenders: [] });
    withTender.tenders = [{ ...withTender.tenders[0], keyed: bill - 500 }];
    withTender.adjustments = draft.adjustments;
    expect(settledAmountOf(withTender, priceOf(withTender))).toBe(bill);
    expect(validateSaveInputs(withTender, priceOf(withTender))).toBeNull();
  });
});

describe("validateAdjustments", () => {
  it("refuses more than a credit has left on it", () => {
    const draft = billable({ adjustments: [creditRow(600, "ADVANCE", 500)] });
    expect(validateAdjustments(draft, 10000)?.message).toContain("has only 500.00 left on it");
  });

  it("refuses a negative adjustment", () => {
    const draft = billable({ adjustments: [creditRow(-5, "ADVANCE", 500)] });
    expect(validateAdjustments(draft, 10000)?.message).toContain("cannot be negative");
  });

  it("refuses adjusting more than the bill is worth", () => {
    // Otherwise the customer is left owed money by a document that cannot pay it
    // back — a refund is a separate transaction.
    const draft = billable({ adjustments: [creditRow(5000, "ADVANCE")] });
    expect(validateAdjustments(draft, 1000)?.message).toContain("owed money");
  });

  it("accepts a set that fits", () => {
    const draft = billable({ adjustments: [creditRow(300, "ADVANCE"), creditRow(200, "SALES_RETURN")] });
    expect(validateAdjustments(draft, 1000)).toBeNull();
  });
});
