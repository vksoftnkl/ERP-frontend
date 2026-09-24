import { describe, expect, it } from "vitest";
import { chequeError } from "./api-errors";

describe("chequeError", () => {
  it("prefers the per-field messages over 'Validation failed'", () => {
    expect(
      chequeError({
        data: {
          message: "Validation failed",
          errors: [
            { field: "status", message: " 55491 is CLEARED. " },
            { field: "x", message: "" },
            { field: "date", message: "The date is before the deposit." },
          ],
        },
      }),
    ).toBe("55491 is CLEARED. The date is before the deposit.");
  });

  it("reads plain strings and nested arrays in the error list", () => {
    expect(chequeError({ data: { errors: ["One.", [{ message: "Two." }, "Three."]] } })).toBe(
      "One. Two. Three.",
    );
  });

  it("reads the configured-grid runner's nested message", () => {
    expect(
      chequeError({ data: { message: { message: "Grid 109 configured SQL failed: boom" } } }),
    ).toBe("Grid 109 configured SQL failed: boom");
  });

  it("falls back to the envelope message when the list is empty", () => {
    expect(chequeError({ data: { message: "Not found", errors: [] } })).toBe("Not found");
  });

  it("reads a transport error's message, then its error text", () => {
    expect(chequeError({ status: "FETCH_ERROR", message: "Failed to fetch" })).toBe(
      "Failed to fetch",
    );
    expect(chequeError({ status: "PARSING_ERROR", error: "Unexpected token <" })).toBe(
      "Unexpected token <",
    );
  });

  it("never returns an empty sentence", () => {
    expect(chequeError(null)).toBe("The request failed.");
    expect(chequeError("boom")).toBe("The request failed.");
    expect(chequeError({ data: { message: "  ", errors: [{ message: "" }] } })).toBe(
      "The request failed.",
    );
  });
});
