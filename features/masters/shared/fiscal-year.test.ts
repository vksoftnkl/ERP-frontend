import { describe, expect, it } from "vitest";
import {
  BOOKS_BEGIN_MESSAGE,
  FISCAL_YEAR_FROM_MESSAGE,
  currentIndianFiscalYear,
  fiscalYearEndFor,
  formatIsoDateDmy,
  validateFiscalYearFields,
} from "./fiscal-year";

describe("currentIndianFiscalYear", () => {
  it("starts on 1 April of this year once April has come", () => {
    expect(currentIndianFiscalYear(new Date(2026, 9, 2))).toEqual({
      from: "2026-04-01",
      to: "2027-03-31",
    });
    expect(currentIndianFiscalYear(new Date(2026, 3, 1))).toEqual({
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("belongs to last year's 1 April in January–March", () => {
    expect(currentIndianFiscalYear(new Date(2027, 2, 31))).toEqual({
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });
});

describe("fiscalYearEndFor", () => {
  it("is one year on, less a day", () => {
    expect(fiscalYearEndFor("2026-04-01")).toBe("2027-03-31");
    expect(fiscalYearEndFor("2024-02-29")).toBe("2025-02-28");
    expect(fiscalYearEndFor("not a date")).toBeNull();
  });

  it("formats as dd-MM-yyyy for the message", () => {
    expect(formatIsoDateDmy("2027-03-31")).toBe("31-03-2027");
    expect(formatIsoDateDmy("junk")).toBe("junk");
  });
});

describe("validateFiscalYearFields", () => {
  it("accepts the running year with books beginning on its first day", () => {
    expect(
      validateFiscalYearFields({ from: "2026-04-01", to: "2027-03-31", books: "2026-04-01" }),
    ).toBeNull();
    expect(
      validateFiscalYearFields({ from: "2026-04-01", to: "2027-03-31", books: "2026-10-02" }),
    ).toBeNull();
  });

  it("leaves blank dates to the server", () => {
    expect(validateFiscalYearFields({ from: "", to: "", books: "" })).toBeNull();
    expect(validateFiscalYearFields({ from: "", to: "2027-03-31", books: "" })).toBeNull();
  });

  it("insists From is a 1 April (the server would 400 on 2 April)", () => {
    expect(validateFiscalYearFields({ from: "2026-04-02", to: "2027-04-01", books: "" })).toEqual({
      field: "from",
      message: FISCAL_YEAR_FROM_MESSAGE,
    });
    expect(validateFiscalYearFields({ from: "2026-01-01", to: "", books: "" })?.field).toBe("from");
  });

  it("insists To is the 31 March after From, naming the date", () => {
    expect(validateFiscalYearFields({ from: "2026-04-01", to: "2026-12-31", books: "" })).toEqual({
      field: "to",
      message: "Financial Year To must be 31-03-2027.",
    });
  });

  it("keeps Books Begin From inside the year", () => {
    expect(
      validateFiscalYearFields({ from: "2026-04-01", to: "2027-03-31", books: "2026-03-31" }),
    ).toEqual({ field: "books", message: BOOKS_BEGIN_MESSAGE });
    expect(
      validateFiscalYearFields({ from: "2026-04-01", to: "2027-03-31", books: "2027-04-01" }),
    ).toEqual({ field: "books", message: BOOKS_BEGIN_MESSAGE });
  });
});
