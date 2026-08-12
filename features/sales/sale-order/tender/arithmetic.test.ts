/**
 * Sale Order — tender arithmetic golden cases (the plan's §12), written before
 * the dialog renders. Every case that names money is exact.
 */
import { describe, expect, it } from "vitest";
import {
  computeTenders,
  netSettledOf,
  payStatusOf,
  rowExceedsDocument,
  surchargeOf,
  type TenderArithRow,
} from "./arithmetic";
import { cardLast4OrNull, isPdc } from "./instruments";

const NO_FEE = { perc: 0, flat: 0 };

function row(key: string, keyed: number, overrides: Partial<TenderArithRow> = {}): TenderArithRow {
  return { key, keyed, allowChange: false, surcharge: NO_FEE, ...overrides };
}

describe("computeTenders — settlement", () => {
  it("bill 6,300 = cash 100 + card 1,000 + UPI 700 + cheque 4,500 → balance 0", () => {
    const result = computeTenders(
      [
        row("cash", 100, { allowChange: true }),
        row("card", 1000),
        row("upi", 700),
        row("cheque", 4500),
      ],
      6300,
    );
    expect(result.totals.tendered).toBe(6300);
    expect(result.totals.surcharge).toBe(0);
    expect(result.totals.change).toBe(0);
    expect(result.totals.settled).toBe(6300);
    expect(result.totals.balance).toBe(0);
    expect(payStatusOf(result.totals.settled, 6300)).toBe("PAID");
    // Instrument facts that ride with this case: the cheque is the PDC when its
    // date is past the order's, and it never carries a card number.
    expect(isPdc("2026-09-01", "2026-08-11")).toBe(true);
    expect(isPdc("2026-08-11", "2026-08-11")).toBe(false);
    expect(cardLast4OrNull(null)).toBeNull();
    expect(cardLast4OrNull("")).toBeNull();
  });

  it("order 1,500 = cash 100 + UPI 1,400 with a 14 fee → tendered 1,514, settled 1,500, PAID", () => {
    const result = computeTenders(
      [
        row("cash", 100, { allowChange: true }),
        row("upi", 1400, { surcharge: { perc: 1, flat: 0 } }),
      ],
      1500,
    );
    expect(result.totals.tendered).toBe(1514);
    expect(result.totals.surcharge).toBe(14);
    expect(result.totals.settled).toBe(1500);
    expect(result.totals.balance).toBe(0);
    expect(payStatusOf(result.totals.settled, 1500)).toBe("PAID");
  });

  it("is NOT PAID when the fee is the only thing closing the gap", () => {
    // Document 1,514; keyed 1,500; the 14 fee takes the gross to 1,514 — but
    // the fee is the company's income, not the customer's money against the
    // order, so the net says PARTIAL.
    const result = computeTenders(
      [row("cash", 100, { allowChange: true }), row("upi", 1400, { surcharge: { perc: 1, flat: 0 } })],
      1514,
    );
    expect(result.totals.tendered).toBe(1514);
    expect(result.totals.settled).toBe(1500);
    expect(result.totals.balance).toBe(-14);
    expect(payStatusOf(result.totals.settled, 1514)).toBe("PARTIAL");
  });

  it("a card settling a full bill with a fee is not refused (the ported Qt bug)", () => {
    // Bill 6,300 settled by one card whose 1% fee makes the gross 6,363. The Qt
    // ceiling compared 6,363 > 6,300 and refused; the base comparison passes.
    expect(rowExceedsDocument(6300, 0, 6300, "settlement")).toBe(false);
    // A base genuinely past the document is still refused.
    expect(rowExceedsDocument(6301, 0, 6300, "settlement")).toBe(true);
    // And a second row is judged against what the first left over.
    expect(rowExceedsDocument(301, 6000, 6300, "settlement")).toBe(true);
    expect(rowExceedsDocument(300, 6000, 6300, "settlement")).toBe(false);
  });

  it("hands change back out of the cash row only", () => {
    // Customer hands 2,000 cash against a 1,500 bill: change 500, and the
    // stored row settles 1,500 (base), received 2,000.
    const result = computeTenders([row("cash", 2000, { allowChange: true })], 1500);
    const cash = result.rows[0];
    expect(cash.base).toBe(1500);
    expect(cash.change).toBe(500);
    expect(cash.received).toBe(2000);
    expect(cash.total).toBe(1500);
    expect(result.totals.settled).toBe(1500);
    expect(result.totals.balance).toBe(0);
  });

  it("never takes change out of a no-change row", () => {
    // A card cannot hand money back: the overpayment stays on the row and the
    // balance goes positive for the validator to refuse.
    const result = computeTenders([row("card", 2000)], 1500);
    expect(result.rows[0].change).toBe(0);
    expect(result.totals.settled).toBe(2000);
    expect(result.totals.balance).toBe(500);
  });

  it("computes the surcharge on the settled base, not on money handed back", () => {
    // 2,000 keyed on a fee-carrying row with change due: the fee applies to the
    // 1,500 that settles, never to the 500 that went straight back.
    const result = computeTenders(
      [row("cash", 2000, { allowChange: true, surcharge: { perc: 2, flat: 0 } })],
      1500,
    );
    expect(result.rows[0].surcharge).toBe(30); // 2% of 1,500 — not of 2,000
    expect(result.rows[0].total).toBe(1530);
    expect(result.rows[0].received).toBe(2030);
  });
});

describe("computeTenders — advance", () => {
  it("order 50,000, advance 5,000 → saves, PARTIAL, no full-settlement gate", () => {
    const result = computeTenders([row("cash", 5000, { allowChange: true })], 50000);
    expect(result.totals.settled).toBe(5000);
    expect(result.totals.balance).toBe(-45000);
    expect(payStatusOf(result.totals.settled, 50000)).toBe("PARTIAL");
    // No per-row ceiling in advance mode: any deposit is legal.
    expect(rowExceedsDocument(60000, 0, 50000, "advance")).toBe(false);
  });

  it("no tender at all is UNPAID", () => {
    const result = computeTenders([], 50000);
    expect(result.totals.settled).toBe(0);
    expect(payStatusOf(result.totals.settled, 50000)).toBe("UNPAID");
  });
});

describe("surchargeOf", () => {
  it("combines percent and flat, and charges nothing on a zero base", () => {
    expect(surchargeOf(1000, { perc: 1, flat: 5 })).toBe(15);
    expect(surchargeOf(0, { perc: 1, flat: 5 })).toBe(0);
    expect(surchargeOf(1400, { perc: 1, flat: 0 })).toBe(14);
  });
});

describe("netSettledOf", () => {
  it("re-derives the net on load: tender − surcharge − refund", () => {
    // There is no so_paid_amt column, so a loaded order's net comes from the
    // three roll-ups it does have.
    expect(netSettledOf(1514, 14, 0)).toBe(1500);
    expect(netSettledOf(1514, 14, 200)).toBe(1300);
  });
});

describe("cardLast4OrNull", () => {
  it("keeps exactly four digits and nulls everything else", () => {
    expect(cardLast4OrNull("4242")).toBe("4242");
    expect(cardLast4OrNull("4111 1111 1111 4242")).toBe("4242");
    expect(cardLast4OrNull("42")).toBeNull();
    expect(cardLast4OrNull("no digits")).toBeNull();
  });
});
