import { describe, expect, it } from "vitest";
import type { BillRow, LedgerRow } from "./opening-balance.types";
import { validate } from "./validate";
import { blankBillRow, blankLedgerRow } from "./wire/parse";

function ledger(partial: Partial<LedgerRow>): LedgerRow {
  return { ...blankLedgerRow(), ledId: "led-1", ledName: "Cash in hand", ...partial };
}

function bill(partial: Partial<BillRow>): BillRow {
  return {
    ...blankBillRow(),
    ablId: "abl-1",
    docRefno: "INV/1",
    docDate: "2026-01-12",
    amount: 100,
    ...partial,
  };
}

describe("validate — ledgers", () => {
  it("names the ledger that has a figure but no side", () => {
    const problems = validate({
      rows: [ledger({ amount: 500, drCr: "" })],
      dirtyParties: [],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("Cash in hand");
  });

  it("says nothing about the trailing blank row", () => {
    expect(validate({ rows: [blankLedgerRow()], dirtyParties: [] })).toEqual([]);
  });

  it("does NOT treat an unbalanced set as a problem", () => {
    // A half-keyed opening is a normal state for an afternoon's work. The totals
    // band says so; the save goes through.
    const problems = validate({
      rows: [
        ledger({ ledId: "a", amount: 1000, drCr: "Dr" }),
        ledger({ ledId: "b", amount: 10, drCr: "Cr" }),
      ],
      dirtyParties: [],
    });
    expect(problems).toEqual([]);
  });
});

describe("validate — bills", () => {
  const party = (bills: BillRow[]) => [
    { partyId: "party-1", partyName: "Acme Traders", bills },
  ];

  it("catches a duplicate invoice number case-insensitively and trimmed", () => {
    // ux_abl_doc_refno would refuse the second one anyway — after the ledger
    // half of the save had already gone through.
    const problems = validate({
      rows: [],
      dirtyParties: party([
        bill({ ablId: "a", docRefno: "inv/1" }),
        bill({ ablId: "b", docRefno: " INV/1 " }),
      ]),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toContain("listed twice");
  });

  it("catches a due date before the invoice date", () => {
    const problems = validate({
      rows: [],
      dirtyParties: party([bill({ docDate: "2026-02-10", dueDate: "2026-01-10" })]),
    });
    expect(problems.map((problem) => problem.message)).toEqual([
      expect.stringContaining("due date is before"),
    ]);
  });

  it("insists on an invoice number and an invoice date", () => {
    const problems = validate({
      rows: [],
      dirtyParties: party([bill({ docRefno: "", docDate: "" })]),
    });
    expect(problems).toHaveLength(2);
    expect(problems[0].message).toContain("matched against");
    expect(problems[1].message).toContain("ageing measures from it");
  });

  it("refuses an amount of zero", () => {
    const problems = validate({
      rows: [],
      dirtyParties: party([bill({ amount: 0 })]),
    });
    expect(problems[0].message).toContain("more than zero");
  });

  it("ignores the trailing blank bill", () => {
    expect(validate({ rows: [], dirtyParties: party([blankBillRow()]) })).toEqual([]);
  });

  it("reports a problem in a dirty party that is NOT on screen", () => {
    // `billsByParty` survives navigating between parties precisely so that
    // editing A, clicking B and saving still saves — and still validates — A.
    const problems = validate({
      rows: [],
      dirtyParties: [
        { partyId: "a", partyName: "Party A", bills: [bill({ docRefno: "" })] },
        { partyId: "b", partyName: "Party B", bills: [bill({ ablId: "z" })] },
      ],
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].partyId).toBe("a");
  });
});
