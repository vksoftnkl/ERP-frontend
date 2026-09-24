import { describe, expect, it } from "vitest";
import { agreement, isBlankBill, partyNet, toPaise, totals } from "./derived";
import type { BillRow, LedgerRow, TrialBalance } from "./opening-balance.types";
import { blankBillRow, blankLedgerRow } from "./wire/parse";

function ledger(partial: Partial<LedgerRow>): LedgerRow {
  return { ...blankLedgerRow(), ledId: "led", ledName: "Ledger", ...partial };
}

function bill(partial: Partial<BillRow>): BillRow {
  return { ...blankBillRow(), ablId: "abl", docRefno: "X/1", amount: 1, ...partial };
}

describe("partyNet — a bill-wise party opens at the NET", () => {
  it("nets opposite sides rather than summing them", () => {
    // Verified live: 5,000 DR + 3,000 CR opens the party at 2,000 D, not 8,000.
    const net = partyNet([
      bill({ drCr: "Dr", amount: 5000 }),
      bill({ drCr: "Cr", amount: 3000 }),
    ]);
    expect(net).toEqual({ amount: 2000, side: "Dr" });
  });

  it("lands on the credit side when the credits win", () => {
    expect(
      partyNet([bill({ drCr: "Dr", amount: 1000 }), bill({ drCr: "Cr", amount: 3000 })]),
    ).toEqual({ amount: 2000, side: "Cr" });
  });

  it("has no side at all with no bills", () => {
    expect(partyNet([])).toEqual({ amount: 0, side: "" });
    // The trailing blank row is not a bill.
    expect(partyNet([blankBillRow()])).toEqual({ amount: 0, side: "" });
  });

  it("nets to nothing when the two sides cancel", () => {
    expect(
      partyNet([bill({ drCr: "Dr", amount: 2500 }), bill({ drCr: "Cr", amount: 2500 })]),
    ).toEqual({ amount: 0, side: "" });
  });
});

describe("totals — computed in paise, compared exactly", () => {
  it("balances figures that float-point arithmetic would not", () => {
    // 0.1 + 0.2 !== 0.3 in a double. In paise it is 10 + 20 === 30.
    const result = totals([
      ledger({ key: "a", ledId: "a", amount: 0.1, drCr: "Dr" }),
      ledger({ key: "b", ledId: "b", amount: 0.2, drCr: "Dr" }),
      ledger({ key: "c", ledId: "c", amount: 0.3, drCr: "Cr" }),
    ]);
    expect(result.isBalanced).toBe(true);
    expect(result.differencePaise).toBe(0);
  });

  it("counts a bill-wise row at its mirrored net", () => {
    const result = totals([
      ledger({ key: "a", ledId: "a", amount: 350000, drCr: "Cr" }),
      // The reducer keeps this equal to partyNet(bills); the totals just read it.
      ledger({ key: "p", ledId: "p", isBillWise: true, amount: 2000, drCr: "Dr" }),
      ledger({ key: "b", ledId: "b", amount: 348000, drCr: "Dr" }),
    ]);
    expect(result.debit).toBe(350000);
    expect(result.credit).toBe(350000);
    expect(result.isBalanced).toBe(true);
  });

  it("skips the trailing blank row and any row with no side", () => {
    const result = totals([
      ledger({ key: "a", ledId: "a", amount: 100, drCr: "Dr" }),
      ledger({ key: "n", ledId: "n", amount: 100, drCr: "" }),
      blankLedgerRow(),
    ]);
    expect(result.debit).toBe(100);
    expect(result.credit).toBe(0);
  });

  it("reports the difference SIGNED, so it says which side is short", () => {
    const result = totals([
      ledger({ key: "a", ledId: "a", amount: 1000, drCr: "Dr" }),
      ledger({ key: "b", ledId: "b", amount: 600, drCr: "Cr" }),
    ]);
    expect(result.difference).toBe(400);
  });
});

describe("agreement with the server", () => {
  const server: TrialBalance = {
    totalDebit: 1000,
    totalCredit: 1000,
    difference: 0,
    isBalanced: true,
    unmappedCount: 0,
    differenceLedgerId: null,
    differenceLedgerName: null,
  };

  it("agrees when the two figures match", () => {
    const own = totals([
      ledger({ key: "a", ledId: "a", amount: 1000, drCr: "Dr" }),
      ledger({ key: "b", ledId: "b", amount: 1000, drCr: "Cr" }),
    ]);
    expect(agreement(own, server, false).kind).toBe("agrees");
  });

  it("explains a difference while work is unsaved", () => {
    const own = totals([ledger({ key: "a", ledId: "a", amount: 1500, drCr: "Dr" })]);
    expect(agreement(own, server, true).kind).toBe("unsaved");
  });

  it("calls a difference with nothing unsaved what it is: a bug", () => {
    const own = totals([ledger({ key: "a", ledId: "a", amount: 1500, drCr: "Dr" })]);
    expect(agreement(own, server, false).kind).toBe("disagrees");
  });
});

describe("blank rows", () => {
  it("treats a row the server sent as real however empty it looks", () => {
    expect(isBlankBill(blankBillRow())).toBe(true);
    expect(isBlankBill({ ...blankBillRow(), ablId: "abl-1" })).toBe(false);
  });
});

describe("toPaise", () => {
  it("rounds to the paisa and survives a non-number", () => {
    expect(toPaise(2400.5)).toBe(240050);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(Number.NaN)).toBe(0);
  });
});
