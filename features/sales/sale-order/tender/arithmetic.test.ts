/**
 * Sale Order — tender arithmetic golden cases (the plan's §12), written before
 * the dialog renders. Every case that names money is exact.
 */
import { describe, expect, it } from "vitest";
import {
  computeTenders,
  givesChange,
  netSettledOf,
  payBalanceWithRow,
  payStatusOf,
  presentBalance,
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
    expect(result.totals.surchargeTotal).toBe(0);
    expect(result.totals.refund).toBe(0);
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
    expect(result.totals.surchargeTotal).toBe(14);
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

  it("a card settling a full bill with a fee leaves the balance square", () => {
    // Bill 6,300 settled by one card whose 1% fee makes the gross 6,363. The
    // balance nets the fee back out, so the document IS covered — the per-row
    // ceiling that judged the gross (and refused this) lives in validate.ts and
    // is judged on the base.
    const result = computeTenders([row("card", 6300, { surcharge: { perc: 1, flat: 0 } })], 6300);
    expect(result.rows[0].amount).toBe(6363);
    expect(result.rows[0].surchargeAmt).toBe(63);
    expect(result.totals.tendered).toBe(6363);
    expect(result.totals.settled).toBe(6300);
    expect(result.totals.balance).toBe(0);
    expect(presentBalance(result.totals.balance, "settlement").tone).toBe("settled");
  });

  it("hands change back out of the cash row only", () => {
    // Customer hands 2,000 cash against a 1,500 bill: change 500, and the
    // stored row settles 1,500 (base), received 2,000.
    const result = computeTenders([row("cash", 2000, { allowChange: true })], 1500);
    const cash = result.rows[0];
    expect(cash.base).toBe(1500);
    expect(cash.refundAmt).toBe(500);
    expect(cash.received).toBe(2000);
    expect(cash.amount).toBe(1500);
    expect(result.totals.settled).toBe(1500);
    expect(result.totals.balance).toBe(0);
  });

  it("change comes out of the first change-capable row (§11)", () => {
    // Cash 100 + cash 3,000 against a 1,500 bill: the first row can only give
    // its own 100 back, so the rest comes off the second — never driving a
    // base negative, which "all of it out of the first" would.
    const result = computeTenders(
      [row("cash1", 100, { allowChange: true }), row("cash2", 3000, { allowChange: true })],
      1500,
    );
    expect(result.rows[0].refundAmt).toBe(100);
    expect(result.rows[0].base).toBe(0);
    expect(result.rows[1].refundAmt).toBe(1500);
    expect(result.rows[1].base).toBe(1500);
    expect(result.totals.settled).toBe(1500);
  });

  it("CASH always gives change, whatever the master says", () => {
    expect(givesChange(false, "CASH")).toBe(true);
    expect(givesChange(false, "CARD")).toBe(false);
    expect(givesChange(true, "CARD")).toBe(true);
  });

  it("never takes change out of a no-change row", () => {
    // A card cannot hand money back: the overpayment stays on the row and the
    // balance goes positive for the validator to refuse.
    const result = computeTenders([row("card", 2000)], 1500);
    expect(result.rows[0].refundAmt).toBe(0);
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
    expect(result.rows[0].surchargeAmt).toBe(30); // 2% of 1,500 — not of 2,000
    expect(result.rows[0].amount).toBe(1530);
    expect(result.rows[0].received).toBe(2030);
  });
});

describe("computeTenders — advance", () => {
  it("order 50,000, advance 5,000 → saves, PARTIAL, no full-settlement gate", () => {
    const result = computeTenders([row("cash", 5000, { allowChange: true })], 50000);
    expect(result.totals.settled).toBe(5000);
    expect(result.totals.balance).toBe(-45000);
    expect(payStatusOf(result.totals.settled, 50000)).toBe("PARTIAL");
    // A shortfall on an advance is the NORMAL case: amber "to collect", never
    // the red of a bill that has not been settled.
    const balance = presentBalance(result.totals.balance, "advance");
    expect(balance).toEqual({ tone: "short", caption: "Balance to Collect", value: 45000 });
    expect(presentBalance(result.totals.balance, "settlement").caption).toBe("Balance");
  });

  it("no tender at all is UNPAID", () => {
    const result = computeTenders([], 50000);
    expect(result.totals.settled).toBe(0);
    expect(payStatusOf(result.totals.settled, 50000)).toBe("UNPAID");
  });

  it("a deposit on an order with no lines yet settles in full — it is not change", () => {
    // The counter takes 5,000 before the goods are keyed. With no document
    // value there is nothing to overpay, so the money must NOT be handed back
    // as change (which would settle 0 and lose the deposit).
    const result = computeTenders([row("cash", 5000, { allowChange: true })], 0);
    expect(result.rows[0].base).toBe(5000);
    expect(result.rows[0].refundAmt).toBe(0);
    expect(result.rows[0].amount).toBe(5000);
    expect(result.totals.settled).toBe(5000);
    // And an unpriced document can never read as paid.
    expect(payStatusOf(result.totals.settled, 0)).toBe("PARTIAL");
  });

  it("once the lines land, the same deposit is re-judged against the real total", () => {
    // 5,000 taken up front, order then comes to 1,500: the excess becomes
    // change on the cash row and the order settles at its own value.
    const deposit = row("cash", 5000, { allowChange: true });
    expect(computeTenders([deposit], 0).totals.settled).toBe(5000);
    const priced = computeTenders([deposit], 1500);
    expect(priced.rows[0].base).toBe(1500);
    expect(priced.rows[0].refundAmt).toBe(3500);
    expect(priced.totals.settled).toBe(1500);
    expect(payStatusOf(priced.totals.settled, 1500)).toBe("PAID");
  });
});

describe("surchargeOf", () => {
  it("combines percent and flat, and charges nothing on a zero base", () => {
    expect(surchargeOf(1000, { perc: 1, flat: 5 })).toBe(15);
    expect(surchargeOf(0, { perc: 1, flat: 5 })).toBe(0);
    expect(surchargeOf(1400, { perc: 1, flat: 0 })).toBe(14);
  });
});

describe("presentBalance", () => {
  it("one box, three states, and the caption changes with it", () => {
    expect(presentBalance(0, "settlement")).toEqual({
      tone: "settled",
      caption: "Refund",
      value: 0,
    });
    expect(presentBalance(250, "settlement")).toEqual({
      tone: "over",
      caption: "Refund",
      value: 250,
    });
    expect(presentBalance(-250, "settlement")).toEqual({
      tone: "short",
      caption: "Balance",
      value: 250,
    });
  });
});

describe("payBalanceWithRow (F1)", () => {
  it("settles the outstanding balance with the row under the cursor", () => {
    // 1,500 order, 400 already keyed here → balance −1,100, so F1 takes the row
    // to 1,500.
    expect(payBalanceWithRow(400, -1100)).toBe(1500);
  });

  it("does nothing when nothing is outstanding", () => {
    expect(payBalanceWithRow(1500, 0)).toBe(1500);
    expect(payBalanceWithRow(1500, 250)).toBe(1500);
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
