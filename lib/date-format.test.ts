import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateOrRaw,
  formatDateParts,
  formatDateTime,
  formatLocalDate,
  formatLocalDateTimeValue,
  isoToDisplayDate,
  normalizeDateText,
  parseDisplayDate,
  parseDisplayDateTime,
  todayIsoDate,
} from "./date-format";

describe("formatting", () => {
  it("writes dd/MM/yyyy", () => {
    expect(formatDateParts(5, 1, 2026)).toBe("05/01/2026");
    expect(formatLocalDate(new Date(2026, 9, 28, 23, 59))).toBe("28/10/2026");
  });

  it("reads an ISO date as written, with no timezone shift", () => {
    expect(isoToDisplayDate("2026-01-13")).toBe("13/01/2026");
    expect(isoToDisplayDate("2026-01-13T00:00:00.000Z")).toBe("13/01/2026");
    expect(isoToDisplayDate("13-01-2026")).toBe("");
    expect(isoToDisplayDate(null)).toBe("");
  });

  it("formats dates, instants and day-first text", () => {
    expect(formatDate("2026-03-31")).toBe("31/03/2026");
    const at = new Date(2026, 2, 31, 22, 15);
    expect(formatDate(at)).toBe("31/03/2026");
    expect(formatDate(at.toISOString())).toBe("31/03/2026");
    expect(formatDate("31-03-2026")).toBe("31/03/2026");
    expect(formatDate("31.03.2026")).toBe("31/03/2026");
    expect(formatDate("31/03/2026")).toBe("31/03/2026");
  });

  it("is blank for what is not a date, unless asked for the raw text", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate("31-02-2026")).toBe("");
    expect(formatDate("—")).toBe("");
    expect(formatDate(new Date(Number.NaN))).toBe("");
    expect(formatDateOrRaw("—")).toBe("—");
    expect(formatDateOrRaw(null)).toBe("");
    expect(formatDateOrRaw("2026-10-28")).toBe("28/10/2026");
  });

  it("formats an instant with the 12-hour clock", () => {
    expect(formatDateTime(new Date(2026, 0, 3, 14, 5))).toBe("03/01/2026 02:05 PM");
    expect(formatDateTime("nonsense")).toBe("");
    expect(formatLocalDateTimeValue("2026-01-03T00:30")).toBe("03/01/2026 12:30 AM");
    expect(formatLocalDateTimeValue("")).toBe("");
  });

  it("names today in ISO", () => {
    expect(todayIsoDate(new Date(2026, 1, 9, 23, 0))).toBe("2026-02-09");
  });
});

describe("parseDisplayDate", () => {
  it("reads the house format and the usual variants", () => {
    expect(parseDisplayDate("28/10/2026")).toBe("2026-10-28");
    expect(parseDisplayDate("28-10-2026")).toBe("2026-10-28");
    expect(parseDisplayDate("28.10.2026")).toBe("2026-10-28");
    expect(parseDisplayDate(" 5/1/2026 ")).toBe("2026-01-05");
    expect(parseDisplayDate("28102026")).toBe("2026-10-28");
    expect(parseDisplayDate("2026-10-28")).toBe("2026-10-28");
  });

  it("takes a two-digit year only when asked", () => {
    expect(parseDisplayDate("28/10/26")).toBeNull();
    expect(parseDisplayDate("281026")).toBeNull();
    expect(parseDisplayDate("28/10/26", { allowShortYear: true })).toBe("2026-10-28");
    expect(parseDisplayDate("281026", { allowShortYear: true })).toBe("2026-10-28");
  });

  it("refuses what is not a real date", () => {
    expect(parseDisplayDate("31/02/2026")).toBeNull();
    expect(parseDisplayDate("2026-02-30")).toBeNull();
    expect(parseDisplayDate("10/2026")).toBeNull();
    expect(parseDisplayDate("")).toBeNull();
    expect(parseDisplayDate(null)).toBeNull();
    expect(parseDisplayDate("28/10/2026 10:00")).toBeNull();
  });
});

describe("parseDisplayDateTime", () => {
  it("reads twelve digits with a meridiem, or a 24-hour clock without", () => {
    expect(parseDisplayDateTime("02/10/2026 02:30 PM")).toBe("2026-10-02T14:30");
    expect(parseDisplayDateTime("02-10-2026 12:05 am")).toBe("2026-10-02T00:05");
    expect(parseDisplayDateTime("021020261430")).toBe("2026-10-02T14:30");
    expect(parseDisplayDateTime("02/10/2026 13:30 PM")).toBeNull();
    expect(parseDisplayDateTime("30/02/2026 10:00")).toBeNull();
  });
});

describe("normalizeDateText", () => {
  it("re-spells server-formatted day-first dates, keeping any time", () => {
    expect(normalizeDateText("28-10-2026")).toBe("28/10/2026");
    expect(normalizeDateText("28-10-2026 02:05 PM")).toBe("28/10/2026 02:05 PM");
    expect(normalizeDateText("28.10.2026")).toBe("28/10/2026");
  });

  it("formats raw ISO dates and timestamps", () => {
    expect(normalizeDateText("2026-10-28")).toBe("28/10/2026");
    expect(normalizeDateText("2026-10-28T00:00:00.000Z")).toBe("28/10/2026");
    const at = new Date(2026, 9, 28, 14, 5);
    expect(normalizeDateText(at.toISOString())).toBe("28/10/2026 02:05 PM");
  });

  it("leaves everything else alone", () => {
    for (const text of ["", "INV-2026-10", "31-02-2026", "12345678", "1,234.50", "ABC 28-10-2026", "28-10"]) {
      expect(normalizeDateText(text)).toBe(text);
    }
  });
});
