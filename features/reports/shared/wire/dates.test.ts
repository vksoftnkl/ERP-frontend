import { describe, expect, it } from "vitest";
import {
  addDays,
  clampIso,
  dayMonthLabel,
  displayDate,
  isIsoDate,
  isoDay,
  monthBounds,
  monthLabel,
  previousDay,
  todayIso,
  weekdayOf,
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

describe("calendar helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-09-25", 7)).toBe("2026-10-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("numbers weekdays Monday-first", () => {
    expect(weekdayOf("2026-09-28")).toBe(0); // a Monday
    expect(weekdayOf("2026-09-25")).toBe(4); // a Friday
    expect(weekdayOf("2026-10-04")).toBe(6); // a Sunday
  });

  it("labels a day without its year", () => {
    expect(dayMonthLabel("2026-10-02")).toBe("2 Oct");
  });
});
