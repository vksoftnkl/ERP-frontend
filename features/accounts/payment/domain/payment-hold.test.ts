import { describe, expect, it } from "vitest";
import { parsePayableBills } from "../payload/parse";
import type { PayableBillWire } from "../payment.types";
import { heldTypeLabel, holdTooltip, paymentHoldOf } from "./payment-hold";
import { aBill } from "./fixtures";

function wire(overrides: Partial<PayableBillWire> = {}): PayableBillWire {
  return {
    billId: "b-1",
    billAccYear: "2026-2027",
    billType: "PURCHASE",
    docRefno: "PUR/0001",
    usrRefno: "INV-9",
    docDate: "2026-10-01",
    dueDate: null,
    daysOverdue: 0,
    billAmount: 590,
    pendingAmount: 590,
    status: "OPEN",
    pdcHeld: 0,
    ppdSuggested: 0,
    ...overrides,
  } as PayableBillWire;
}

describe("payment hold (Qt 348957f)", () => {
  it("parses paymentHold off /open-items; null and absent read as not held", () => {
    const [held, plain, absent] = parsePayableBills([
      wire({ paymentHold: { reason: " Rate over PO " } }),
      wire({ billId: "b-2", paymentHold: null }),
      wire({ billId: "b-3" }),
    ]);
    expect(paymentHoldOf(held)).toEqual({ reason: "Rate over PO" });
    expect(paymentHoldOf(plain)).toBeNull();
    expect(paymentHoldOf(absent)).toBeNull();
  });

  it("a held reason of null still holds, with no reason", () => {
    const [held] = parsePayableBills([wire({ paymentHold: { reason: null } })]);
    expect(paymentHoldOf(held)).toEqual({ reason: "" });
    expect(holdTooltip({ reason: "" })).toBe(
      "Payment hold. Paying it needs the Override right on Purchase Entry (or release the hold there).",
    );
  });

  it("a row built elsewhere (memo, amend) is not held", () => {
    expect(paymentHoldOf(aBill())).toBeNull();
  });

  it("words the Type cell and its tooltip", () => {
    expect(heldTypeLabel("PURCHASE")).toBe("PURCHASE · ON HOLD");
    expect(heldTypeLabel("PURCHASE_BILL")).toBe("PURCHASE BILL · ON HOLD");
    expect(holdTooltip({ reason: "Rate 12.00 over PO 10.00" })).toBe(
      "Payment hold: Rate 12.00 over PO 10.00. Paying it needs the Override right on Purchase Entry (or release the hold there).",
    );
  });

  it("a cell edit keeps the hold (rows are spread, not rebuilt)", async () => {
    const { setPaymentBillCell } = await import("./bill-cells");
    const [held] = parsePayableBills([wire({ paymentHold: { reason: "R" } })]);
    const { bill } = setPaymentBillCell(held, "receive", 100);
    expect(paymentHoldOf(bill)).toEqual({ reason: "R" });
  });
});
