import { describe, expect, it } from "vitest";
import { DaySummaryParseError } from "./parse";
import { NO_ACCESS_MESSAGE, toDaySummaryError } from "./errors";

/** The global filter's nesting: `{ statusCode, message: { message, errors: [{ code }] } }`. */
const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  status,
  data: { success: false, statusCode: status, message: { success: false, message: "x", errors: [{ field: "f", code, ...extra }] } },
});

describe("toDaySummaryError", () => {
  it("words each code (plan §11)", () => {
    const ctx = { accYear: "2026-2027", route: "summary" };
    expect(toDaySummaryError(refusal(400, "RANGE_OUTSIDE_YEAR"), ctx)).toMatchObject({
      message: "The dates must be inside the year 2026-2027.",
      field: "dates",
      retryable: false,
    });
    expect(toDaySummaryError(refusal(400, "RANGE_REVERSED"), ctx).message).toBe("The To date is before the Date.");
    expect(toDaySummaryError(refusal(400, "BRANCH_NOT_IN_COMPANY"), ctx)).toMatchObject({
      message: "That branch is not in this company.",
      field: "branch",
    });
    expect(toDaySummaryError(refusal(400, "YEAR_UNKNOWN"), ctx).message).toBe(
      "No financial year 2026-2027 for this company.",
    );
    expect(toDaySummaryError(refusal(400, "TYPE_UNKNOWN"), ctx).message).toBe(
      "That voucher type no longer exists — reload the screen.",
    );
    expect(toDaySummaryError(refusal(422, "RANGE_TOO_LARGE", { count: 24310 }), ctx).message).toBe(
      "Too many vouchers to export (24,310). Narrow the range or pick a type.",
    );
  });

  it("reads a 403 or NO_MENU_RIGHT as no access", () => {
    expect(toDaySummaryError(refusal(403, "NO_MENU_RIGHT"))).toMatchObject({ kind: "forbidden", message: NO_ACCESS_MESSAGE });
    expect(toDaySummaryError({ status: 403, data: {} }).kind).toBe("forbidden");
  });

  it("names the route on a network failure, a 5xx or a missing route, and offers Retry", () => {
    for (const error of [{ status: "FETCH_ERROR", error: "x" }, { status: 500, data: {} }, { status: 404, data: {} }]) {
      expect(toDaySummaryError(error, { route: "summary" })).toMatchObject({
        kind: "unavailable",
        message: "Could not load the day summary (summary). Try Show again.",
        retryable: true,
      });
    }
  });

  it("says when the answer was not understood", () => {
    const e = toDaySummaryError(new DaySummaryParseError("summary", "$.tiles", "is missing or not a list"));
    expect(e).toMatchObject({ kind: "unparsed", message: "The server's answer was not understood (summary: $.tiles)." });
  });
});
