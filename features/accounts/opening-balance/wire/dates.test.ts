import { afterEach, describe, expect, it, vi } from "vitest";
import { isBefore, isRealDate, toDateInput, toDisplayDate, toWireDate, todayIso } from "./dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayIso", () => {
  it("is the local calendar date, zero-padded", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 9, 30));
    expect(todayIso()).toBe("2026-01-05");
  });
});

describe("isRealDate", () => {
  it("accepts a day that exists, leap days included", () => {
    expect(isRealDate("2026-03-31")).toBe(true);
    expect(isRealDate("2028-02-29")).toBe(true);
  });

  it("refuses a day that does not exist", () => {
    expect(isRealDate("2026-02-31")).toBe(false);
    expect(isRealDate("2026-02-29")).toBe(false);
    expect(isRealDate("2026-13-01")).toBe(false);
  });

  it("refuses anything that is not ISO", () => {
    expect(isRealDate("31-03-2026")).toBe(false);
    expect(isRealDate("2026-3-31")).toBe(false);
    expect(isRealDate("")).toBe(false);
  });
});

describe("toDateInput", () => {
  it("keeps an ISO date and narrows a timestamp", () => {
    expect(toDateInput("2026-03-31")).toBe("2026-03-31");
    expect(toDateInput(" 2026-03-31T18:30:00.000Z ")).toBe("2026-03-31");
  });

  it("empties what a date input cannot hold", () => {
    expect(toDateInput(null)).toBe("");
    expect(toDateInput(undefined)).toBe("");
    expect(toDateInput("31-03-2026")).toBe("");
    expect(toDateInput("2026-02-31")).toBe("");
  });
});

describe("toDisplayDate", () => {
  it("writes dd-MM-yyyy", () => {
    expect(toDisplayDate("2026-01-12")).toBe("12-01-2026");
  });

  it("leaves empty and invalid input empty", () => {
    expect(toDisplayDate("")).toBe("");
    expect(toDisplayDate("nonsense")).toBe("");
  });
});

describe("toWireDate", () => {
  it("sends a valid date and null for an unset one", () => {
    expect(toWireDate("2026-01-12T00:00:00Z")).toBe("2026-01-12");
    expect(toWireDate("")).toBeNull();
    expect(toWireDate(null)).toBeNull();
    expect(toWireDate("2026-02-30")).toBeNull();
  });
});

describe("isBefore", () => {
  it("compares calendar dates", () => {
    expect(isBefore("2026-01-01", "2026-01-02")).toBe(true);
    expect(isBefore("2026-01-02", "2026-01-01")).toBe(false);
    expect(isBefore("2026-01-01", "2026-01-01")).toBe(false);
  });

  it("ignores the time part of a timestamp", () => {
    expect(isBefore("2026-01-01T23:59:00Z", "2026-01-02")).toBe(true);
  });

  it("treats an empty or invalid side as unknown, never before", () => {
    expect(isBefore("", "2026-01-02")).toBe(false);
    expect(isBefore("2026-01-01", "")).toBe(false);
    expect(isBefore("2026-02-31", "2026-03-01")).toBe(false);
  });
});
