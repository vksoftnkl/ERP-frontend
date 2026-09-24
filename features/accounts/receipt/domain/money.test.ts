import { describe, expect, it } from "vitest";
import { formatMoney, formatTotal, roundMoney, sumOf, sumPaise, toPaise, toRupees } from "./money";

describe("toPaise", () => {
  it("converts rupees to integer paise", () => {
    expect(toPaise(125.5)).toBe(12550);
    expect(toPaise(0)).toBe(0);
  });

  it("absorbs the 1.005 × 100 float trap and rounds half-up", () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE doubles.
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(0.125)).toBe(13);
  });

  it("treats non-finite and missing input as zero, never NaN", () => {
    expect(toPaise(null)).toBe(0);
    expect(toPaise(undefined)).toBe(0);
    expect(toPaise(Number.NaN)).toBe(0);
    expect(toPaise(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("keeps the sign of a negative figure", () => {
    expect(toPaise(-12.34)).toBe(-1234);
  });
});

describe("toRupees / roundMoney", () => {
  it("converts paise back to rupees", () => {
    expect(toRupees(12550)).toBe(125.5);
  });

  it("rounds a rupee figure to the paisa the server would store", () => {
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(10.005)).toBe(10.01);
  });
});

describe("sums", () => {
  it("sums paise exactly", () => {
    expect(sumPaise([])).toBe(0);
    expect(sumPaise([1, 2, 3])).toBe(6);
  });

  it("sums a rupee field in paise, so forty half-paisa rows cannot drift", () => {
    const rows = Array.from({ length: 3 }, () => ({ amount: 0.1 }));
    // 0.1 + 0.1 + 0.1 in doubles is 0.30000000000000004.
    expect(sumOf(rows, (row) => row.amount)).toBe(30);
  });
});

describe("formatMoney", () => {
  it("formats in the Indian grouping with two decimals", () => {
    expect(formatMoney(150000)).toBe("1,50,000.00");
    expect(formatMoney(12.5)).toBe("12.50");
  });

  it("renders a missing or non-finite figure blank", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
    expect(formatMoney(Number.NaN)).toBe("");
  });

  it("renders a real zero as 0.00 — callers blank zeros where they want to", () => {
    // The profit cells rely on this: null (no figure) is blank, 0 is a figure.
    expect(formatMoney(0)).toBe("0.00");
  });
});

describe("formatTotal", () => {
  it("shows a zero rather than blank, for totals", () => {
    expect(formatTotal(0)).toBe("0.00");
    expect(formatTotal(null)).toBe("0.00");
    expect(formatTotal(undefined)).toBe("0.00");
  });

  it("formats a figure the same way as formatMoney", () => {
    expect(formatTotal(1234567.891)).toBe("12,34,567.89");
  });
});
