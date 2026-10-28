import { describe, expect, it } from "vitest";
import { addDays, instantMs, istClock, istDateTime, istToday, shortDate } from "./dates";
import { formatMoney, formatPaise, isPartialDiff, paiseOf, sumPaise, toPaise } from "./money";

describe("toPaise", () => {
  it("reads the server's numbers without float noise", () => {
    expect(toPaise(1236.72)).toBe(123672);
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(-450)).toBe(-45000);
    expect(toPaise(0)).toBe(0);
  });

  it("reads the grids' NUMERIC strings exactly", () => {
    expect(toPaise("1236.72")).toBe(123672);
    expect(toPaise("1,234.5")).toBe(123450);
    expect(toPaise("-90.00")).toBe(-9000);
    expect(toPaise("500")).toBe(50000);
    expect(toPaise(".5")).toBe(50);
    expect(toPaise("-0.00")).toBe(0);
  });

  it("rounds a third decimal half away from zero", () => {
    expect(toPaise("1.005")).toBe(101);
    expect(toPaise("1.004")).toBe(100);
    expect(toPaise("-1.005")).toBe(-101);
  });

  it("refuses what is not an amount", () => {
    expect(toPaise("")).toBeNull();
    expect(toPaise("abc")).toBeNull();
    expect(toPaise(null)).toBeNull();
    expect(toPaise(undefined)).toBeNull();
    expect(toPaise(Number.NaN)).toBeNull();
    expect(paiseOf(null)).toBe(0);
  });
});

describe("formatPaise", () => {
  it("groups the Indian way, two places always", () => {
    expect(formatPaise(1844400)).toBe("18,444.00");
    expect(formatPaise(1234567890)).toBe("1,23,45,678.90");
    expect(formatPaise(5)).toBe("0.05");
    expect(formatPaise(0)).toBe("0.00");
    expect(formatPaise(-45000)).toBe("-450.00");
  });

  it("formats a wire value, blank when there is none", () => {
    expect(formatMoney("1777.27")).toBe("1,777.27");
    expect(formatMoney(null)).toBe("");
  });

  it("sums in paise and calls any paise of difference partial", () => {
    expect(sumPaise([1328, 26, 1])).toBe(1355);
    expect(isPartialDiff(0)).toBe(false);
    expect(isPartialDiff(-9000)).toBe(true);
    expect(isPartialDiff(1)).toBe(true);
  });
});

describe("IST times", () => {
  it("shows a UTC instant on India's clock", () => {
    expect(istClock("2026-10-07T06:48:00.000Z")).toBe("12:18 PM");
    expect(istDateTime("2026-10-07T20:40:00Z")).toBe("08/10/2026 02:10 AM");
  });

  it("reads the grids' IST text with its offset as the same wall clock", () => {
    expect(istClock("2026-10-09T15:10:00+05:30")).toBe("03:10 PM");
    expect(istDateTime("2026-10-09T15:10:00+05:30")).toBe("09/10/2026 03:10 PM");
    expect(instantMs("2026-10-09T15:10:00+05:30")).toBe(Date.UTC(2026, 9, 9, 9, 40));
  });

  it("reads a zoneless stamp as IST and a bad one as nothing", () => {
    expect(istClock("2026-10-09 15:10")).toBe("03:10 PM");
    expect(istClock("")).toBe("");
    expect(istClock("not a time")).toBe("");
    expect(istClock(null)).toBe("");
  });

  it("formats a calendar day without moving it", () => {
    expect(shortDate("2026-10-08")).toBe("08/10/2026");
    expect(shortDate("2026-10-07T20:40:00Z")).toBe("08/10/2026");
    expect(shortDate("")).toBe("");
    expect(shortDate("someday")).toBe("someday");
  });

  it("knows today in India and walks days", () => {
    expect(istToday(Date.UTC(2026, 9, 9, 20, 0))).toBe("2026-10-10");
    expect(istToday(Date.UTC(2026, 9, 9, 10, 0))).toBe("2026-10-09");
    expect(addDays("2026-10-10", -30)).toBe("2026-09-10");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
