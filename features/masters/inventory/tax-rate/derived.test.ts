import { describe, expect, it } from "vitest";
import {
  deriveTaxRateSplitValues,
  deriveTaxRateSplits,
  parseRatePerc,
} from "./derived";

describe("deriveTaxRateSplits", () => {
  it("halves a whole slab", () => {
    expect(deriveTaxRateSplits(18)).toEqual({ cgst: 9, sgst: 9, igst: 18 });
  });

  it("keeps the third decimal 0.25% needs", () => {
    // 0.25% is a statutory slab; rounding the half to two decimals would make it
    // 0.13 + 0.13 = 0.26 and disagree with the stored numeric(7,3).
    expect(deriveTaxRateSplits(0.25)).toEqual({ cgst: 0.125, sgst: 0.125, igst: 0.25 });
  });

  it("rounds a half away from zero, as numeric(7,3) does", () => {
    expect(deriveTaxRateSplits(0.001).cgst).toBe(0.001);
  });

  it("treats zero as zero rather than absent", () => {
    expect(deriveTaxRateSplits(0)).toEqual({ cgst: 0, sgst: 0, igst: 0 });
  });
});

describe("parseRatePerc", () => {
  it("reads an empty or unparseable input as zero, never NaN", () => {
    expect(parseRatePerc("")).toBe(0);
    expect(parseRatePerc("   ")).toBe(0);
    expect(parseRatePerc("abc")).toBe(0);
    expect(parseRatePerc(null)).toBe(0);
    expect(parseRatePerc(undefined)).toBe(0);
    expect(parseRatePerc(Number.NaN)).toBe(0);
  });

  it("reads the number the input holds", () => {
    expect(parseRatePerc("18")).toBe(18);
    expect(parseRatePerc(" 0.25 ")).toBe(0.25);
    expect(parseRatePerc(5)).toBe(5);
  });
});

describe("deriveTaxRateSplitValues", () => {
  it("renders the mirrors without trailing zeros", () => {
    expect(deriveTaxRateSplitValues("18")).toEqual({
      tax_cgst_perc: "9",
      tax_sgst_perc: "9",
      tax_igst_perc: "18",
    });
  });

  it("tracks a part-typed rate instead of blanking", () => {
    expect(deriveTaxRateSplitValues("1")).toEqual({
      tax_cgst_perc: "0.5",
      tax_sgst_perc: "0.5",
      tax_igst_perc: "1",
    });
  });
});
