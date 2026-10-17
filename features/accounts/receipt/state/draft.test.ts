import { describe, expect, it } from "vitest";
import { draftReducer, initialDraft, receivedTotal, type DraftAction, type ReceiptDraft } from "./draft";
import { aBill, aCredit, aLine, aParty, aTender } from "../domain/fixtures";
import { computeIdentity } from "../domain/identity";
import { buildSaveAndPostPayload } from "../payload/build-save-and-post";
import type { OpenItemsPayload, ReceiptScope } from "../receipt.types";
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";

const SCOPE: ReceiptScope = { companyId: "co", branchId: "br", accYear: "2026-2027" };

function start(patch: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return { ...initialDraft(SCOPE, "2026-09-18"), ...patch };
}

function master(partial: Partial<TenderMasterRow> = {}): TenderMasterRow {
  return {
    tndId: "tnd-cash",
    tndCompanyId: "co",
    tndBranchId: null,
    tndTypeId: "1",
    tndName: "Cash",
    tndShortName: "CSH",
    tndLedgerId: "led-cash",
    tndSettlementLedgerId: null,
    tndTypeName: "Cash",
    tndLedgerName: "Cash in hand",
    tndSurchargeLedgerName: null,
    tndSettlementDays: 0,
    tndMinAmount: 0,
    tndMaxAmount: null,
    tndDailyLimit: null,
    tndSurchargePerc: 0,
    tndSurchargeAmount: 0,
    tndSurchargeLedgerId: null,
    tndEditSurcharge: false,
    tndEditLedger: false,
    tndConversionRate: 1,
    tndNeedsRef: null,
    tndAllowChange: null,
    tndAllowInReturn: null,
    tndOpenCashDrawer: false,
    tndIsDefault: true,
    tndDisplayPosition: 10,
    tndHotkey: null,
    tndColour: null,
    tndEffectiveFrom: null,
    tndEffectiveTo: null,
    tndIsActive: true,
    tndIsDeleted: false,
    ...partial,
  };
}

describe("choosing a party", () => {
  it("clears the bills and puts the party's facts back to NOT LOADED", () => {
    // Every flag defaults to false, and false is a claim — "not bill-by-bill",
    // "no TDS". Qt announced "NOT bill-by-bill" over a screen full of that
    // party's bills because it read them before their fetch.
    const before = start({
      header: { ...start().header, partyId: "old", partyName: "Old" },
      bills: [aBill({ receive: 500 })],
      party: aParty({ isBillByBill: true }),
      itemsLoaded: true,
    });
    const { draft } = draftReducer(before, {
      type: "PARTY_PICKED",
      partyId: "new",
      partyName: "New",
    });
    expect(draft.bills).toHaveLength(0);
    expect(draft.party.loaded).toBe(false);
    expect(draft.itemsLoaded).toBe(false);
  });

  it("ignores an answer for the party the operator has just left", () => {
    const before = start({ header: { ...start().header, partyId: "current" } });
    const payload = {
      bills: [{ billId: "b1", docRefno: "INV/1" }],
      credits: [],
      summary: { totalPending: 0, billCount: 0, overdueCount: 0, creditsHeld: 0, pdcHeld: 0 },
      party: { ledId: "stale", ledName: "Stale" },
    } as unknown as OpenItemsPayload;
    const { draft } = draftReducer(before, {
      type: "OPEN_ITEMS_LOADED",
      partyId: "stale",
      payload,
    });
    expect(draft.bills).toHaveLength(0);
  });
});

