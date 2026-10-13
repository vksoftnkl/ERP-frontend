import { describe, expect, it } from "vitest";
import type { ExpenseDraft, ExpenseLedgerPick, ExpenseReasonPick } from "../expense.types";
import {
  asksBeforeOpeningAnother,
  cellAfterPick,
  emptyLine,
  emptyTender,
  expenseDraftReducer,
  isBlankLine,
  isBlankTender,
  isEditable,
  ledgerPickPatch,
  newDraft,
  reasonPickPatch,
  reenterCopy,
  withAutoTender,
  withTrailingRows,
} from "./draft";
import { CASH_ID, LEDGER_COURIER, LEDGER_REPAIRS, TAX_18, TODAY, UPI_ID } from "./fixtures";

const REASON: ExpenseReasonPick = {
  reasonId: "r-courier",
  name: "Courier",
  ledgerId: LEDGER_COURIER,
  ledgerName: "Courier Charges",
  taxId: TAX_18,
  taxName: "GST 18%",
  hsn: "996812",
};
const LEDGER: ExpenseLedgerPick = {
  ledgerId: LEDGER_REPAIRS,
  name: "Repairs",
  taxId: TAX_18,
  taxName: "GST 18%",
  hsn: "998719",
};

describe("a new voucher (Qt startNew)", () => {
  it("starts with one blank line, a cash tender that takes the balance, and the trailing blank tender", () => {
    const draft = newDraft(TODAY, CASH_ID);
    expect(draft.status).toBeNull();
    expect(draft.keys).toBeNull();
    expect(draft.lines).toHaveLength(1);
    expect(isBlankLine(draft.lines[0])).toBe(true);
    expect(draft.tenders).toEqual([
      expect.objectContaining({ tenderId: CASH_ID, amount: "", autoAmount: true }),
      expect.objectContaining({ tenderId: "", amount: "", autoAmount: false }),
    ]);
    expect(draft.header.voucherDate).toBe(TODAY);
    expect(draft.header.invoiceDate).toBe(TODAY);
    expect(draft.header).toMatchObject({ gstBill: false, placeOfSupply: "", placeOfSupplyPicked: false });
    expect(draft.lines[0]).toMatchObject({ itc: true, hsn: "", reasonName: "" });
    expect(draft.dirty).toBe(false);
  });

  it("before the masters land: one unnamed tender, still the one that follows the balance", () => {
    const draft = newDraft(TODAY);
    expect(draft.tenders).toEqual([expect.objectContaining({ tenderId: "", autoAmount: true })]);
  });

  it("only NEW and DRAFT are editable", () => {
    expect(isEditable(null)).toBe(true);
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("POSTED")).toBe(false);
    expect(isEditable("CANCELLED")).toBe(false);
  });
});

describe("blank rows", () => {
  it("a line is blank with no reason, ledger, amount or description — an unreadable amount is something", () => {
    expect(isBlankLine(emptyLine())).toBe(true);
    expect(isBlankLine({ ...emptyLine(), amount: "0.00" })).toBe(true);
    expect(isBlankLine({ ...emptyLine(), hsn: "9987" })).toBe(true);
    expect(isBlankLine({ ...emptyLine(), amount: "abc" })).toBe(false);
    expect(isBlankLine({ ...emptyLine(), reasonId: "r" })).toBe(false);
    expect(isBlankLine({ ...emptyLine(), description: "tea" })).toBe(false);
  });

  it("a tender is blank with no tender, amount or ref", () => {
    expect(isBlankTender(emptyTender())).toBe(true);
    expect(isBlankTender(emptyTender(CASH_ID))).toBe(false);
    expect(isBlankTender({ ...emptyTender(), refNo: "UTR" })).toBe(false);
  });

  it("both grids end in one blank row while editable; a posted voucher has none", () => {
    const filled: ExpenseDraft = {
      ...newDraft(TODAY, CASH_ID),
      lines: [{ ...emptyLine(), ledgerId: LEDGER_REPAIRS, amount: "10" }],
    };
    const grown = withTrailingRows(filled);
    expect(grown.lines).toHaveLength(2);
    expect(isBlankLine(grown.lines[1])).toBe(true);
    expect(withTrailingRows(grown)).toBe(grown);
    const posted = { ...filled, status: "POSTED" as const };
    expect(withTrailingRows(posted)).toBe(posted);
  });
});

describe("F8 over a voucher (Qt showList, 6f15977)", () => {
  it("asks only while the voucher can change and a line has something in it", () => {
    const typed = [{ ...emptyLine(), description: "tea" }, emptyLine()];
    expect(asksBeforeOpeningAnother(typed, true)).toBe(true);
    // A blank voucher — or only a tender typed — is simply replaced.
    expect(asksBeforeOpeningAnother([emptyLine()], true)).toBe(false);
    expect(asksBeforeOpeningAnother([], true)).toBe(false);
    // A posted or cancelled voucher (or one still being read) has nothing to lose.
    expect(asksBeforeOpeningAnother(typed, false)).toBe(false);
  });
});

