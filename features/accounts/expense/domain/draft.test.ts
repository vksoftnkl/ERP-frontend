import { describe, expect, it } from "vitest";
import type { ExpenseDraft, ExpenseQuickReason } from "../expense.types";
import {
  emptyLine,
  emptyTender,
  expenseDraftReducer,
  isEditable,
  newDraft,
  reasonPatch,
  withDefaultCash,
} from "./draft";
import { CASH_ID, LEDGER_COURIER, LEDGER_REPAIRS, TODAY, UPI_ID } from "./fixtures";

const REASON: ExpenseQuickReason = {
  reasonId: "r-courier",
  code: "COURIER",
  name: "Courier",
  ledgerId: LEDGER_COURIER,
  ledgerName: "Courier Charges",
  needsNote: false,
  needsRef: false,
  maxAmount: null,
};
const LEDGERS = [
  { ledgerId: LEDGER_REPAIRS, name: "Repairs" },
  { ledgerId: LEDGER_COURIER, name: "Courier Charges" },
];

describe("a new voucher", () => {
  it("starts with one empty line and one tender row, clean, NEW", () => {
    const draft = newDraft(TODAY, CASH_ID);
    expect(draft.status).toBeNull();
    expect(draft.keys).toBeNull();
    expect(draft.lines).toHaveLength(1);
    expect(draft.tenders).toEqual([expect.objectContaining({ tenderId: CASH_ID, amount: "" })]);
    expect(draft.header.voucherDate).toBe(TODAY);
    expect(draft.header.invoiceDate).toBe(TODAY);
    expect(draft.header.gstBill).toBe(false);
    expect(draft.lines[0].itc).toBe(true);
    expect(draft.dirty).toBe(false);
  });

  it("only NEW and DRAFT are editable", () => {
    expect(isEditable(null)).toBe(true);
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("POSTED")).toBe(false);
    expect(isEditable("CANCELLED")).toBe(false);
  });
});

describe("withDefaultCash", () => {
  it("reads a NEW voucher's first blank tender row as cash, leaving the state alone", () => {
    const draft = newDraft(TODAY);
    const shown = withDefaultCash(draft, CASH_ID);
    expect(shown.tenders[0].tenderId).toBe(CASH_ID);
    expect(draft.tenders[0].tenderId).toBe("");
    expect(shown.dirty).toBe(false);
  });

  it("keeps a picked tender, a saved voucher, and an unknown cash tender as they are", () => {
    const picked = newDraft(TODAY, UPI_ID);
    expect(withDefaultCash(picked, CASH_ID)).toBe(picked);
    const saved: ExpenseDraft = { ...newDraft(TODAY), status: "DRAFT" };
    expect(withDefaultCash(saved, CASH_ID)).toBe(saved);
    const draft = newDraft(TODAY);
    expect(withDefaultCash(draft, "")).toBe(draft);
  });
});

describe("the reducer", () => {
  it("adds and removes rows by key, never the last one", () => {
    let draft = newDraft(TODAY, CASH_ID);
    const line = emptyLine();
    draft = expenseDraftReducer(draft, { type: "ADD_LINE", line });
    expect(draft.lines.map((row) => row.key)).toContain(line.key);
    expect(draft.dirty).toBe(true);
    draft = expenseDraftReducer(draft, { type: "REMOVE_LINE", key: line.key });
    expect(draft.lines).toHaveLength(1);
    const only = draft.lines[0].key;
    expect(expenseDraftReducer(draft, { type: "REMOVE_LINE", key: only }).lines).toHaveLength(1);

    const row = emptyTender(UPI_ID, "100.00");
    draft = expenseDraftReducer(draft, { type: "ADD_TENDER", row });
    expect(draft.tenders).toHaveLength(2);
    draft = expenseDraftReducer(draft, { type: "REMOVE_TENDER", key: row.key });
    expect(draft.tenders).toHaveLength(1);
    expect(expenseDraftReducer(draft, { type: "REMOVE_TENDER", key: draft.tenders[0].key }).tenders).toHaveLength(1);
  });

  it("patches a header, a line and a tender", () => {
    let draft = newDraft(TODAY, CASH_ID);
    draft = expenseDraftReducer(draft, { type: "SET_HEADER", patch: { paidTo: "Ravi", gstBill: true } });
    draft = expenseDraftReducer(draft, { type: "SET_LINE", key: draft.lines[0].key, patch: { amount: "250" } });
    draft = expenseDraftReducer(draft, { type: "SET_TENDER", key: draft.tenders[0].key, patch: { amount: "250" } });
    expect(draft.header).toMatchObject({ paidTo: "Ravi", gstBill: true });
    expect(draft.lines[0].amount).toBe("250");
    expect(draft.tenders[0].amount).toBe("250");
    expect(draft.dirty).toBe(true);
  });

  it("refuses every edit to a posted voucher, but RESET still replaces it", () => {
    const posted: ExpenseDraft = { ...newDraft(TODAY, CASH_ID), status: "POSTED" };
    expect(expenseDraftReducer(posted, { type: "SET_HEADER", patch: { paidTo: "x" } })).toBe(posted);
    expect(expenseDraftReducer(posted, { type: "ADD_LINE", line: emptyLine() })).toBe(posted);
    const fresh = newDraft(TODAY);
    expect(expenseDraftReducer(posted, { type: "RESET", draft: fresh })).toBe(fresh);
  });
});

describe("picking a reason (Qt: fills its ledger, and the description when empty)", () => {
  it("fills the ledger it names and an empty description", () => {
    expect(reasonPatch(emptyLine(), REASON, LEDGERS)).toEqual({
      reasonId: "r-courier",
      ledgerId: LEDGER_COURIER,
      ledgerName: "Courier Charges",
      description: "Courier",
    });
  });

  it("keeps a description already typed", () => {
    const line = { ...emptyLine(), description: "Documents to HO" };
    expect(reasonPatch(line, REASON, LEDGERS)).not.toHaveProperty("description");
  });

  it("leaves the ledger alone when the reason's ledger is not one a line may use", () => {
    const line = { ...emptyLine(), ledgerId: LEDGER_REPAIRS, ledgerName: "Repairs" };
    const patch = reasonPatch(line, { ...REASON, ledgerId: "not-an-expense-ledger" }, LEDGERS);
    expect(patch).not.toHaveProperty("ledgerId");
    expect(reasonPatch(line, { ...REASON, ledgerId: null }, LEDGERS)).not.toHaveProperty("ledgerId");
  });

  it("'—' clears the reason only", () => {
    const line = { ...emptyLine(), reasonId: "r-courier", ledgerId: LEDGER_COURIER };
    expect(reasonPatch(line, null, LEDGERS)).toEqual({ reasonId: "" });
  });
});
