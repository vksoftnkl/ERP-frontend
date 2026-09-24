import { describe, expect, it } from "vitest";
import { openingBalanceError } from "./api-errors";

describe("openingBalanceError", () => {
  it("prefers the per-field messages over 'Validation failed'", () => {
    expect(
      openingBalanceError({
        status: 400,
        data: {
          message: "Validation failed",
          errors: [
            { field: "rows[0]", message: " Deepan is a bill-by-bill party. " },
            { field: "rows[1]", message: "" },
            { field: "rows[2]" },
            { field: "rows[3]", message: "Its amount is fixed." },
          ],
        },
      }),
    ).toBe("Deepan is a bill-by-bill party. Its amount is fixed.");
  });

  it("falls back to the envelope message", () => {
    expect(openingBalanceError({ data: { message: " Scope is closed ", errors: [] } })).toBe(
      "Scope is closed",
    );
  });

  it("falls back to the generic extractor for a transport error", () => {
    expect(openingBalanceError({ status: "FETCH_ERROR", message: "Network down" })).toBe(
      "Network down",
    );
  });

  it("never returns an empty sentence", () => {
    expect(openingBalanceError(null)).toBe("Request failed.");
    expect(openingBalanceError({ data: { message: "" } })).toBe("Request failed.");
  });
});