describe("the bill cells", () => {
  it("marks a typed Receive as an override", () => {
    const before = start({ bills: [aBill({ billId: "b1", pendingAmount: 5000 })] });
    const { draft } = draftReducer(before, {
      type: "SET_BILL_CELL",
      billId: "b1",
      column: "receive",
      value: 1000,
    });
    expect(draft.bills[0]).toMatchObject({ receive: 1000, receiveTyped: true });
    expect(draft.dirty).toBe(true);
  });

  it("clamps the cell and REFUSES in the same action, never after a dialog", () => {
    // Qt crashed here: `showWarning` ran a nested event loop, an /open-items
    // reply landed inside it and replaced the lists, and the row reference
    // taken before the dialog dangled.
    const before = start({ bills: [aBill({ billId: "b1", docRefno: "INV/7", pendingAmount: 5000 })] });
    const result = draftReducer(before, {
      type: "SET_BILL_CELL",
      billId: "b1",
      column: "receive",
      value: 9000,
    });
    expect(result.draft.bills[0].receive).toBe(5000);
    expect(result.refusal?.message).toContain("INV/7");
  });

  it("keeps the scratch Note out of the dirty flag — it goes nowhere", () => {
    const before = start({ bills: [aBill({ billId: "b1" })] });
    const { draft } = draftReducer(before, { type: "SET_BILL_NOTE", billId: "b1", note: "rang" });
    expect(draft.bills[0].note).toBe("rang");
    expect(draft.dirty).toBe(false);
  });

  it("will not edit a POSTED receipt that is not being amended", () => {
    const before = start({
      header: { ...start().header, status: "POSTED" },
      bills: [aBill({ billId: "b1" })],
    });
    const { draft } = draftReducer(before, {
      type: "SET_BILL_CELL",
      billId: "b1",
      column: "receive",
      value: 100,
    });
    expect(draft.bills[0].receive).toBe(0);
  });
});

describe("the seeded lines follow the grids", () => {
  it("raises a DISCOUNT_ALLOWED line the moment a discount is typed", () => {
    const before = start({ bills: [aBill({ billId: "b1", pendingAmount: 5000 })] });
    const { draft } = draftReducer(before, {
      type: "SET_BILL_CELL",
      billId: "b1",
      column: "discount",
      value: 50,
    });
    expect(draft.otherLines.map((line) => line.role)).toEqual(["DISCOUNT_ALLOWED"]);
    expect(draft.otherLines[0].amount).toBe(50);
  });

  it("raises BANK_CHARGES from the MDR column", () => {
    const tender = aTender({ amount: 15000 });
    const before = start({ tenders: [tender] });
    const { draft } = draftReducer(before, {
      type: "SET_TENDER",
      rowKey: tender.key,
      patch: { mdrAmt: 10 },
    });
    expect(draft.otherLines.map((line) => line.role)).toEqual(["BANK_CHARGES"]);
    expect(draft.otherLines[0].settlesBill).toBe(false);
  });

  it("refuses to remove a seeded line and says which figure to change", () => {
    const seeded = aLine("DISCOUNT_ALLOWED", { amount: 50, seeded: true });
    const before = start({ bills: [aBill({ discount: 50 })], otherLines: [seeded] });
    const result = draftReducer(before, { type: "REMOVE_ROW", rowKey: seeded.key });
    expect(result.draft.otherLines).toHaveLength(1);
    expect(result.refusal?.message).toContain("Disc column");
  });
});

describe("converting a row between the two kinds", () => {
  it("moves an instrument into the role lines, carrying its amount", () => {
    const tender = aTender({ amount: 1400 });
    const before = start({ tenders: [tender] });
    const { draft } = draftReducer(before, {
      type: "CONVERT_TO_LINE",
      rowKey: tender.key,
      role: "TDS_RECEIVABLE",
    });
    expect(draft.tenders).toHaveLength(0);
    expect(draft.otherLines[0]).toMatchObject({
      role: "TDS_RECEIVABLE",
      amount: 1400,
      settlesBill: true,
      drCr: "DR",
    });
  });

  it("moves a role line back onto an instrument", () => {
    const line = aLine("CLAIMS_ALLOWED", { amount: 300 });
    const before = start({ otherLines: [line] });
    const { draft } = draftReducer(before, {
      type: "CONVERT_TO_TENDER",
      rowKey: line.key,
      master: master(),
    });
    expect(draft.otherLines).toHaveLength(0);
    expect(draft.tenders[0]).toMatchObject({ amount: 300, tenderId: "tnd-cash" });
  });

  it("gives a credit-side role its own defaults", () => {
    const line = aLine("CLAIMS_ALLOWED", { amount: 100 });
    const before = start({ otherLines: [line] });
    const { draft } = draftReducer(before, {
      type: "SET_LINE_ROLE",
      rowKey: line.key,
      role: "TCS_PAYABLE",
    });
    expect(draft.otherLines[0]).toMatchObject({ drCr: "CR", settlesBill: false, ledgerId: null });
  });
});

