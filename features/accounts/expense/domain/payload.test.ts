import { describe, expect, it } from "vitest";
import type { ExpenseDraft } from "../expense.types";
import { emptyLine, emptyTender, newDraft } from "./draft";
import { CASH_ID, LEDGER_COURIER, LEDGER_REPAIRS, SCOPE, TAX_18, TENDERS, TODAY, UPI_ID } from "./fixtures";
import {
  bodyKeyOf,
  buildExpenseBody,
  expensePostProblem,
  expenseProblem,
  isEmptyLine,
  joinRemarks,
} from "./payload";

function filled(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  const base = newDraft(TODAY, CASH_ID);
  return {
    ...base,
    header: { ...base.header, paidTo: "ZT Vinayaga Electricals", notes: "ExpV live test" },
    lines: [
      { ...emptyLine(), reasonId: "r-repair", ledgerId: LEDGER_REPAIRS, description: "wiring, counter 2", amount: "1,000" },
      { ...emptyLine(), ledgerId: LEDGER_COURIER, description: "", amount: "120" },
    ],
    tenders: [
      { ...emptyTender(CASH_ID, "300"), refNo: "" },
      { ...emptyTender(UPI_ID, "820"), refNo: " 599000000777 " },
    ],
    ...overrides,
  };
}

const input = (draft: ExpenseDraft) => ({ draft, scope: SCOPE, tenders: TENDERS, session: null });

describe("buildExpenseBody", () => {
  it("writes Qt's body: positions as row numbers, decimal strings, remarks joined", () => {
    const body = buildExpenseBody(input(filled()));
    expect(body).toEqual({
      companyId: SCOPE.companyId,
      branchId: SCOPE.branchId,
      accYear: "2026-2027",
      voucherDate: TODAY,
      partyId: null,
      remarks: "ZT Vinayaga Electricals — ExpV live test",
      reasonId: "r-repair",
      lines: [
        { rowNo: 1, ledgerId: LEDGER_REPAIRS, amount: "1000.00", description: "wiring, counter 2" },
        { rowNo: 2, ledgerId: LEDGER_COURIER, amount: "120.00", description: null },
      ],
      tenders: [
        { tdRowNo: 1, tdTenderId: CASH_ID, tdTenderTypeId: 1, tdAmount: "300.00", tdRefNo: null },
        { tdRowNo: 2, tdTenderId: UPI_ID, tdTenderTypeId: 3, tdAmount: "820.00", tdRefNo: "599000000777" },
      ],
    });
    // No key the DTO does not declare (forbidNonWhitelisted): no voucherId, gstBill, sessionId.
    expect(Object.keys(body)).not.toContain("voucherId");
    expect(Object.keys(body)).not.toContain("gstBill");
    expect(Object.keys(body)).not.toContain("sessionId");
  });

  it("leaves out empty lines and tenders with no master or no amount, keeping positions", () => {
    const draft = filled();
    draft.lines = [emptyLine(), ...draft.lines];
    draft.tenders = [...draft.tenders, emptyTender("gone-tender", "50"), emptyTender(CASH_ID, "0")];
    const body = buildExpenseBody(input(draft));
    expect(body.lines.map((line) => line.rowNo)).toEqual([2, 3]);
    expect(body.tenders.map((row) => row.tdRowNo)).toEqual([1, 2]);
    // The reason travels from the FIRST line, as Qt does — here an empty one.
    expect(body.reasonId).toBeNull();
  });

  it("carries the GST bill and the per-line rate and ITC only with one", () => {
    const draft = filled();
    draft.header = {
      ...draft.header,
      gstBill: true,
      supplierGstin: "33aaact1234f1z5",
      invoiceNo: " inv-2231 ",
      invoiceDate: "2026-10-08",
      placeOfSupply: "",
    };
    draft.lines[0] = { ...draft.lines[0], taxId: TAX_18, itc: false };
    const body = buildExpenseBody(input(draft));
    expect(body.gstBill).toEqual({
      supplierGstin: "33AAACT1234F1Z5",
      invoiceNo: "INV-2231",
      invoiceDate: "2026-10-08",
      placeOfSupplyCode: null,
    });
    expect(body.lines[0]).toMatchObject({ taxId: TAX_18, itc: false });
    expect(body.lines[1]).toMatchObject({ taxId: null, itc: true });
  });

  it("edits a saved draft under its own keys, and names the till session when there is one", () => {
    const draft = filled({
      keys: { companyId: "c2", branchId: "b2", accYear: "2025-2026", voucherId: "v1" },
      status: "DRAFT",
    });
    const body = buildExpenseBody({ ...input(draft), session: { sessionId: "s1", sessionNo: "C01-261009-01" } });
    expect(body).toMatchObject({ voucherId: "v1", companyId: "c2", branchId: "b2", accYear: "2025-2026", sessionId: "s1" });
  });

  it("fingerprints a body by its content", () => {
    const one = buildExpenseBody(input(filled()));
    const two = buildExpenseBody(input(filled()));
    expect(bodyKeyOf(one)).toBe(bodyKeyOf(two));
  });
});

