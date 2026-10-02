import { describe, expect, it } from "vitest";
import {
  blankLine,
  computeTotals,
  dateFromWire,
  dateToWire,
  isUnparsableDate,
  isUntrackedIdentityField,
  lineNumbersOf,
  normalizeGridDate,
  normalizeSignature,
  parseGridNumber,
  ratePrecision,
  recalcLine,
  trackedBy,
  tracks,
  withTrailingBlank,
} from "./opening-stock.lines";
import type { OpeningStockLine } from "./opening-stock.types";

function line(overrides: Partial<OpeningStockLine> = {}): OpeningStockLine {
  return { ...blankLine(), itemId: "item-1", toBaseFactor: 1, trackSignature: "N", ...overrides };
}

describe("tracking signature", () => {
  it("reads one facet letter at a time; empty tracks nothing", () => {
    expect(tracks("BME", "B")).toBe(true);
    expect(tracks("BME", "R")).toBe(false);
    expect(tracks("", "B")).toBe(false);
    expect(tracks(null, "B")).toBe(false);
  });

  it("labels the Tracked by column in the Qt order", () => {
    expect(trackedBy("BMEP")).toBe("batch + expiry + MRP + supplier");
    expect(trackedBy("SR")).toBe("sale price + serial");
    expect(trackedBy("N")).toBe("nothing");
    expect(trackedBy("")).toBe("nothing");
  });

  it("stores a blank signature as N", () => {
    expect(normalizeSignature(null)).toBe("N");
    expect(normalizeSignature("  ")).toBe("N");
    expect(normalizeSignature("BE")).toBe("BE");
  });

  it("greys exactly the identity cells the item does not track", () => {
    const row = line({ trackSignature: "BE" });
    expect(isUntrackedIdentityField(row, "batchNo")).toBe(false);
    expect(isUntrackedIdentityField(row, "expiryDate")).toBe(false);
    expect(isUntrackedIdentityField(row, "mfgDate")).toBe(false);
    expect(isUntrackedIdentityField(row, "mrp")).toBe(true);
    expect(isUntrackedIdentityField(row, "serialNo")).toBe(true);
    expect(isUntrackedIdentityField(row, "supplierName")).toBe(true);
    // Not an identity cell at all.
    expect(isUntrackedIdentityField(row, "qty")).toBe(false);
  });
});

describe("recalcLine", () => {
  it("values a BOX line per BASE unit — 10 boxes of 12 at 240 a box is 2,400, not 28,800", () => {
    const result = recalcLine(line({ qty: 10, toBaseFactor: 12, costPerUnit: 240 }));
    expect(result.baseQty).toBe(120);
    expect(result.costRate).toBe(20);
    expect(result.value).toBe(2400);
  });

  it("counts free goods into the base quantity's value", () => {
    const result = recalcLine(line({ qty: 2, freeQty: 1, toBaseFactor: 12, costPerUnit: 120 }));
    expect(result.freeBaseQty).toBe(12);
    expect(result.value).toBe((24 + 12) * 10);
  });

  it("derives the without-tax rate only while it is blank", () => {
    const derived = recalcLine(line({ qty: 1, costPerUnit: 105, taxPerc: 5 }));
    expect(derived.costRateWot).toBeCloseTo(100, 6);
    expect(derived.valueWot).toBeCloseTo(100, 6);

    const typed = recalcLine(line({ qty: 1, costPerUnit: 105, taxPerc: 5, costRateWot: 90 }));
    expect(typed.costRateWot).toBe(90);
    expect(typed.valueWot).toBe(90);
  });

  it("takes the cost itself as the without-tax rate when there is no tax", () => {
    expect(recalcLine(line({ qty: 3, costPerUnit: 10 })).costRateWot).toBe(10);
  });

  it("treats a factor of 0 as 1", () => {
    const result = recalcLine(line({ qty: 4, toBaseFactor: 0, costPerUnit: 5 }));
    expect(result.baseQty).toBe(4);
    expect(result.value).toBe(20);
  });

  it("leaves a row with no item alone", () => {
    const row = { ...blankLine(), qty: 5, costPerUnit: 10 };
    expect(recalcLine(row)).toBe(row);
  });
});

describe("totals and line numbers", () => {
  it("counts LINES by split number and sums base quantities", () => {
    const rows = [
      line({ key: "a", splitNo: 1, baseQty: 10, value: 100, valueWot: 90 }),
      line({ key: "b", splitNo: 2, baseQty: 5, freeBaseQty: 1, value: 50, valueWot: 45 }),
      line({ key: "c", splitNo: 0, baseQty: 2, value: 20, valueWot: 20 }),
      blankLine("d"),
    ];
    expect(computeTotals(rows)).toEqual({ lines: 2, qty: 18, value: 170, valueWot: 155 });
    const numbers = lineNumbersOf(rows);
    expect(numbers.get("a")).toBe(1);
    expect(numbers.get("b")).toBe(1);
    expect(numbers.get("c")).toBe(2);
    expect(numbers.has("d")).toBe(false);
  });

  it("keeps exactly one trailing row with no item", () => {
    const withItem = [line({ key: "a" })];
    expect(withTrailingBlank(withItem)).toHaveLength(2);
    const already = [line({ key: "a" }), blankLine("b")];
    expect(withTrailingBlank(already)).toHaveLength(2);
    expect(withTrailingBlank([])).toHaveLength(1);
  });
});

describe("grid numbers", () => {
  it("lets through what QDoubleValidator(0, 999999999, n) would", () => {
    expect(parseGridNumber("", 3)).toBe(0);
    expect(parseGridNumber("1,250.5", 3)).toBe(1250.5);
    expect(parseGridNumber("2.123456789", 6)).toBe(2.123457);
    expect(parseGridNumber("-3", 3)).toBeNull();
    expect(parseGridNumber("abc", 3)).toBeNull();
    expect(parseGridNumber("12", 0)).toBe(12);
  });

  it("shows a rate to as many places as it carries, two to six", () => {
    expect(ratePrecision(20)).toBe(2);
    expect(ratePrecision(19.047619)).toBe(6);
    expect(ratePrecision(1.5)).toBe(2);
    expect(ratePrecision(1.125)).toBe(3);
  });
});

describe("dates", () => {
  it("turns the cell's dd-mm-yyyy into ISO and back", () => {
    expect(dateToWire("31-03-2027")).toBe("2027-03-31");
    expect(dateToWire("2027-03-31T00:00:00.000Z")).toBe("2027-03-31");
    expect(dateFromWire("2027-03-31T00:00:00")).toBe("31-03-2027");
    expect(dateFromWire("")).toBe("");
  });

  it("drops anything that is not a real date, and says so", () => {
    expect(dateToWire("31-02-2027")).toBe("");
    expect(dateToWire("31-03-20")).toBe("");
    expect(isUnparsableDate("31-03-20")).toBe(true);
    expect(isUnparsableDate("")).toBe(false);
    expect(isUnparsableDate("31-03-2027")).toBe(false);
  });

  it("normalises what the mask would have filled in", () => {
    expect(normalizeGridDate("31032027")).toBe("31-03-2027");
    expect(normalizeGridDate("1/3/2027")).toBe("01-03-2027");
    expect(normalizeGridDate("31.03.2027")).toBe("31-03-2027");
    expect(normalizeGridDate("31-13-2027")).toBe("31-13-2027");
    expect(normalizeGridDate("  ")).toBe("");
  });
});
