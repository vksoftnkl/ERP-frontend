/**
 * The four numbers of a level, checked against the SERVER's own derivation.
 *
 * `serverRecompute` below is `recomputeLevel` from the server module
 * (`src/modules/stocks/selling-price-bulk/selling-price-math.helper.ts`),
 * copied verbatim apart from its types — the server package cannot be
 * imported into this build. The server keeps PRICE and recomputes the other
 * figures from it, so the screen's markup / wot / margin for a price must be
 * the server's to the six places the column stores.
 */
import { describe, expect, it } from "vitest";
import {
  applyRoundOff,
  exclusiveOfTax,
  levelNumbers,
  marginOf,
  markupOf,
  priceFromMargin,
  priceFromMarkup,
  priceFromWot,
  rawNum,
  rawOf,
  round2,
  roundHalfAway,
  toNullableNum,
  toNum,
} from "./selling-price.math";

// ---- the server helper, verbatim (types dropped) --------------------------
const SCALE = 6;
function serverRound(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** SCALE;
  return Math.round(value * factor) / factor;
}
function serverExclusiveOfTax(withTax: number, taxPerc: number): number {
  const divisor = 1 + taxPerc / 100;
  return divisor <= 0 ? serverRound(withTax) : serverRound(withTax / divisor);
}
function serverRecompute(level: number, price: number, taxPerc: number, costRate: number) {
  const priceWithTax = serverRound(price);
  const priceWot = serverExclusiveOfTax(priceWithTax, taxPerc);
  const costWot = serverExclusiveOfTax(costRate, taxPerc);
  return {
    level,
    price: priceWithTax,
    priceWot,
    markupPerc: costRate > 0 ? serverRound(((priceWithTax - costRate) / costRate) * 100) : 0,
    marginPerc: costRate > 0 && priceWot > 0 ? serverRound(((priceWot - costWot) / priceWot) * 100) : 0,
  };
}
// ---------------------------------------------------------------------------

const CASES: ReadonlyArray<{ price: number; tax: number; cost: number }> = [
  { price: 118, tax: 18, cost: 95 },
  { price: 100, tax: 0, cost: 80 },
  { price: 49.99, tax: 5, cost: 41.25 },
  { price: 1250, tax: 28, cost: 1300 }, // below cost: negative markup and margin
  { price: 12.5, tax: 12, cost: 0 }, // no cost known
  { price: 0, tax: 18, cost: 10 }, // no price
  { price: 999.95, tax: 3, cost: 512.3456 },
  { price: 76.4, tax: 40, cost: 70 },
];

describe("the four numbers agree with the server's recomputeLevel", () => {
  for (const { price, tax, cost } of CASES) {
    it(`price ${price}, tax ${tax}%, cost ${cost}`, () => {
      const server = serverRecompute(1, price, tax, cost);
      const mine = levelNumbers(price, cost, tax);
      expect(mine.price).toBe(server.price);
      expect(Number(rawNum(mine.wot))).toBeCloseTo(server.priceWot, 6);
      expect(Number(rawNum(mine.markup))).toBeCloseTo(server.markupPerc, 6);
      // The server rounds priceWot and costWot to six places BEFORE taking the
      // ratio; the screen (like the Qt one) does not. The margin is display
      // only — never sent — so the two may part in the sixth place.
      expect(Math.abs(mine.margin - server.marginPerc)).toBeLessThan(2e-6);
    });
  }
});

describe("markup and margin", () => {
  it("is (price − cost) ÷ cost on the tax-inclusive pair", () => {
    expect(markupOf(118, 100)).toBeCloseTo(18, 10);
  });

  it("is (priceWot − costWot) ÷ priceWot on the tax-exclusive pair", () => {
    // 118 and 94.4 at 18%: 100 and 80 before tax — a 20% margin.
    expect(marginOf(118, 94.4, 18)).toBeCloseTo(20, 10);
  });

  it("answers 0 — never 100% — when the cost is unknown", () => {
    expect(markupOf(118, 0)).toBe(0);
    expect(marginOf(118, 0, 18)).toBe(0);
  });

  it("answers a 0 margin for a 0 price rather than dividing by it", () => {
    expect(marginOf(0, 50, 18)).toBe(0);
  });
});

describe("exclusiveOfTax", () => {
  it("takes the tax out", () => {
    expect(exclusiveOfTax(118, 18)).toBeCloseTo(100, 10);
  });

  it("guards a −100% tax rather than dividing by zero", () => {
    expect(exclusiveOfTax(118, -100)).toBe(118);
  });
});

describe("rounding", () => {
  it("rounds half away from zero, as C++ std::round does", () => {
    expect(roundHalfAway(2.5)).toBe(3);
    expect(roundHalfAway(-2.5)).toBe(-3);
    expect(roundHalfAway(-2.4)).toBe(-2);
  });

  it("rounds to the paisa", () => {
    expect(round2(12.345)).toBe(12.35);
    expect(round2(-12.345)).toBe(-12.35);
    expect(round2(100)).toBe(100);
  });

  it("rounds a derived price to the nearest multiple; 0 leaves it alone", () => {
    expect(applyRoundOff(117.6, 1)).toBe(118);
    expect(applyRoundOff(117.4, 0.5)).toBe(117.5);
    expect(applyRoundOff(112, 5)).toBe(110);
    expect(applyRoundOff(112.5, 5)).toBe(115);
    expect(applyRoundOff(117.63, 0)).toBe(117.63);
  });
});

describe("a typed figure → the price", () => {
  it("markup: cost × (1 + m%), rounded off", () => {
    expect(priceFromMarkup(100, 18, 0)).toBeCloseTo(118, 10);
    expect(priceFromMarkup(95, 18, 1)).toBe(112);
  });

  it("price wot / base rate: wot × (1 + tax%), rounded off", () => {
    expect(priceFromWot(100, 18, 0)).toBeCloseTo(118, 10);
    expect(priceFromWot(84.75, 18, 0.5)).toBe(100);
  });

  it("margin: costWot ÷ (1 − m%) × (1 + tax%), rounded off", () => {
    // cost 94.4 at 18% is 80 before tax; a 20% margin is 100 before tax, 118 after.
    expect(priceFromMargin(94.4, 18, 20, 0)).toBeCloseTo(118, 10);
  });

  it("has no price for a margin of 100% or more", () => {
    expect(priceFromMargin(94.4, 18, 100, 0)).toBeNull();
    expect(priceFromMargin(94.4, 18, 150, 0)).toBeNull();
  });

  it("round-trips a price through its markup", () => {
    const markup = markupOf(118, 95);
    expect(priceFromMarkup(95, markup, 0)).toBeCloseTo(118, 9);
  });
});

describe("raw figures, as a Qt cell holds them", () => {
  it("drops trailing zeros and keeps up to six places", () => {
    expect(rawNum(50)).toBe("50");
    expect(rawNum(40.5)).toBe("40.5");
    expect(rawNum(0)).toBe("0");
    expect(rawNum(100)).toBe("100");
    expect(rawNum(1.23456789)).toBe("1.234568");
  });

  it("reads null as empty", () => {
    expect(rawOf(null)).toBe("");
    expect(rawOf(undefined)).toBe("");
    expect(rawOf(45)).toBe("45");
    expect(rawOf("45.50")).toBe("45.5");
  });

  it("reads wire numbers whatever they arrived as", () => {
    expect(toNum("1,250.50")).toBe(1250.5);
    expect(toNum(null)).toBe(0);
    expect(toNum(Number.NaN)).toBe(0);
    expect(toNullableNum(null)).toBeNull();
    expect(toNullableNum(0)).toBe(0);
  });
});