describe("expenseProblem — Qt's sentences", () => {
  it("is null for a voucher that can go", () => {
    expect(expenseProblem(input(filled()))).toBeNull();
  });

  it("names a read-only voucher", () => {
    expect(expenseProblem(input(filled({ status: "POSTED" })))).toBe("The voucher is POSTED.");
  });

  it("waits for the header context", () => {
    expect(expenseProblem({ ...input(filled()), scope: { ...SCOPE, branchId: "" } })).toBe(
      "Choose the company, branch and year in the header first.",
    );
  });

  it("asks for the dates before the server's DTO refuses them", () => {
    const noDate = filled();
    noDate.header = { ...noDate.header, voucherDate: "" };
    expect(expenseProblem(input(noDate))).toBe("Enter the voucher date.");
    const noInvoiceDate = filled();
    noInvoiceDate.header = { ...noInvoiceDate.header, gstBill: true, invoiceDate: "" };
    expect(expenseProblem(input(noInvoiceDate))).toBe("With a GST bill: enter the invoice date.");
  });

  it("asks for what was spent, then each half-filled line, then how it was paid", () => {
    expect(expenseProblem(input(newDraft(TODAY, CASH_ID)))).toBe("Add what was spent.");

    const noLedger = filled();
    noLedger.lines[1] = { ...noLedger.lines[1], ledgerId: "" };
    expect(expenseProblem(input(noLedger))).toBe("Line 2: pick the expense ledger.");

    const noAmount = filled();
    noAmount.lines[0] = { ...noAmount.lines[0], amount: "" };
    expect(expenseProblem(input(noAmount))).toBe("Line 1: enter the amount.");

    const garbled = filled();
    garbled.lines[0] = { ...garbled.lines[0], amount: "12a" };
    expect(expenseProblem(input(garbled))).toBe("Line 1: the amount is not a number.");

    const garbledTender = filled();
    garbledTender.tenders[1] = { ...garbledTender.tenders[1], amount: "-5" };
    expect(expenseProblem(input(garbledTender))).toBe("Tender 2: the amount is not a number.");

    const unpaid = filled();
    unpaid.tenders = [emptyTender(CASH_ID, "")];
    expect(expenseProblem(input(unpaid))).toBe("Add how it was paid.");
  });

  it("Post also wants a GST bill's invoice number; a draft does not", () => {
    const draft = filled();
    draft.header = { ...draft.header, gstBill: true, invoiceNo: "  " };
    expect(expenseProblem(input(draft))).toBeNull();
    expect(expensePostProblem(input(draft))).toBe("With a GST bill: enter the supplier's invoice no.");
  });
});

describe("helpers", () => {
  it("joins the remarks Qt's way", () => {
    expect(joinRemarks("Ravi", "tea")).toBe("Ravi — tea");
    expect(joinRemarks("", "tea")).toBe("tea");
    expect(joinRemarks(" ", " ")).toBeNull();
  });

  it("an empty line has neither a ledger nor an amount", () => {
    expect(isEmptyLine({ ledgerId: "", amount: "" })).toBe(true);
    expect(isEmptyLine({ ledgerId: "", amount: "0.00" })).toBe(true);
    expect(isEmptyLine({ ledgerId: "x", amount: "" })).toBe(false);
    expect(isEmptyLine({ ledgerId: "", amount: "5" })).toBe(false);
    expect(isEmptyLine({ ledgerId: "", amount: "abc" })).toBe(false);
  });
});