describe("a new document", () => {
  it("resets the duplicate memo and the amending flag", () => {
    // Both were left behind in Qt: the second receipt for the same figure was
    // silently skipped, and the next receipt was keyed on a screen that still
    // thought it was restating the last one.
    const before = start({ duplicateAsked: 5000, amending: true });
    const { draft } = draftReducer(before, {
      type: "NEW_DOCUMENT",
      scope: SCOPE,
      voucherDate: "2026-09-19",
    });
    expect(draft.duplicateAsked).toBeNull();
    expect(draft.amending).toBe(false);
  });
});

describe("auto-allocate from the reducer", () => {
  it("refuses on a party that is not kept bill-by-bill, and says where it goes", () => {
    const before = start({
      party: aParty({ isBillByBill: false, ledName: "Walk-in" }),
      itemsLoaded: true,
      tenders: [aTender({ amount: 500 })],
    });
    const result = draftReducer(before, { type: "AUTO_ALLOCATE" });
    expect(result.refusal?.message).toContain("on account");
  });

  it("places the money when there are bills to place it on", () => {
    const before = start({
      party: aParty({ isBillByBill: true }),
      itemsLoaded: true,
      bills: [aBill({ billId: "b1", pendingAmount: 1000 })],
      credits: [aCredit({ billId: "c1", pendingAmount: 200 })],
      tenders: [aTender({ amount: 500 })],
    });
    const { draft } = draftReducer(before, { type: "AUTO_ALLOCATE" });
    expect(draft.credits[0].apply).toBe(200);
    expect(draft.bills[0].receive).toBe(700);
  });
});

describe("receivedTotal", () => {
  it("is the sum of every instrument — what the duplicate guard asks about", () => {
    const draft = start({ tenders: [aTender({ amount: 500 }), aTender({ amount: 500 })] });
    expect(receivedTotal(draft)).toBe(1000);
  });
});

