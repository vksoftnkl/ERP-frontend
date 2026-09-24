import { describe, expect, it } from "vitest";
import { receiptError, statusOf } from "./api-errors";

describe("receiptError", () => {
  it("prefers the per-field messages over the envelope's 'Validation failed'", () => {
    const error = {
      status: 400,
      data: {
        success: false,
        message: "Validation failed",
        errors: [
          { field: "partyId", message: " rct00259 was received from Deepan. " },
          { field: "x", message: "" },
          { field: "y" },
          "not a record",
          { field: "writeoff", message: "Above the approval limit." },
        ],
      },
    };
    expect(receiptError(error)).toBe("rct00259 was received from Deepan. Above the approval limit.");
  });

  it("falls back to the envelope message", () => {
    expect(receiptError({ data: { message: "  Out by 100.00 ", errors: [] } })).toBe("Out by 100.00");
  });

  it("falls back to the generic extractor for a transport error", () => {
    expect(receiptError({ status: "FETCH_ERROR", message: "Network down" })).toBe("Network down");
    expect(receiptError({ data: { message: "   " } })).toBe("Request failed.");
  });

  it("never returns an empty sentence", () => {
    expect(receiptError(null)).toBe("Request failed.");
    expect(receiptError(undefined)).toBe("Request failed.");
  });
});

describe("statusOf", () => {
  it("reads a numeric HTTP status", () => {
    expect(statusOf({ status: 409 })).toBe(409);
  });

  it("answers undefined for a non-HTTP failure", () => {
    expect(statusOf({ status: "FETCH_ERROR" })).toBeUndefined();
    expect(statusOf(null)).toBeUndefined();
    expect(statusOf("boom")).toBeUndefined();
  });
});
