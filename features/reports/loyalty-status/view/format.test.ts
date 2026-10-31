import { describe, expect, it } from "vitest";
import { dayMonth, money, monthShort, monthYear, num, pointsValue, pts, respellDates, shortValue, showDate } from "./format";

describe("points", () => {
  it("reads whole points in Indian grouping, a fraction with two places", () => {
    expect(pts(348920)).toBe("3,48,920");
    expect(pts(42)).toBe("42");
    expect(pts(0)).toBe("0");
    expect(pts(-1000)).toBe("-1,000");
    expect(pts(1234.5)).toBe("1,234.50");
    expect(pts(12.3456)).toBe("12.35");
    expect(pts(null)).toBe("0");
    expect(pts("40.0000")).toBe("40");
  });
});

describe("money", () => {
  it("groups the server's string as sent; null reads 0.00", () => {
    expect(money("87230.00")).toBe("87,230.00");
    expect(money("51.00")).toBe("51.00");
    expect(money(null)).toBe("0.00");
    expect(money(650)).toBe("650.00");
  });

  it("prices closing × rate exactly, blank without a rate", () => {
    expect(pointsValue(2600, "0.25")).toBe("650.00");
    expect(pointsValue(42, "1.0000")).toBe("42.00");
    expect(pointsValue(42, "0")).toBe("");
    expect(pointsValue(42, null)).toBe("");
  });
});

describe("dates", () => {
  it("shows dd/MM/yyyy and the short forms", () => {
    expect(showDate("2027-10-22")).toBe("22/10/2027");
    expect(showDate(null)).toBe("");
    expect(dayMonth("2026-04-01")).toBe("01/04");
    expect(monthShort("2026-10")).toBe("Oct");
    expect(monthYear("2026-10")).toBe("Oct 2026");
  });

  it("re-spells the printedAs dates, nothing else", () => {
    expect(respellDates("Period 01-04-2026 to 31-10-2026 · As on 31-10-2026 · 8-15 days")).toBe(
      "Period 01/04/2026 to 31/10/2026 · As on 31/10/2026 · 8-15 days",
    );
  });
});

describe("helpers", () => {
  it("reads numbers off the wire and shortens chart values", () => {
    expect(num("12.5")).toBe(12.5);
    expect(num(undefined)).toBe(0);
    expect(num("x")).toBe(0);
    expect(shortValue(6410)).toBe("6.4k");
    expect(shortValue(980)).toBe("980");
  });
});
