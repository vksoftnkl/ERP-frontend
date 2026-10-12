import { describe, expect, it } from "vitest";
import { expenseError, expenseErrorStatus } from "./api-errors";

describe("expenseError", () => {
  it("reads every refusal of a 422, one per line, without repeats", () => {
    const error = {
      status: 422,
      data: {
        success: false,
        message: "Expense voucher cannot be posted",
        errors: [
          { field: "tenders", code: "EXPENSE_TOTAL_MISMATCH", message: "The lines come to 1300.00 and the tenders to 1120.00: they must be equal" },
          { field: "lines.2.ledgerId", code: "EXPENSE_LEDGER_NOT_EXPENSE", message: "Row 2: Cash is not an expense ledger" },
          { field: "lines.2.ledgerId", code: "EXPENSE_LEDGER_NOT_EXPENSE", message: "Row 2: Cash is not an expense ledger" },
        ],
      },
    };
    expect(expenseError(error)).toBe(
      "The lines come to 1300.00 and the tenders to 1120.00: they must be equal\nRow 2: Cash is not an expense ledger",
    );
    expect(expenseErrorStatus(error)).toBe(422);
  });

  it("prefers the field list over a bare 'Validation failed'", () => {
    expect(
      expenseError({
        status: 400,
        data: { message: "Validation failed", errors: [{ field: "voucherDate", message: "2026-04-01 is not in the year 2025-2026" }] },
      }),
    ).toBe("2026-04-01 is not in the year 2025-2026");
  });

  it("falls back to the envelope's message, the nested global shape, and a network failure", () => {
    expect(expenseError({ status: 409, data: { message: "Expense voucher cannot be cancelled", errors: [] } })).toBe(
      "Expense voucher cannot be cancelled",
    );
    expect(
      expenseError({ status: 500, data: { statusCode: 500, message: { message: "x", errors: [{ field: "f", message: "Nested" }] } } }),
    ).toBe("Nested");
    expect(expenseError({ status: "FETCH_ERROR", error: "TypeError" })).toBe("The server could not be reached.");
    expect(expenseErrorStatus({ status: "FETCH_ERROR" })).toBeUndefined();
  });
});
