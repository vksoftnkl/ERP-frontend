import { describe, expect, it } from "vitest";
import { formatDropdownValue, toRawText } from "./format";

describe("toRawText", () => {
  it("passes strings through untouched", () => {
    expect(toRawText("  LINK  ")).toBe("  LINK  ");
  });

  it("renders nullish and non-finite values as empty", () => {
    expect(toRawText(null)).toBe("");
    expect(toRawText(undefined)).toBe("");
    expect(toRawText(Number.NaN)).toBe("");
    expect(toRawText(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("renders booleans and numbers", () => {
    expect(toRawText(true)).toBe("true");
    expect(toRawText(0)).toBe("0");
  });

  it("refuses to stringify an object into a cell", () => {
    expect(toRawText({ a: 1 })).toBe("");
    expect(toRawText([1, 2])).toBe("");
  });
});

describe("formatDropdownValue", () => {
  it("returns empty for a missing key or a blank value", () => {
    expect(formatDropdownValue(undefined, "Text")).toBe("");
    expect(formatDropdownValue("   ", "NumericTS")).toBe("");
    expect(formatDropdownValue(null, "Date")).toBe("");
  });

  describe("Text", () => {
    it("is the raw string", () => {
      expect(formatDropdownValue("Loganathan", "Text")).toBe("Loganathan");
    });

    it("does not format a numeric-looking string", () => {
      expect(formatDropdownValue("0012", "Text")).toBe("0012");
    });
  });

  describe("numbers", () => {
    it("groups NumberTS with no decimals", () => {
      expect(formatDropdownValue(1234567, "NumberTS")).toBe("12,34,567");
    });

    it("groups NumericTS to two decimals", () => {
      expect(formatDropdownValue(1234.5, "NumericTS")).toBe("1,234.50");
    });

    it("reads the API's quoted numerics", () => {
      expect(formatDropdownValue("1234.5", "NumericTS")).toBe("1,234.50");
      expect(formatDropdownValue("1234.5", "NumberTS")).toBe("1,235");
    });

    it("leaves Number ungrouped at its natural precision", () => {
      expect(formatDropdownValue("1234.50", "Number")).toBe("1234.5");
      expect(formatDropdownValue(7, "Number")).toBe("7");
    });

    it("renders an unparseable number as its raw text", () => {
      expect(formatDropdownValue("N/A", "NumericTS")).toBe("N/A");
      expect(formatDropdownValue("12abc", "NumberTS")).toBe("12abc");
    });

    it("handles negatives and zero", () => {
      expect(formatDropdownValue(-1234.5, "NumericTS")).toBe("-1,234.50");
      expect(formatDropdownValue(0, "NumberTS")).toBe("0");
    });
  });

  describe("dates", () => {
    it("formats an ISO date as dd/MM/yyyy", () => {
      expect(formatDropdownValue("2026-01-13", "Date")).toBe("13/01/2026");
    });

    it("does not shift an ISO date across the timezone boundary", () => {
      // new Date("2026-01-13") is UTC midnight; read as local time it is the 12th
      // anywhere west of Greenwich.
      expect(formatDropdownValue("2026-01-13T00:00:00.000Z", "Date")).toBe("13/01/2026");
    });

    it("formats a timestamp as dd/MM/yyyy hh:mm AM/PM", () => {
      expect(formatDropdownValue("2026-07-11T13:14:11.145Z", "DateTime")).toBe(
        "11/07/2026 01:14 PM",
      );
      expect(formatDropdownValue("2026-07-11T00:05:00.000Z", "DateTime")).toBe(
        "11/07/2026 12:05 AM",
      );
      expect(formatDropdownValue("2026-07-11 12:00:00", "DateTime")).toBe("11/07/2026 12:00 PM");
    });

    it("renders an unparseable date as its raw text", () => {
      expect(formatDropdownValue("not a date", "Date")).toBe("not a date");
      expect(formatDropdownValue("2026-13-45", "Date")).toBe("2026-13-45");
      expect(formatDropdownValue("not a date", "DateTime")).toBe("not a date");
    });

    it("accepts a non-ISO date the platform can parse", () => {
      expect(formatDropdownValue("Jan 13, 2026", "Date")).toBe("13/01/2026");
    });
  });
});