describe("the reducer", () => {
  it("typing into the trailing blank row grows the next one", () => {
    let draft = newDraft(TODAY, CASH_ID);
    const blank = draft.lines[0].key;
    draft = expenseDraftReducer(draft, { type: "SET_LINE", key: blank, patch: { amount: "250" } });
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0].amount).toBe("250");
    expect(isBlankLine(draft.lines[1])).toBe(true);
    expect(draft.dirty).toBe(true);

    const blankTender = draft.tenders[1].key;
    draft = expenseDraftReducer(draft, { type: "SET_TENDER", key: blankTender, patch: { tenderId: UPI_ID } });
    expect(draft.tenders).toHaveLength(3);
  });

  it("removes a row by key, never a blank one, and keeps the trailing blank row", () => {
    let draft = newDraft(TODAY, CASH_ID);
    draft = expenseDraftReducer(draft, { type: "SET_LINE", key: draft.lines[0].key, patch: { amount: "5" } });
    const trailing = draft.lines[1].key;
    expect(expenseDraftReducer(draft, { type: "REMOVE_LINE", key: trailing })).toBe(draft);
    draft = expenseDraftReducer(draft, { type: "REMOVE_LINE", key: draft.lines[0].key });
    expect(draft.lines).toHaveLength(1);
    expect(isBlankLine(draft.lines[0])).toBe(true);

    const cash = draft.tenders[0].key;
    draft = expenseDraftReducer(draft, { type: "REMOVE_TENDER", key: cash });
    expect(draft.tenders).toHaveLength(1);
    expect(isBlankTender(draft.tenders[0])).toBe(true);
    expect(expenseDraftReducer(draft, { type: "REMOVE_TENDER", key: draft.tenders[0].key })).toBe(draft);
  });

  it("patches the header", () => {
    const draft = expenseDraftReducer(newDraft(TODAY, CASH_ID), {
      type: "SET_HEADER",
      patch: { paidTo: "Ravi", gstBill: true },
    });
    expect(draft.header).toMatchObject({ paidTo: "Ravi", gstBill: true });
    expect(draft.dirty).toBe(true);
  });

  it("refuses every edit to a posted voucher, but RESET still replaces it", () => {
    const posted: ExpenseDraft = { ...newDraft(TODAY, CASH_ID), status: "POSTED" };
    expect(expenseDraftReducer(posted, { type: "SET_HEADER", patch: { paidTo: "x" } })).toBe(posted);
    expect(expenseDraftReducer(posted, { type: "SET_LINE", key: posted.lines[0].key, patch: { amount: "1" } })).toBe(
      posted,
    );
    const fresh = newDraft(TODAY);
    expect(expenseDraftReducer(posted, { type: "RESET", draft: fresh })).toBe(fresh);
  });
});

describe("DEFAULT_CASH (Qt loadPickers: the masters landed after New)", () => {
  it("puts the voucher's own first tender on cash, adds the trailing row, stays clean", () => {
    const draft = expenseDraftReducer(newDraft(TODAY), { type: "DEFAULT_CASH", tenderId: CASH_ID });
    expect(draft.tenders.map((row) => [row.tenderId, row.autoAmount])).toEqual([
      [CASH_ID, true],
      ["", false],
    ]);
    expect(draft.dirty).toBe(false);
  });

  it("leaves a named tender, a saved voucher, and a blank row left first by a removal alone", () => {
    const named = newDraft(TODAY, UPI_ID);
    expect(expenseDraftReducer(named, { type: "DEFAULT_CASH", tenderId: CASH_ID })).toBe(named);
    const saved: ExpenseDraft = { ...newDraft(TODAY), status: "DRAFT" };
    expect(expenseDraftReducer(saved, { type: "DEFAULT_CASH", tenderId: CASH_ID })).toBe(saved);
    const removed: ExpenseDraft = { ...newDraft(TODAY), tenders: [emptyTender()] };
    expect(expenseDraftReducer(removed, { type: "DEFAULT_CASH", tenderId: CASH_ID })).toBe(removed);
  });
});

