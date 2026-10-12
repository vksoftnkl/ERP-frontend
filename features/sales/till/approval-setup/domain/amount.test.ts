import { describe, expect, it } from "vitest";
import {
  addPaise,
  compareAmount,
  formatMoney,
  fromPaise,
  normalizeAmount,
  toPaise,
  toWhole,
  toWireNumber,
  trimDecimal,
} from "./amount";

describe("amount", () => {
  it("reads paise from decimal text without floats", () => {
    expect(toPaise("50")).toBe(BigInt(5000));
    expect(toPaise("50.5")).toBe(BigInt(5050));
    expect(toPaise("10,000.00")).toBe(BigInt(1000000));
    expect(toPaise("0.105")).toBe(BigInt(11));
    expect(toPaise("abc")).toBeNull();
    expect(toPaise("-5")).toBeNull();
    expect(fromPaise(BigInt(5)).toString()).toBe("0.05");
  });

  it("normalizes to two places and keeps blank / junk as they were", () => {
    expect(normalizeAmount("10000")).toBe("10000.00");
    expect(normalizeAmount("")).toBe("");
    expect(normalizeAmount("x1")).toBe("x1");
  });

  it("compares and probes on whole paise", () => {
    expect(compareAmount("4000", "4000.00")).toBe(0);
    expect(compareAmount("4000.01", "4000")).toBe(1);
    expect(compareAmount("", "0.01")).toBe(-1);
    expect(addPaise("50.00", 1)).toBe("50.01");
    expect(addPaise("0.1", 1)).toBe("0.11");
  });

  it("formats with Indian grouping and two places", () => {
    expect(formatMoney("1000000")).toBe("10,00,000.00");
    expect(formatMoney("")).toBe("0.00");
  });

  it("converts at the wire boundary only", () => {
    expect(toWireNumber("10000.50")).toBe(10000.5);
    expect(toWireNumber("")).toBe(0);
    expect(trimDecimal("5.000")).toBe("5");
    expect(trimDecimal("2.500")).toBe("2.5");
    expect(toWhole("2.5")).toBe(3);
    expect(toWhole("50.00")).toBe(50);
    expect(toWhole("junk")).toBe(0);
  });
});
