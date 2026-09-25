import { describe, expect, it } from "vitest";
import { toLedgerError } from "./errors";
import { LedgerParseError } from "./parse";

const ctx = { accYear: "2026-2027", yearBegin: "2026-04-01", yearEnd: "2027-03-31" };

describe("toLedgerError", () => {
  it.each([
    [{ code: "LEDGER_NOT_IN_COMPANY" }, "This ledger belongs to another company.", "ledger"],
    [{ error: { code: "BRANCH_NOT_IN_COMPANY" } }, "That branch is not part of this company.", "branch"],
    [{ errors: [{ code: "RANGE_REVERSED" }] }, "From is after To.", "dates"],
    [{ message: "RANGE_OUTSIDE_YEAR: fromDate before books" }, "Both dates must fall inside 01-04-2026 – 31-03-2027.", "dates"],
    [{ message: "YEAR_UNKNOWN" }, "The year 2026-2027 is not set up for this company.", null],
  ])("maps %j to a sentence", (data, message, field) => {
    const result = toLedgerError({ status: 422, data }, ctx);
    expect(result.kind).toBe("refused");
    expect(result.message).toBe(message);
    expect(result.field).toBe(field);
  });

  it("takes the RANGE_TOO_LARGE counts from the body", () => {
    const result = toLedgerError(
      { status: 422, data: { code: "RANGE_TOO_LARGE", totalRows: 24310, limit: 20000 } },
      ctx,
    );
    expect(result.message).toBe(
      "This range has 24,310 vouchers, and the export limit is 20,000. Narrow the dates.",
    );
  });

  it("turns 403 into the whole-screen refusal", () => {
    expect(toLedgerError({ status: 403, data: {} }).kind).toBe("forbidden");
  });

  it("offers Retry on network and 5xx", () => {
    const result = toLedgerError({ status: "FETCH_ERROR", error: "TypeError" });
    expect(result).toMatchObject({ kind: "unavailable", retryable: true });
    expect(toLedgerError({ status: 500, data: {} }).retryable).toBe(true);
  });

  it("names the route of an answer it could not parse", () => {
    const result = toLedgerError(new LedgerParseError("header", "$.period.closing", "is missing"));
    expect(result.kind).toBe("unparsed");
    expect(result.message).toContain("header: $.period.closing");
  });

  it("falls back to the server's own words for an unknown 4xx", () => {
    const result = toLedgerError({
      status: 400,
      data: { success: false, message: "Validation failed", errors: [{ field: "x", message: "ledgerId must be a UUID" }] },
    });
    expect(result.message).toBe("ledgerId must be a UUID");
  });
});