describe("the tender surcharge (Qt 6f15977)", () => {
  const cash = master();
  const upi = master({
    tndId: "tnd-upi",
    tndTypeId: "3",
    tndName: "UPI",
    tndLedgerId: "led-upi",
    tndIsDefault: false,
    tndSurchargePerc: 1,
  });
  const cheque = master({
    tndId: "tnd-chq",
    tndTypeId: "5",
    tndName: "Cheque",
    tndLedgerId: "led-chq",
    tndIsDefault: false,
  });

  function run(state: ReceiptDraft, ...actions: DraftAction[]): ReceiptDraft {
    return actions.reduce((draft, action) => draftReducer(draft, action).draft, state);
  }

  /** The user's case, 2026-10-12: 1,000 as CASH 100 + UPI 200 + CHEQUE 700. */
  function theSplit(): ReceiptDraft {
    let draft = start({
      header: { ...start().header, partyId: "deepan", partyName: "Deepan" },
      party: aParty({ isBillByBill: true }),
      itemsLoaded: true,
      bills: [aBill({ billId: "seed-1", docRefno: "SEED-DEEPAN-1", pendingAmount: 5000 })],
    });
    draft = run(draft, { type: "ADD_TENDER", master: cash, amount: 100 });
    draft = run(draft, { type: "ADD_TENDER", master: upi });
    draft = run(draft, {
      type: "SET_TENDER_AMOUNT",
      rowKey: draft.tenders[1].key,
      amount: 200,
      master: upi,
    });
    return run(
      draft,
      { type: "ADD_TENDER", master: cheque, amount: 700 },
      { type: "SET_BILL_CELL", billId: "seed-1", column: "receive", value: 1000 },
    );
  }

  it("collects 202.00 on the UPI row for the 200 typed", () => {
    const draft = theSplit();
    expect(draft.tenders.map((tender) => tender.amount)).toEqual([100, 202, 700]);
    expect(draft.tenders[1]).toMatchObject({ forBills: 200, surchargeAmt: 2 });
  });

  it("seeds SURCHARGE_RECOVERED — CR, settling nothing — for the 2.00", () => {
    const line = theSplit().otherLines.find((entry) => entry.role === "SURCHARGE_RECOVERED");
    expect(line).toMatchObject({ amount: 2, drCr: "CR", settlesBill: false, seeded: true });
  });

  it("balances: 1,002.00 received = 1,000 allocated + 2.00 surcharge", () => {
    const identity = computeIdentity(theSplit());
    expect(identity).toMatchObject({
      received: 1002,
      allocated: 1000,
      additions: 2,
      onAccount: 0,
      balances: true,
    });
  });

  it("sends the surcharge line in the ONE call that saves and posts", () => {
    const draft = theSplit();
    const body = buildSaveAndPostPayload({ ...draft, userId: "user" });
    expect(body.post).toBe(true);
    expect(body.onAccount).toBe(0);
    expect(body.otherLines).toContainEqual(
      expect.objectContaining({ role: "SURCHARGE_RECOVERED", drCr: "CR", amount: 2 }),
    );
    expect(body.tenders[1]).toMatchObject({ tdAmount: 202 });
    // The master does not let it be edited, so the server computes it.
    expect(body.tenders[1]).not.toHaveProperty("tdSurchargeAmt");
  });

  it("moves with the row's tender, keeping the figure for the bills", () => {
    let draft = run(start(), { type: "ADD_TENDER", master: cash, amount: 200 });
    const rowKey = draft.tenders[0].key;
    draft = run(draft, { type: "RETARGET_TENDER", rowKey, master: upi });
    expect(draft.tenders[0].amount).toBe(202);
    expect(draft.otherLines.map((line) => line.role)).toEqual(["SURCHARGE_RECOVERED"]);
    draft = run(draft, { type: "RETARGET_TENDER", rowKey, master: cash });
    expect(draft.tenders[0].amount).toBe(200);
    expect(draft.otherLines).toHaveLength(0);
  });

  it("grosses up an amount the Amount box adds with the row", () => {
    const { draft } = draftReducer(start(), { type: "ADD_TENDER", master: upi, amount: 200 });
    expect(draft.tenders[0].amount).toBe(202);
    expect(draft.otherLines[0]).toMatchObject({ role: "SURCHARGE_RECOVERED", amount: 2 });
  });

  it("marks the figure to travel when the master lets it be edited", () => {
    const editable = { ...upi, tndEditSurcharge: true };
    let draft = run(start(), { type: "ADD_TENDER", master: editable });
    draft = run(draft, {
      type: "SET_TENDER_AMOUNT",
      rowKey: draft.tenders[0].key,
      amount: 200,
      master: editable,
    });
    expect(draft.tenders[0].sendSurcharge).toBe(true);
  });

  it("auto-allocates what goes to the bills, not the surcharge", () => {
    let draft = start({
      party: aParty({ isBillByBill: true }),
      itemsLoaded: true,
      bills: [aBill({ billId: "b1", pendingAmount: 5000 })],
    });
    draft = run(draft, { type: "ADD_TENDER", master: upi, amount: 1000 }, { type: "AUTO_ALLOCATE" });
    expect(draft.tenders[0].amount).toBe(1010);
    expect(draft.bills[0].receive).toBe(1000);
    expect(computeIdentity(draft).balances).toBe(true);
  });

  it("turns a surcharged row into a line at the figure that was typed", () => {
    let draft = run(start(), { type: "ADD_TENDER", master: upi, amount: 1400 });
    draft = run(draft, {
      type: "CONVERT_TO_LINE",
      rowKey: draft.tenders[0].key,
      role: "TDS_RECEIVABLE",
    });
    expect(draft.otherLines).toEqual([
      expect.objectContaining({ role: "TDS_RECEIVABLE", amount: 1400 }),
    ]);
  });

  it("refuses to remove the surcharge line, and says where it comes from", () => {
    const draft = theSplit();
    const line = draft.otherLines.find((entry) => entry.role === "SURCHARGE_RECOVERED");
    const result = draftReducer(draft, { type: "REMOVE_ROW", rowKey: line!.key });
    expect(result.draft.otherLines).toContain(line);
    expect(result.refusal?.message).toContain("surcharge");
  });
});
