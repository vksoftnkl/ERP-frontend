import { describe, expect, it } from "vitest";
import { autoAllocate, clampBillCell, clampCreditCell, clearAllocations } from "./allocate";
import { computeIdentity } from "./identity";
import { aBill, aCredit, aLine, aTender } from "./fixtures";

describe("auto-allocate", () => {
  it("spends the credit before the cash", () => {
    // 12,000 owed, a 4,000 credit note held, 10,000 paid. The note is used,
    // the bill closes, and 2,000 is left over.
    const result = autoAllocate({
      bills: [aBill({ pendingAmount: 12000 })],
      credits: [aCredit({ pendingAmount: 4000 })],
      tenders: [aTender({ amount: 10000 })],
      otherLines: [],
    });
    expect(result.credits[0].apply).toBe(4000);
    expect(result.bills[0].receive).toBe(12000);
    expect(result.onAccount).toBe(2000);
  });

  it("fills the bills in the server's order and stops when the cash runs out", () => {
    const result = autoAllocate({
      bills: [
        aBill({ docRefno: "INV/1", pendingAmount: 5000 }),
        aBill({ docRefno: "INV/2", pendingAmount: 5000 }),
        aBill({ docRefno: "INV/3", pendingAmount: 5000 }),
      ],
      credits: [],
      tenders: [aTender({ amount: 7500 })],
      otherLines: [],
    });
    expect(result.bills.map((bill) => bill.receive)).toEqual([5000, 2500, 0]);
    expect(result.onAccount).toBe(0);
  });

  it("gives a deduction ROOM, not cash", () => {
    // 10,000 bill, 8,600 collected, 1,400 TDS withheld. The bill closes and
    // nothing is left on account — the bug was subtracting the TDS from the
    // cash, which leaves the bill short by 1,400 AND reports a 1,400 surplus.
    const result = autoAllocate({
      bills: [aBill({ pendingAmount: 10000 })],
      credits: [],
      tenders: [aTender({ amount: 8600 })],
      otherLines: [aLine("TDS_RECEIVABLE", { amount: 1400, settlesBill: true })],
    });
    expect(result.bills[0].receive).toBe(8600);
    expect(result.onAccount).toBe(0);
    const identity = computeIdentity({
      bills: result.bills,
      credits: result.credits,
      tenders: [aTender({ amount: 8600 })],
      otherLines: [aLine("TDS_RECEIVABLE", { amount: 1400, settlesBill: true })],
    });
    expect(identity.balances).toBe(true);
  });

  it("takes an addition out of the CASH before filling any bill", () => {
    // 5,000 bill plus 200 interest: 5,200 arrives but only 5,000 may be placed.
    const result = autoAllocate({
      bills: [aBill({ pendingAmount: 6000 })],
      credits: [],
      tenders: [aTender({ amount: 5200 })],
      otherLines: [aLine("INTEREST_INCOME", { amount: 200, settlesBill: false, drCr: "CR" })],
    });
    expect(result.bills[0].receive).toBe(5000);
  });

  it("works around a typed Receive and leaves its discount alone", () => {
    const typed = aBill({ docRefno: "INV/1", pendingAmount: 5000, receive: 1000, discount: 100, receiveTyped: true });
    const result = autoAllocate({
      bills: [typed, aBill({ docRefno: "INV/2", pendingAmount: 5000 })],
      credits: [],
      tenders: [aTender({ amount: 4000 })],
      otherLines: [],
    });
    expect(result.bills[0].receive).toBe(1000);
    expect(result.bills[0].discount).toBe(100);
    expect(result.bills[1].receive).toBe(3000);
  });

  it("does not spend a credit on a row the operator typed", () => {
    const result = autoAllocate({
      bills: [aBill({ pendingAmount: 5000, receive: 500, receiveTyped: true })],
      credits: [aCredit({ pendingAmount: 4000 })],
      tenders: [aTender({ amount: 500 })],
      otherLines: [],
    });
    expect(result.credits[0].apply).toBe(0);
  });

  it("leaves what no bill can take on account", () => {
    const result = autoAllocate({
      bills: [aBill({ pendingAmount: 1000 })],
      credits: [],
      tenders: [aTender({ amount: 2500 })],
      otherLines: [],
    });
    expect(result.onAccount).toBe(1500);
  });
});

describe("clear", () => {
  it("returns the discount to what the slabs suggested, not to zero", () => {
    const result = clearAllocations({
      bills: [aBill({ ppdSuggested: 120, discount: 0, receive: 900, receiveTyped: true })],
      credits: [aCredit({ apply: 400 })],
    });
    expect(result.bills[0].discount).toBe(120);
    expect(result.bills[0].receive).toBe(0);
    expect(result.bills[0].receiveTyped).toBe(false);
    expect(result.credits[0].apply).toBe(0);
  });
});

describe("the row cap", () => {
  it("gives back only the cell just typed", () => {
    // 5,000 pending with 4,900 already placed as discount and write-off.
    const bill = aBill({ docRefno: "INV/7", pendingAmount: 5000, discount: 400, writeOff: 100 });
    const clamped = clampBillCell(bill, "receive", 5400);
    expect(clamped.value).toBe(4500);
    expect(clamped.message).toContain("INV/7 has 5000.00 pending");
  });

  it("accepts a figure that exactly fills the row", () => {
    const bill = aBill({ pendingAmount: 5000, discount: 500 });
    expect(clampBillCell(bill, "receive", 4500)).toEqual({ value: 4500, message: null });
  });

  it("will not let a credit be spent twice", () => {
    const clamped = clampCreditCell(aCredit({ docRefno: "CN/2", pendingAmount: 4000 }), 6000);
    expect(clamped.value).toBe(4000);
    expect(clamped.message).toContain("cannot be spent twice");
  });
});
