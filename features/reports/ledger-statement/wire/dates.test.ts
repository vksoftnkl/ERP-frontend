import { describe, expect, it } from "vitest";
import {
  clampIso,
  displayDate,
  isIsoDate,
  isoDay,
  monthBounds,
  monthLabel,
  previousDay,
  todayIso,
} from "./dates";

describe("dates", () => {
  it("shows ISO as dd-MM-yyyy", () => {
    expect(displayDate("2026-09-25")).toBe("25-09-2026");
    expect(displayDate("2026-09-25T00:00:00.000Z")).toBe("25-09-2026");
    expect(displayDate(null)).toBe("");
  });

  it("validates real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("25-09-2026")).toBe(false);
  });

  it("steps back a day across month and year ends", () => {
    expect(previousDay("2026-08-01")).toBe("2026-07-31");
    expect(previousDay("2026-04-01")).toBe("2026-03-31");
    expect(previousDay("2027-01-01")).toBe("2026-12-31");
    expect(previousDay("2028-03-01")).toBe("2028-02-29");
  });

  it("labels and bounds months", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(monthBounds("2026-02")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(monthBounds("2026-12")).toEqual(["2026-12-01", "2026-12-31"]);
  });

  it("clamps and slices without a Date", () => {
    expect(clampIso("2026-03-15", "2026-04-01", "2027-03-31")).toBe("2026-04-01");
    expect(clampIso("2027-05-01", "2026-04-01", "2027-03-31")).toBe("2027-03-31");
    expect(isoDay("2026-09-25T18:30:00Z")).toBe("2026-09-25");
  });

  it("reads today in the local calendar", () => {
    expect(todayIso(new Date(2026, 8, 25, 23, 59))).toBe("2026-09-25");
  });
});
