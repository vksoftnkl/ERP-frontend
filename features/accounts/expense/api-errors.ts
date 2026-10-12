/**
 * The server's own words for a failed expense request.
 *
 * `/expenses/*` answers through its own `ExpenseExceptionFilter` (the house
 * accounts filter): `{ success:false, message, errors:[{ field, message, code? }] }`.
 *  - 400 — class-validator's list, or `Validation failed` with field errors
 *    ("2026-04-01 is not in the year 2025-2026", "supplierGstin must be a
 *    15-character GSTIN");
 *  - 403 — `EXP_RIGHT_<VERB>` on menu 277;
 *  - 409 — not a DRAFT / not POSTED, `TILL_SESSION_CLOSED`, `TILL_SESSION_*`;
 *  - 422 — every refusal at post, each with its code.
 * The envelope's `message` on a 400 is the bare "Validation failed", so the
 * field list is read first; each refusal goes on its own line.
 */
import { getApiErrorMessage } from "@/store/api/baseApi";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function expenseError(error: unknown): string {
  if (isRecord(error) && isRecord(error.data)) {
    const details = error.data.errors;
    if (Array.isArray(details)) {
      const messages = details
        .map((entry) => (isRecord(entry) && typeof entry.message === "string" ? entry.message.trim() : ""))
        .filter((message) => message.length > 0);
      if (messages.length > 0) {
        return [...new Set(messages)].join("\n");
      }
    }
    const message = error.data.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    // The global filter's nested shape: { message: { message, errors } }.
    if (isRecord(message)) {
      return expenseError({ data: message });
    }
  }
  if (isRecord(error) && error.status === "FETCH_ERROR") {
    return "The server could not be reached.";
  }
  return getApiErrorMessage(error as Parameters<typeof getApiErrorMessage>[0]) ?? "Request failed.";
}

/** The HTTP status, when there is one. */
export function expenseErrorStatus(error: unknown): number | undefined {
  return isRecord(error) && typeof error.status === "number" ? error.status : undefined;
}
