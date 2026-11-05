import { describe, expect, it } from "vitest";
import {
  INVOICE_QUICK_GROUPS,
  LAST_PURCHASES_REASON,
  invoiceAuditParts,
  invoiceQuickRules,
  printLastSavedQuestion,
  savedKeyOf,
  totalsFrameOf,
  type InvoiceQuickInput,
} from "./invoice-v2";

const BASE: InvoiceQuickInput = {
  status: "DRAFT",
  saved: false,
  editable: true,
  supplierId: "",
  mayStartNew: true,
  lastSavedRef: null,
  working: false,
};

const enabled = (input: InvoiceQuickInput) =>
  Object.entries(invoiceQuickRules(input))
    .filter(([, rule]) => !rule.disabled)
    .map(([key]) => key)
    .sort();

describe("the quick bar (Qt 7d8c926 applyStatus)", () => {
  it("has the .ui's 17 buttons in five groups", () => {
    expect(INVOICE_QUICK_GROUPS.map((group) => group.length)).toEqual([3, 2, 3, 2, 7]);
    expect(new Set(INVOICE_QUICK_GROUPS.flat()).size).toBe(17);
  });

  it("a new bill: lines come in, the document buttons wait for a save", () => {
    expect(enabled(BASE)).toEqual(["batches", "fromSource", "gstBreakup", "pickHeld", "sister", "transport"]);
    const rules = invoiceQuickRules(BASE);
    expect(rules.attach.disabledReason).toBe("save the bill first — files are kept with a saved bill");
    expect(rules.lastPurchases).toMatchObject({ disabled: true, disabledReason: LAST_PURCHASES_REASON });
  });

  it("a supplier brings the party's buttons; the bill just saved brings Print", () => {
    expect(enabled({ ...BASE, supplierId: "s1", lastSavedRef: "PUR/1" })).toEqual(
      ["batches", "fromSource", "gstBreakup", "ledger", "pickHeld", "print", "sister", "supplierDues", "transport"],
    );
  });

  it("a posted bill pays and returns, takes no lines", () => {
    expect(enabled({ ...BASE, status: "POSTED", saved: true, editable: false, supplierId: "s1" })).toEqual(
      ["attach", "batches", "gstBreakup", "history", "ledger", "next", "pay", "previous", "print", "returnBill", "returnLines", "supplierDues", "transport"],
    );
  });

  it("a cancelled bill keeps History, Print and Previous / Next (and its supplier's ledger)", () => {
    expect(enabled({ ...BASE, status: "CANCELLED", saved: true, editable: false, supplierId: "s1" })).toEqual(
      ["history", "ledger", "next", "previous", "print"],
    );
  });

  it("a stored draft opened read-only says Edit first; a running action holds every button", () => {
    expect(invoiceQuickRules({ ...BASE, saved: true, editable: false }).fromSource.disabledReason).toBe("the draft is open read-only — Edit (F2) first");
    expect(enabled({ ...BASE, working: true })).toEqual([]);
  });
});

describe("the created / modified line (Qt paintAudit)", () => {
  const me = { userId: "U-1", userName: "VKPOS" };
  it("names the signed-in user on their own stamp, else the time alone", () => {
    const parts = invoiceAuditParts(
      { createdBy: "u-1", createdOn: "2026-11-04T04:42:00Z", modifiedBy: "u-2", modifiedOn: "2026-11-04T05:01:00Z" },
      me,
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^Created VKPOS 04\/11\/2026 \d{2}:\d{2} (AM|PM)$/);
    expect(parts[1]).toMatch(/^Modified 04\/11\/2026 \d{2}:\d{2} (AM|PM)$/);
  });
  it("prefers the server's names; one stamp when never changed", () => {
    const at = "2026-11-04T04:42:00Z";
    const parts = invoiceAuditParts({ createdBy: "x", createdByName: "RAVI", createdOn: at, modifiedOn: at }, me);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatch(/^Created RAVI /);
    expect(invoiceAuditParts({}, me)).toEqual([]);
  });
});

describe("the totals frame (Qt paintTotals)", () => {
  it("shows dashes before any figure", () => {
    const frame = totalsFrameOf(null, false);
    expect([frame.net, frame.printed, frame.difference]).toEqual(["—", "—", null]);
    expect(frame.left.map((cell) => cell.caption)).toEqual(["Taxable", "CGST", "SGST", "Cess"]);
  });

  it("a local bill splits the charges' GST over CGST / SGST; the pills follow the credit", () => {
    const frame = totalsFrameOf(
      {
        taxable: "1000",
        cgst: "90",
        sgst: "90",
        cess: "0",
        chargeTax: "9.01",
        chargesOnBill: "50",
        roundOff: "-0.11",
        netPayable: "1239",
        invoiceAmountPrinted: "1239",
        difference: "0",
        amountMatches: true,
        itcEligible: "189.01",
        gstOnShort: "4.5",
        offbillCharges: "60",
        shortValue: "900",
      },
      false,
    );
    expect(frame.net).toBe("₹ 1,239.00");
    expect(frame.difference).toEqual({ text: "Difference  0.00 ✓", tone: "good" });
    expect(frame.left.map((cell) => [cell.caption, cell.value])).toEqual([
      ["Taxable", "1,000.00"],
      ["CGST", "94.51"],
      ["SGST", "94.50"],
      ["Cess", "0.00"],
    ]);
    expect(frame.itc.map((pill) => pill.text)).toEqual(["ITC  eligible 189.01", "pending 4.50 (short)"]);
    expect(frame.ownCosts).toBe("our own costs 60.00 · short parked 900.00");
  });

  it("an inter-state bill has one IGST row; a mismatch is a bad pill", () => {
    const frame = totalsFrameOf({ taxable: 100, igst: 18, chargeTax: 2, netPayable: 120, invoiceAmountPrinted: 125, difference: 5 }, true);
    expect(frame.left.map((cell) => [cell.caption, cell.value])).toEqual([
      ["Taxable", "100.00"],
      ["IGST", "20.00"],
      ["Cess", "0.00"],
    ]);
    expect(frame.difference).toEqual({ text: "Difference  5.00 ✗", tone: "bad" });
  });
});

describe("the bill just saved (D7, COM-10)", () => {
  it("keeps the answer's key, the session's scope where it says nothing", () => {
    expect(savedKeyOf({ piId: "p1", piRefno: "PUR/2026-2027/D8/00004", piStatus: "posted" }, { companyId: "c", branchId: "b", accYear: "2026-2027" })).toEqual({
      id: "p1",
      companyId: "c",
      branchId: "b",
      accYear: "2026-2027",
      refno: "PUR/2026-2027/D8/00004",
      status: "POSTED",
    });
    expect(savedKeyOf({ piId: "" }, { companyId: "c", branchId: "b", accYear: "y" })).toBeNull();
    expect(printLastSavedQuestion({ refno: "PUR/1" })).toBe("Print PUR/1 (just saved)?");
  });
});
