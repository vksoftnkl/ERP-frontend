/** Qt `PurchaseLineMath` (NexERP dd59c2c) — the purchase line estimate, with the discount amounts and the extra disc. */
import { describe, expect, it } from "vitest";
import { calcPurchaseLine, r2, taxOn } from "./purchase-line-math";

describe("purchase line math", () => {
  it("rounds half-up to 2 places, symmetric around 0", () => {
    expect(r2(1.005)).toBe(1.01);
    expect(r2(-1.005)).toBe(-1.01);
    expect(r2(2.004)).toBe(2);
  });

  it("taxes CGST + SGST each rounded on its own, IGST once", () => {
    // 99.5 × 18 % / 2 = 8.955 → 8.96 twice
    expect(taxOn(99.5, 18)).toBe(17.92);
    expect(taxOn(99.5, 18, true)).toBe(17.91);
    expect(taxOn(0, 18)).toBe(0);
    expect(taxOn(100, 0)).toBe(0);
  });

  it("takes the disc % first, the scheme off the discounted value", () => {
    const out = calcPurchaseLine({ qty: 10, rate: 100, discPct: 2, schPct: 5, gstPct: 18 });
    expect(out).toMatchObject({ gross: 1000, discAmt: 20, schAmt: 49, taxable: 931 });
    expect(out.tax).toBe(167.58);
    expect(out.total).toBe(1098.58);
  });

  it("uses the typed amounts when the % is 0, and takes the extra disc off always (the server's live answer: 1000 − 5 → 995)", () => {
    expect(calcPurchaseLine({ qty: 10, rate: 100, discAmt: 5, gstPct: 18 })).toMatchObject({ discAmt: 5, taxable: 995, tax: 179.1, total: 1174.1 });
    expect(calcPurchaseLine({ qty: 10, rate: 100, discPct: 2, discAmt: 99, schAmt: 30, extraAmt: 10 })).toMatchObject({
      discAmt: 20,
      schAmt: 30,
      taxable: 940,
    });
  });
});
