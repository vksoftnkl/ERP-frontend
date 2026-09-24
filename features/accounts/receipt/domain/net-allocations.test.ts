import { describe, expect, it } from "vitest";
import { netAllocations, netCreditsApplied } from "./net-allocations";
import type { ReceiptAllocationWire } from "../receipt.types";

function row(partial: Partial<ReceiptAllocationWire>): ReceiptAllocationWire {
  return {
    abjId: "abj",
    billId: "bill-1",
    billAccYear: "2026-2027",
    docRefno: "INV/1",
    docDate: "2026-09-01",
    billType: "SALES",
    billAmount: 10000,
    pendingAmount: 0,
    dueDate: null,
    status: "CLOSED",
    adjType: "ALLOCATION",
    settlementMode: "CASH",
    drCr: "CR",
    amount: 0,
    adjDate: "2026-09-18",
    isPostDated: false,
    matured: true,
    voucherId: "vch",
    chequeId: null,
    againstBillId: null,
    againstBillRefno: null,
    reversalOfId: null,
    isReversed: false,
    approvedBy: null,
    remarks: null,
    ...partial,
  };
}

describe("netting a posted receipt's history", () => {
  it("nets an amended bill to ONE row, not three", () => {
    // The original, its reversal and the replacement all come back. Painted
    // row by row this bill appeared three times, once with −2,000 in an
    // editable Receive cell.
    const rows = netAllocations([
      row({ amount: 2000 }),
      row({ amount: -2000, reversalOfId: "abj", isReversed: false }),
      row({ amount: 3000 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].receive).toBe(3000);
  });

  it("sums rather than filtering on isReversed, so a PARTIAL reversal survives", () => {
    const rows = netAllocations([
      row({ amount: 2000, isReversed: true }),
      row({ amount: -500, reversalOfId: "abj" }),
    ]);
    expect(rows[0].receive).toBe(1500);
  });

  it("routes each adjustment type into its own column", () => {
    const rows = netAllocations([
      row({ amount: 900, adjType: "ALLOCATION" }),
      row({ amount: 50, adjType: "DISCOUNT" }),
      row({ amount: 40, adjType: "WRITEOFF" }),
      row({ amount: 0.4, adjType: "ROUND_OFF" }),
      row({ amount: 100, adjType: "ADVANCE_ADJUST" }),
    ]);
    expect(rows[0]).toMatchObject({
      receive: 1000,
      discount: 50,
      writeOff: 40,
      roundOff: 0.4,
    });
  });

  it("skips a type it does not know rather than calling it money", () => {
    const rows = netAllocations([
      row({ amount: 900 }),
      row({ amount: 75, adjType: "SOMETHING_NEW" as never }),
    ]);
    expect(rows[0].receive).toBe(900);
  });

  it("adds the settlement back so the bill reads as it STOOD", () => {
    // 5,380 pending now, 2,000 of it settled by this receipt.
    const rows = netAllocations([row({ amount: 2000, pendingAmount: 5380 })]);
    expect(rows[0].pendingAmount).toBe(7380);
  });

  it("does NOT add back a post-dated settlement — the bill never moved", () => {
    // rct00018: 800 post-dated against a bill showing 5,380. A blind add-back
    // paints 6,180, a figure that bill has never carried.
    const rows = netAllocations([
      row({ amount: 800, pendingAmount: 5380, isPostDated: true, matured: false }),
    ]);
    expect(rows[0].pendingAmount).toBe(5380);
    expect(rows[0].pdcHeld).toBe(800);
  });

  it("treats an absent `matured` as matured", () => {
    const { matured, ...rest } = row({ amount: 800, pendingAmount: 5380 });
    void matured;
    const rows = netAllocations([rest as ReceiptAllocationWire]);
    expect(rows[0].pendingAmount).toBe(6180);
  });

  it("drops a bill a correction emptied", () => {
    const rows = netAllocations([
      row({ amount: 2000 }),
      row({ amount: -2000, reversalOfId: "abj" }),
    ]);
    expect(rows).toHaveLength(0);
  });

  it("keeps the order the server first mentions each bill", () => {
    const rows = netAllocations([
      row({ billId: "b2", docRefno: "INV/2", amount: 100 }),
      row({ billId: "b1", docRefno: "INV/1", amount: 100 }),
      row({ billId: "b2", docRefno: "INV/2", amount: 50 }),
    ]);
    expect(rows.map((bill) => bill.docRefno)).toEqual(["INV/2", "INV/1"]);
  });

  it("marks every loaded figure as typed, so an amend does not rearrange it", () => {
    expect(netAllocations([row({ amount: 2000 })])[0].receiveTyped).toBe(true);
  });
});

describe("netting the credits a receipt spent", () => {
  it("reads the CREDIT out of againstBillId on a posted receipt", () => {
    const rows = netCreditsApplied(
      [
        row({
          billId: "invoice",
          docRefno: "INV/9",
          againstBillId: "credit",
          againstBillRefno: "ADV/3",
          amount: 4000,
          adjType: "ADVANCE_ADJUST",
        }),
      ],
      false,
    );
    expect(rows).toEqual([
      { billId: "credit", billAccYear: "2026-2027", docRefno: "ADV/3", amount: 4000 },
    ]);
  });

  it("reads it out of billId on a draft, where that is all the operator chose", () => {
    const rows = netCreditsApplied(
      [row({ billId: "credit", docRefno: "ADV/3", amount: 4000, abjId: null })],
      true,
    );
    expect(rows[0].billId).toBe("credit");
  });
});
