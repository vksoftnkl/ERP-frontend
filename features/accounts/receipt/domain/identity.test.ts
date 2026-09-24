import { describe, expect, it } from "vitest";
import { balanceAfterReceipt, computeIdentity, netProfit, room, settled } from "./identity";
import { aBill, aCredit, aLine, aTender } from "./fixtures";

describe("the identity", () => {
  it("holds the worked example, with the TDS counted on BOTH sides", () => {
    // 70,000 received + 1,400 withheld + 4,000 credit = 70,750 allocated
    // + 4,650 on account, and the 1,400 is INSIDE the 70,750.
    const identity = computeIdentity({
      bills: [aBill({ pendingAmount: 70000, receive: 69350 })],
      credits: [aCredit({ pendingAmount: 4000, apply: 4000 })],
      tenders: [aTender({ amount: 70000 })],
      otherLines: [aLine("TDS_RECEIVABLE", { amount: 1400, settlesBill: true })],
    });
    expect(identity.received).toBe(70000);
    expect(identity.deductions).toBe(1400);
    expect(identity.creditsApplied).toBe(4000);
    expect(identity.allocated).toBe(70750);
    expect(identity.onAccount).toBe(4650);
    expect(identity.balances).toBe(true);
  });

  it("does not count a discount twice: the bill column already carries it", () => {
    // 1,000 bill, 950 received and 50 discounted. The DISCOUNT_ALLOWED line
    // exists so the left-hand side sees the 50; `settled()` already has it.
    const identity = computeIdentity({
      bills: [aBill({ pendingAmount: 1000, receive: 950, discount: 50 })],
      credits: [],
      tenders: [aTender({ amount: 950 })],
      otherLines: [aLine("DISCOUNT_ALLOWED", { amount: 50, settlesBill: true, seeded: true })],
    });
    expect(identity.allocated).toBe(1000);
    expect(identity.difference).toBe(0);
    expect(identity.balances).toBe(true);
  });

  it("leaves the MDR out of both sides — it is a split of the bank leg", () => {
    // 15,000 by card, the acquirer keeps 10. The customer still paid 15,000.
    const identity = computeIdentity({
      bills: [aBill({ pendingAmount: 15000, receive: 15000 })],
      credits: [],
      tenders: [aTender({ amount: 15000, mdrAmt: 10 })],
      otherLines: [aLine("BANK_CHARGES", { amount: 10, settlesBill: false, seeded: true })],
    });
    expect(identity.received).toBe(15000);
    expect(identity.deductions).toBe(0);
    expect(identity.additions).toBe(0);
    expect(identity.balances).toBe(true);
  });

  it("treats an addition as money on top, not as a settlement", () => {
    // 5,000 bill plus 200 interest collected: 5,200 arrives, 5,000 settles.
    const identity = computeIdentity({
      bills: [aBill({ pendingAmount: 5000, receive: 5000 })],
      credits: [],
      tenders: [aTender({ amount: 5200 })],
      otherLines: [aLine("INTEREST_INCOME", { amount: 200, settlesBill: false, drCr: "CR" })],
    });
    expect(identity.additions).toBe(200);
    expect(identity.onAccount).toBe(0);
    expect(identity.balances).toBe(true);
  });

  it("reports a deficit as a signed difference and refuses to balance", () => {
    const identity = computeIdentity({
      bills: [aBill({ pendingAmount: 5000, receive: 5000 })],
      credits: [],
      tenders: [aTender({ amount: 4000 })],
      otherLines: [],
    });
    expect(identity.difference).toBe(-1000);
    expect(identity.onAccount).toBe(0);
    expect(identity.balances).toBe(false);
  });

  it("stays exact over forty part-paise placements", () => {
    // The case doubles were wrong about: 0.005 left on each of forty rows.
    const bills = Array.from({ length: 40 }, () =>
      aBill({ pendingAmount: 100.01, receive: 100.01 }),
    );
    const identity = computeIdentity({
      bills,
      credits: [],
      tenders: [aTender({ amount: 4000.4 })],
      otherLines: [],
    });
    expect(identity.allocated).toBe(4000.4);
    expect(identity.balances).toBe(true);
  });
});

describe("the bill's own figures", () => {
  it("settles by all four columns and leaves the rest as room", () => {
    const bill = aBill({ pendingAmount: 1000, receive: 900, discount: 50, roundOff: 0.4 });
    expect(settled(bill)).toBe(950.4);
    expect(room(bill)).toBe(49.6);
  });

  it("keeps a null profit null — an OPENING bill was typed, not sold", () => {
    expect(netProfit(aBill({ billProfit: null, discount: 50 }))).toBeNull();
    expect(netProfit(aBill({ billProfit: 300, discount: 50, writeOff: 10 }))).toBe(240);
  });
});

describe("what the party owes afterwards", () => {
  it("ignores an applied credit — spending one moves nothing between us", () => {
    // The Qt formula subtracted Σ settled() and so shrank the balance by the
    // credit as well, which is money that was already ours to owe them.
    const identity = computeIdentity({
      bills: [aBill({ pendingAmount: 10000, receive: 10000 })],
      credits: [aCredit({ pendingAmount: 4000, apply: 4000 })],
      tenders: [aTender({ amount: 6000 })],
      otherLines: [],
    });
    expect(balanceAfterReceipt(25000, identity)).toBe(19000);
  });

  it("counts a settling deduction that has no bill column", () => {
    const identity = computeIdentity({
      bills: [aBill({ pendingAmount: 10000, receive: 8600 })],
      credits: [],
      tenders: [aTender({ amount: 8600 })],
      otherLines: [aLine("TDS_RECEIVABLE", { amount: 1400 })],
    });
    // 8,600 collected and 1,400 withheld: they owe 10,000 less.
    expect(balanceAfterReceipt(25000, identity)).toBe(15000);
  });

  it("says nothing at all until party-context has answered", () => {
    const identity = computeIdentity({ bills: [], credits: [], tenders: [], otherLines: [] });
    expect(balanceAfterReceipt(null, identity)).toBeNull();
  });
});
