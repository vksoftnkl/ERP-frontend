import { describe, expect, it } from "vitest";
import { clock12FromHhmm, clock12Of, dateTime12Of, dayMonthTime12Of, formatClock12 } from "./time-format";

describe("formatClock12", () => {
  it("pads the hour and names the half of the day", () => {
    expect(formatClock12(new Date(2026, 9, 14, 0, 30))).toBe("12:30 AM");
    expect(formatClock12(new Date(2026, 9, 14, 9, 5))).toBe("09:05 AM");
    expect(formatClock12(new Date(2026, 9, 14, 12, 0))).toBe("12:00 PM");
    expect(formatClock12(new Date(2026, 9, 14, 14, 5))).toBe("02:05 PM");
    expect(formatClock12(new Date(2026, 9, 14, 23, 59))).toBe("11:59 PM");
  });
});

describe("clock12Of", () => {
  it("reads an ISO instant in local time", () => {
    const at = new Date(2026, 9, 14, 17, 45);
    expect(clock12Of(at.toISOString())).toBe("05:45 PM");
    expect(clock12Of(at)).toBe("05:45 PM");
  });

  it("is blank for nothing or nonsense", () => {
    expect(clock12Of(null)).toBe("");
    expect(clock12Of(undefined)).toBe("");
    expect(clock12Of("")).toBe("");
    expect(clock12Of("not a date")).toBe("");
  });
});

describe("clock12FromHhmm", () => {
  it("turns a 24-hour wall clock into 12-hour", () => {
    expect(clock12FromHhmm("00:00")).toBe("12:00 AM");
    expect(clock12FromHhmm("13:07")).toBe("01:07 PM");
    expect(clock12FromHhmm("09:30:15")).toBe("09:30 AM");
  });

  it("leaves what is not a clock alone", () => {
    expect(clock12FromHhmm("—")).toBe("—");
    expect(clock12FromHhmm("25:00")).toBe("25:00");
    expect(clock12FromHhmm(null)).toBe("");
  });
});

describe("dateTime12Of / dayMonthTime12Of", () => {
  it("prefixes the local date", () => {
    const at = new Date(2026, 0, 3, 8, 15);
    expect(dateTime12Of(at)).toBe("03/01/2026 08:15 AM");
    expect(dayMonthTime12Of(at.toISOString())).toBe("03/01 08:15 AM");
    expect(dateTime12Of("x")).toBe("");
  });
});