describe("the popup picks (Qt onPopupPicked)", () => {
  it("a reason fills its ledger, the ledger's rate and HSN, and an empty description", () => {
    expect(reasonPickPatch(emptyLine(), REASON)).toEqual({
      reasonId: "r-courier",
      reasonName: "Courier",
      ledgerId: LEDGER_COURIER,
      ledgerName: "Courier Charges",
      taxId: TAX_18,
      taxName: "GST 18%",
      hsn: "996812",
      description: "Courier",
    });
  });

  it("keeps what the line already has: a typed description, its rate, its HSN", () => {
    const line = { ...emptyLine(), description: "Documents to HO", taxId: "t5", taxName: "GST 5%", hsn: "1234" };
    const patch = reasonPickPatch(line, REASON);
    expect(patch).not.toHaveProperty("description");
    expect(patch).not.toHaveProperty("taxId");
    expect(patch).not.toHaveProperty("hsn");
  });

  it("a reason without a ledger leaves the line's ledger alone", () => {
    const line = { ...emptyLine(), ledgerId: LEDGER_REPAIRS, ledgerName: "Repairs" };
    expect(reasonPickPatch(line, { ...REASON, ledgerId: "", ledgerName: "" })).not.toHaveProperty("ledgerId");
  });

  it("a ledger fills itself and its GST facts where blank", () => {
    expect(ledgerPickPatch(emptyLine(), LEDGER)).toEqual({
      ledgerId: LEDGER_REPAIRS,
      ledgerName: "Repairs",
      taxId: TAX_18,
      taxName: "GST 18%",
      hsn: "998719",
    });
  });

  it("the caret: a reason with its ledger goes to Amount, without one to the ledger; a ledger to Description", () => {
    expect(cellAfterPick("reason", { ...emptyLine(), ledgerId: LEDGER_COURIER })).toBe("amount");
    expect(cellAfterPick("reason", emptyLine())).toBe("ledger");
    expect(cellAfterPick("ledger", emptyLine())).toBe("description");
  });
});

describe("withAutoTender (Qt balanceAutoTender)", () => {
  it("the first tender takes what the others leave", () => {
    const base = newDraft(TODAY, CASH_ID);
    const draft: ExpenseDraft = {
      ...base,
      tenders: [base.tenders[0], { ...emptyTender(UPI_ID, "300") }, emptyTender()],
    };
    expect(withAutoTender(draft, 118000).tenders[0].amount).toBe("880.00");
    expect(withAutoTender(draft, 20000).tenders[0].amount).toBe("");
  });

  it("does nothing once typed, or on a saved voucher", () => {
    const base = newDraft(TODAY, CASH_ID);
    const typed: ExpenseDraft = { ...base, tenders: [{ ...base.tenders[0], amount: "5", autoAmount: false }] };
    expect(withAutoTender(typed, 100000)).toBe(typed);
    const posted: ExpenseDraft = { ...base, status: "POSTED" };
    expect(withAutoTender(posted, 100000)).toBe(posted);
  });
});

describe("reenterCopy (Qt 5e25760 Cancel & re-enter)", () => {
  const posted: ExpenseDraft = {
    keys: { companyId: "c", branchId: "b", accYear: "2026-2027", voucherId: "v1" },
    status: "POSTED",
    voucherNo: "ExpV00012",
    header: {
      ...newDraft("2026-10-01").header,
      partyId: "party-1",
      partyName: "ZT Vinayaga",
      paidTo: "Ravi",
      gstBill: true,
      supplierGstin: "29AACCG0527D1Z0",
      invoiceNo: "INV-9",
      placeOfSupply: "33",
      placeOfSupplyPicked: true,
    },
    lines: [{ ...emptyLine(), reasonId: "r1", ledgerId: LEDGER_REPAIRS, amount: "1,000.00", hsn: "997113", taxId: TAX_18 }],
    tenders: [{ ...emptyTender(CASH_ID, "1,180.00"), tenderName: "Cash" }],
    dirty: false,
  };

  it("opens a NEW voucher with the lines, tenders, party and GST bill, dated today", () => {
    const copy = reenterCopy(posted, TODAY, new Map([["r1", "Repairs & upkeep"]]));
    expect(copy).toMatchObject({ keys: null, status: null, voucherNo: null, dirty: true });
    expect(copy.header).toMatchObject({
      voucherDate: TODAY,
      partyId: "party-1",
      paidTo: "Ravi",
      gstBill: true,
      invoiceNo: "INV-9",
      placeOfSupply: "33",
      placeOfSupplyPicked: true,
    });
    expect(copy.lines[0]).toMatchObject({ reasonName: "Repairs & upkeep", hsn: "997113", amount: "1,000.00" });
    expect(copy.lines[0].key).not.toBe(posted.lines[0].key);
    // Trailing blank rows, now that it can be edited.
    expect(isBlankLine(copy.lines[1])).toBe(true);
    expect(isBlankTender(copy.tenders[1])).toBe(true);
  });

  it("a single tender follows the corrected total; several stay as typed", () => {
    expect(reenterCopy(posted, TODAY, new Map()).tenders[0].autoAmount).toBe(true);
    const two = { ...posted, tenders: [...posted.tenders, emptyTender(UPI_ID, "10")] };
    expect(reenterCopy(two, TODAY, new Map()).tenders.map((row) => row.autoAmount)).toEqual([false, false, false]);
  });
});
