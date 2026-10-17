import { describe, expect, it } from "vitest";
import { aTender, aTenderMaster } from "./fixtures";
import {
  applySurcharge,
  forBillsTotal,
  grossFor,
  surchargeOn,
  surchargeTermsOf,
  surchargeTotal,
  typedAmountOf,
  type SurchargeTerms,
} from "./surcharge";
import { toPaise } from "./money";

const UPI_1PC: SurchargeTerms = { perc: 1, flat: 0, editable: false };
const FLAT_5: SurchargeTerms = { perc: 0, flat: 5, editable: false };

describe("surchargeTermsOf", () => {
  it("is null for a tender that charges nothing", () => {
    expect(surchargeTermsOf(aTenderMaster())).toBeNull();
    expect(surchargeTermsOf(null)).toBeNull();
  });

  it("reads the percentage, the flat figure and the edit flag", () => {
    expect(
      surchargeTermsOf(
        aTenderMaster({ tndSurchargePerc: 1.5, tndSurchargeAmount: 3, tndEditSurcharge: true }),
      ),
    ).toEqual({ perc: 1.5, flat: 3, editable: true });
  });

  it("coerces a NUMERIC that arrived as a string", () => {
    const master = aTenderMaster({
      tndSurchargePerc: "2" as unknown as number,
      tndSurchargeAmount: "0.00" as unknown as number,
    });
    expect(surchargeTermsOf(master)).toEqual({ perc: 2, flat: 0, editable: false });
  });
});

describe("surchargeOn — the server's own figure", () => {
  it("takes the percentage INSIDE the gross amount (notes 127 §4)", () => {
    // receipt-lines.ts: amount × perc / (100 + perc) — 202 at 1% is 2.00,
    // not 202 × 1% = 2.02.
    expect(surchargeOn(UPI_1PC, 202)).toBe(2);
    expect(surchargeOn({ perc: 2, flat: 0, editable: false }, 5100)).toBe(100);
  });

  it("rounds half-up on the exact decimal, as Prisma's Decimal does", () => {
    // The server's own spec: 1000 × 2 / 102 = 19.6078…, 101.50 × 1.5 / 101.5 = 1.50.
    expect(surchargeOn({ perc: 2, flat: 0, editable: false }, 1000)).toBe(19.61);
    expect(surchargeOn({ perc: 1.5, flat: 0, editable: false }, 101.5)).toBe(1.5);
    // 91.91 at 4% — 91.91 × 4 / 104 = 3.535 exactly. A double makes it
    // 3.53499…, which rounds to 3.53 and is a paisa short of the line the
    // server seeds.
    expect(surchargeOn({ perc: 4, flat: 0, editable: false }, 91.91)).toBe(3.54);
    expect(surchargeOn({ perc: 1.25, flat: 0, editable: false }, 202.5)).toBe(2.5);
  });

  it("charges the flat figure only when there is no percentage", () => {
    expect(surchargeOn(FLAT_5, 10)).toBe(5);
    expect(surchargeOn({ perc: 1, flat: 5, editable: false }, 1010)).toBe(10);
  });

  it("charges nothing on nothing", () => {
    expect(surchargeOn(UPI_1PC, 0)).toBe(0);
    expect(surchargeOn(FLAT_5, -10)).toBe(0);
    expect(surchargeOn(null, 500)).toBe(0);
  });
});

describe("grossFor — what to collect so the bills get what was typed", () => {
  it("makes 200 at 1% into 202.00, surcharge 2.00 (the Qt case, as on the bill)", () => {
    const gross = grossFor(UPI_1PC, 200);
    expect(gross).toBe(202);
    expect(surchargeOn(UPI_1PC, gross)).toBe(2);
  });

  it("makes 1,000 at 1% into 1,010.00, surcharge 10.00", () => {
    expect(grossFor(UPI_1PC, 1000)).toBe(1010);
    expect(surchargeOn(UPI_1PC, 1010)).toBe(10);
  });

  it("leaves exactly the typed figure for the bills, paisa for paisa", () => {
    for (const perc of [0.5, 1, 1.75, 2, 3.333, 18, 100]) {
      const terms: SurchargeTerms = { perc, flat: 0, editable: false };
      for (let paise = 1; paise <= 500_000; paise += 1_237) {
        const forBills = paise / 100;
        const gross = grossFor(terms, forBills);
        expect(toPaise(gross) - toPaise(surchargeOn(terms, gross))).toBe(paise);
      }
    }
  });

  it("adds a flat surcharge on top", () => {
    expect(grossFor(FLAT_5, 200)).toBe(205);
    expect(surchargeOn(FLAT_5, 205)).toBe(5);
  });

  it("leaves a zero, a negative and an uncharged tender alone", () => {
    expect(grossFor(UPI_1PC, 0)).toBe(0);
    expect(grossFor(UPI_1PC, -5)).toBe(-5);
    expect(grossFor(null, 200)).toBe(200);
  });

  it("doubles the figure on a 100% master (half the gross is surcharge)", () => {
    // The old `forBills / (1 − p)` divided by zero here; on top, it is plain.
    expect(grossFor({ perc: 100, flat: 0, editable: false }, 200)).toBe(400);
  });
});

describe("applySurcharge — a row's four money fields", () => {
  it("takes the typed figure as what goes to the bills and grosses it up", () => {
    const row = applySurcharge(aTender(), UPI_1PC, 200);
    expect(row).toMatchObject({
      amount: 202,
      forBills: 200,
      surchargeAmt: 2,
      sendSurcharge: false,
    });
  });

  it("sends the figure only where the master lets it be edited", () => {
    const row = applySurcharge(aTender(), { ...UPI_1PC, editable: true }, 200);
    expect(row.sendSurcharge).toBe(true);
  });

  it("keeps the figure for the bills when the row moves tender", () => {
    const upi = applySurcharge(aTender(), UPI_1PC, 200);
    const backOnCash = applySurcharge(upi, null);
    expect(backOnCash).toMatchObject({
      amount: 200,
      forBills: 200,
      surchargeAmt: 0,
      sendSurcharge: false,
    });
    expect(applySurcharge(backOnCash, UPI_1PC).amount).toBe(202);
  });

  it("falls back on the amount when nothing was typed yet", () => {
    // A row carried over without a figure for the bills — Qt's
    // `if (t.forBills <= kEpsilon) t.forBills = t.amount`.
    const row = { ...aTender({ amount: 300 }), forBills: 0 };
    expect(applySurcharge(row, UPI_1PC).forBills).toBe(300);
    expect(typedAmountOf(row)).toBe(300);
  });
});

describe("the totals", () => {
  it("sums the surcharge and the figures for the bills in paise", () => {
    const tenders = [
      aTender({ amount: 100 }),
      applySurcharge(aTender(), UPI_1PC, 200),
      applySurcharge(aTender(), UPI_1PC, 100.5),
    ];
    // 100.50 at 1% grosses to 101.51 (surcharge 1.01).
    expect(surchargeTotal(tenders)).toBe(3.01);
    expect(forBillsTotal(tenders)).toBe(400.5);
  });

  it("reads a row with no surcharge fields as charging nothing", () => {
    // Bill-wise Payment shares the row shape and never sets them.
    expect(surchargeTotal([{ surchargeAmt: undefined }])).toBe(0);
    expect(forBillsTotal([{ amount: 50, forBills: undefined }])).toBe(50);
  });
});
