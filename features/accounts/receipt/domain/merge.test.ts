import { describe, expect, it } from "vitest";
import { mergeDraftMemo } from "./merge-draft";
import { mergeForAmend } from "./merge-amend";
import { aBill, aCredit } from "./fixtures";

describe("reopening a draft", () => {
  it("restores what still fits and marks it typed", () => {
    const bill = aBill({ billId: "b1", pendingAmount: 5000 });
    const result = mergeDraftMemo({
      bills: [bill],
      credits: [],
      memoBills: [{ billId: "b1", billAccYear: "2026-2027", amount: 3000, discount: 50 }],
      memoCredits: [],
    });
    expect(result.bills[0]).toMatchObject({ receive: 3000, discount: 50, receiveTyped: true });
    expect(result.notes).toHaveLength(0);
  });

  it("clamps MONEY FIRST when the bill has been part-paid since, and says so", () => {
    // 5,000 was left against it; 1,200 is all that is left of the bill.
    const result = mergeDraftMemo({
      bills: [aBill({ billId: "b1", docRefno: "INV/118", pendingAmount: 1200 })],
      credits: [],
      memoBills: [{ billId: "b1", billAccYear: "2026-2027", amount: 5000, discount: 100 }],
      memoCredits: [],
    });
    expect(result.bills[0].receive).toBe(1200);
    expect(result.bills[0].discount).toBe(0);
    expect(result.notes[0]).toContain("INV/118");
  });

  it("reports a bill that has closed and is no longer listed", () => {
    const result = mergeDraftMemo({
      bills: [],
      credits: [],
      memoBills: [{ billId: "gone", billAccYear: "2026-2027", amount: 800 }],
      memoCredits: [],
    });
    expect(result.notes[0]).toContain("closed since");
  });

  it("restores a remembered credit although no bill was remembered with it", () => {
    // Returning early on empty bills is how Qt made an applied credit come
    // back as zero.
    const result = mergeDraftMemo({
      bills: [],
      credits: [aCredit({ billId: "c1", pendingAmount: 4000 })],
      memoBills: [],
      memoCredits: [{ billId: "c1", amount: 4000 }],
    });
    expect(result.credits[0].apply).toBe(4000);
  });

  it("clamps a credit somebody else has since spent", () => {
    const result = mergeDraftMemo({
      bills: [],
      credits: [aCredit({ billId: "c1", docRefno: "ADV/2", pendingAmount: 1000 })],
      memoBills: [],
      memoCredits: [{ billId: "c1", amount: 4000 }],
    });
    expect(result.credits[0].apply).toBe(1000);
    expect(result.notes[0]).toContain("ADV/2");
  });
});

describe("beginning an amend", () => {
  it("adds this receipt's settlement back onto the open bill", () => {
    const result = mergeForAmend({
      openBills: [aBill({ billId: "b1", pendingAmount: 3000 })],
      openCredits: [],
      baseline: [aBill({ billId: "b1", pendingAmount: 5000, receive: 2000, receiveTyped: true })],
      baselineCredits: [],
      voucherId: "vch",
    });
    expect(result.bills[0].pendingAmount).toBe(5000);
    expect(result.bills[0].receive).toBe(2000);
  });

  it("appends a bill this receipt CLOSED, at the end and never sorted in", () => {
    const result = mergeForAmend({
      openBills: [aBill({ billId: "open", docRefno: "INV/2" })],
      openCredits: [],
      baseline: [
        aBill({ billId: "closed", docRefno: "INV/1", receive: 4000, receiveTyped: true }),
      ],
      baselineCredits: [],
      voucherId: "vch",
    });
    expect(result.bills.map((bill) => bill.docRefno)).toEqual(["INV/2", "INV/1"]);
    expect(result.bills[1].pendingAmount).toBe(4000);
  });

  it("does not offer this receipt's OWN leftover advance back to itself", () => {
    const result = mergeForAmend({
      openBills: [],
      openCredits: [
        aCredit({ billId: "own", srcDocId: "vch" }),
        aCredit({ billId: "other", srcDocId: "another" }),
      ],
      baseline: [],
      baselineCredits: [],
      voucherId: "vch",
    });
    expect(result.credits.map((credit) => credit.billId)).toEqual(["other"]);
  });

  it("puts a spent credit back before offering it again", () => {
    const result = mergeForAmend({
      openBills: [],
      openCredits: [aCredit({ billId: "c1", pendingAmount: 0 })],
      baseline: [],
      baselineCredits: [{ billId: "c1", billAccYear: "2026-2027", amount: 4000 }],
      voucherId: "vch",
    });
    expect(result.credits[0]).toMatchObject({ pendingAmount: 4000, apply: 4000 });
  });
});
