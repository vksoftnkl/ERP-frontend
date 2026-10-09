import { describe, expect, it } from "vitest";
import { refusal } from "../testing/fixtures";
import { toOutstandingError } from "./errors";
import { OutstandingParseError } from "./parse";

describe("toOutstandingError", () => {
  it.each([
    ["AS_ON_OUTSIDE_YEARS", "asOn", "25-09-2030 is outside every financial year set up for this company.", "asOn"],
    ["BAD_BUCKETS", "buckets", "Buckets must be rising whole numbers of days, e.g. 30 60 90 180.", "buckets"],
    ["NOT_FOR_PAYABLE", "areaId", "Area / salesman filters apply to customers only.", null],
    ["PARTY_NOT_IN_COMPANY", "partyId", "This party belongs to another company.", "party"],
    ["BRANCH_NOT_IN_COMPANY", "branchId", "That branch is not part of this company.", "branch"],
    ["RANGE_REVERSED", "minDueDays", "Due days ≥ is more than Due days ≤.", "dueDays"],
    ["RANGE_REVERSED", "from", "From is after To.", "calendar"],
  ])("maps %s on %s to a sentence", (code, field, message, flagged) => {
    const result = toOutstandingError(refusal(code, field, "server words"), { asOn: "2030-09-25" });
    expect(result).toMatchObject({ kind: "refused", code, message, field: flagged, retryable: false });
  });

  it("takes the export count from the refusal", () => {
    const result = toOutstandingError(refusal("RANGE_TOO_LARGE", "shape", "x", { count: 24310 }));
    expect(result.message).toBe("This list has 24,310 rows, and the export limit is 20,000. Narrow the filters.");
  });

  it("tells the calendar's range refusal from the export's", () => {
    expect(toOutstandingError(refusal("RANGE_TOO_LARGE", "to", "x")).message).toBe(
      "The due calendar shows at most 92 days. Narrow From – To.",
    );
  });

  it("finds a code in an unwrapped body too", () => {
    const result = toOutstandingError({ status: 422, data: { errors: [{ code: "BAD_BUCKETS" }] } });
    expect(result.code).toBe("BAD_BUCKETS");
  });

  it("turns 403 into the whole-screen refusal", () => {
    expect(toOutstandingError({ status: 403, data: {} })).toMatchObject({
      kind: "forbidden",
      message: "You do not have access to Party-wise Outstanding.",
    });
    const wrapped = refusal("NO_MENU_RIGHT", "menu", "x");
    expect(toOutstandingError({ ...wrapped, status: 403 }).kind).toBe("forbidden");
  });

  it("offers Retry on network and 5xx", () => {
    expect(toOutstandingError({ status: "FETCH_ERROR", error: "TypeError" })).toMatchObject({
      kind: "unavailable",
      message: "The report could not be loaded.",
      retryable: true,
    });
    expect(toOutstandingError({ status: 500, data: {} }).retryable).toBe(true);
  });

  it("names the route of an answer it could not parse", () => {
    const result = toOutstandingError(new OutstandingParseError("parties", "$.rows[0].buckets", "is short"));
    expect(result).toMatchObject({ kind: "unparsed", retryable: false });
    expect(result.message).toContain("parties: $.rows[0].buckets");
  });

  it("falls back to the server's own words for an unknown 4xx", () => {
    const result = toOutstandingError({
      status: 400,
      data: { statusCode: 400, message: { message: "Validation failed", errors: [{ field: "asOn", message: "asOn must be YYYY-MM-DD" }] } },
    });
    expect(result.message).toBe("asOn must be YYYY-MM-DD");
  });
});
