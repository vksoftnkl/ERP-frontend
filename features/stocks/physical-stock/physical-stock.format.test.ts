import { describe, expect, it } from "vitest";
import {
  addHoursLocal,
  displayDate,
  displayDateTime,
  formatCurrencyCell,
  formatNetQty,
  formatNetValue,
  formatNumberCell,
  fromDisplayDateTime,
  fromWireInstant,
  g13,
  isoDateOf,
  parseCounted,
  round2,
  sanitizeCountedInput,
  toNumberOrNull,
  toWireInstant,
} from "./physical-stock.format";

describe("numbers", () => {
  it("reads wire decimals, absent as null", () => {
    expect(toNumberOrNull("12.5")).toBe(12.5);
    expect(toNumberOrNull("1,250.00")).toBe(1250);
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull("")).toBeNull();
    expect(toNumberOrNull("abc")).toBeNull();
  });

  it("keeps thirteen significant digits and two-decimal money", () => {
    expect(g13(0.1 + 0.2)).toBe(0.3);
    expect(round2(-7.006)).toBe(-7.01);
    expect(round2(2.344)).toBe(2.34);
    expect(round2(-60)).toBe(-60);
  });

  it("a Number cell paints zero and absent as blank", () => {
    expect(formatNumberCell(0)).toBe("");
    expect(formatNumberCell(null)).toBe("");
    expect(formatNumberCell(-2.5)).toBe("-2.5");
  });

  it("a Currency cell groups the Indian way", () => {
    expect(formatCurrencyCell(123456.7)).toBe("1,23,456.70");
    expect(formatCurrencyCell(0)).toBe("0.00");
    expect(formatCurrencyCell(null)).toBe("");
  });

  it("the totals bar shows three and two decimals", () => {
    expect(formatNetQty(-2)).toBe("-2.000");
    expect(formatNetValue(1234.5)).toBe("1,234.50");
  });
});

describe("sanitizeCountedInput — QDoubleValidator(0, 999999999, 3)", () => {
  it("takes a magnitude with up to three decimals", () => {
    expect(sanitizeCountedInput("12")).toBe("12");
    expect(sanitizeCountedInput("12.125")).toBe("12.125");
    expect(sanitizeCountedInput("0")).toBe("0");
    expect(sanitizeCountedInput("")).toBe("");
    expect(sanitizeCountedInput(".5")).toBe(".5");
  });

  it("refuses a sign, a fourth decimal, letters and a tenth integer digit", () => {
    expect(sanitizeCountedInput("-3")).toBeNull();
    expect(sanitizeCountedInput("1.2345")).toBeNull();
    expect(sanitizeCountedInput("1a")).toBeNull();
    expect(sanitizeCountedInput("1234567890")).toBeNull();
  });

  it("reads a typed count as a number", () => {
    expect(parseCounted("7.5")).toBe(7.5);
    expect(parseCounted(".")).toBe(0);
  });
});

describe("dates", () => {
  it("takes the date half of a wire timestamp and shows it dd-MM-yyyy", () => {
    expect(isoDateOf("2026-12-31T00:00:00.000Z")).toBe("2026-12-31");
    expect(isoDateOf(null)).toBe("");
    expect(displayDate("2026-12-31")).toBe("31-12-2026");
    expect(displayDate("")).toBe("");
  });

  it("parses what an operator types into a freeze field", () => {
    expect(fromDisplayDateTime("02-10-2026 14:30")).toBe("2026-10-02T14:30");
    expect(fromDisplayDateTime("021020261430")).toBe("2026-10-02T14:30");
    expect(fromDisplayDateTime("31-02-2026 10:00")).toBeNull();
    expect(fromDisplayDateTime("02-10-2026")).toBeNull();
    expect(displayDateTime("2026-10-02T14:30")).toBe("02-10-2026 14:30");
  });

  it("moves a local instant by hours", () => {
    expect(addHoursLocal("2026-10-02T22:30", 3)).toBe("2026-10-03T01:30");
  });

  it("sends an instant WITH its offset, and reads one back onto the local clock", () => {
    const wire = toWireInstant("2026-10-02T14:30");
    expect(wire).toMatch(/^2026-10-02T14:30:00[+-]\d{2}:\d{2}$/);
    expect(fromWireInstant(wire)).toBe("2026-10-02T14:30");
    expect(fromWireInstant(null)).toBe("");
    expect(toWireInstant("nonsense")).toBe("");
  });
});
