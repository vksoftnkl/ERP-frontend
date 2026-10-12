import { describe, expect, it } from "vitest";

import {
  MINUS,
  formatMoney,
  formatSignedMoney,
  paiseOrZero,
  paiseToDecimal,
  signOf,
  toCount,
  toPaise,
} from "./decimal";

describe("toPaise", () => {
  it("reads the grid's numeric strings exactly", () => {
    expect(toPaise("93930.00")).toBe(BigInt(9393000));
    expect(toPaise("-1250.5")).toBe(BigInt(-125050));
    expect(toPaise("0.10")).toBe(BigInt(10));
    expect(toPaise("500")).toBe(BigInt(50000));
    expect(toPaise(".5")).toBe(BigInt(50));
    expect(toPaise("1,76,300.00")).toBe(BigInt(17630000));
  });

  it("takes a JSON number by its digits", () => {
    expect(toPaise(0.1)).toBe(BigInt(10));
    expect(toPaise(250)).toBe(BigInt(25000));
    expect(toPaise(-80.25)).toBe(BigInt(-8025));
  });

  it("rounds a third decimal half away from zero", () => {
    expect(toPaise("1.005")).toBe(BigInt(101));
    expect(toPaise("-1.005")).toBe(BigInt(-101));
    expect(toPaise("1.004")).toBe(BigInt(100));
  });

  it("says null for what is not an amount", () => {
    expect(toPaise(null)).toBeNull();
    expect(toPaise(undefined)).toBeNull();
    expect(toPaise("")).toBeNull();
    expect(toPaise("abc")).toBeNull();
    expect(toPaise("-")).toBeNull();
    expect(toPaise({})).toBeNull();
    expect(paiseOrZero(null)).toBe(BigInt(0));
  });

  it("never drifts the way floats do", () => {
    const sum = ["0.10", "0.20", "0.30"].reduce((total, value) => total + paiseOrZero(value), BigInt(0));
    expect(paiseToDecimal(sum)).toBe("0.60");
  });
});

describe("formatting", () => {
  it("groups the Indian way", () => {
    expect(formatMoney(BigInt(17630000))).toBe("1,76,300.00");
    expect(formatMoney(BigInt(9393000))).toBe("93,930.00");
    expect(formatMoney(BigInt(0))).toBe("0.00");
    expect(formatMoney(BigInt(-58000))).toBe("-580.00");
  });

  it("signs a variance as the Qt screen does", () => {
    expect(formatSignedMoney(BigInt(-58000))).toBe(`${MINUS}580.00`);
    expect(formatSignedMoney(BigInt(7500))).toBe("+75.00");
    expect(formatSignedMoney(BigInt(0))).toBe("0.00");
    expect(formatSignedMoney(BigInt(-12500000))).toBe(`${MINUS}1,25,000.00`);
  });

  it("reads the sign", () => {
    expect(signOf(BigInt(-1))).toBe(-1);
    expect(signOf(BigInt(0))).toBe(0);
    expect(signOf(BigInt(3))).toBe(1);
  });
});

describe("toCount", () => {
  it("reads count(*) as it arrives", () => {
    expect(toCount("188")).toBe(188);
    expect(toCount(7)).toBe(7);
    expect(toCount(null)).toBe(0);
    expect(toCount("1.5")).toBe(0);
  });
});
