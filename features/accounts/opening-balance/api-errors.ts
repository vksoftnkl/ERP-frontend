/**
 * The server's own words, shown as they arrive.
 *
 * This module's errors come back as `{ success:false, message, errors:[{field,
 * message}] }`, and the per-field messages are the ones written for the
 * operator — "…is a bill-by-bill party — enter its opening as bills in the
 * breakup panel…", "…has 5,000.00 settled against it, so its amount, side,
 * reference and date are fixed…". Not one of them needed rewording when the
 * desktop screen was built.
 *
 * The generic extractor cannot be used for them: it prefers the envelope's
 * `message`, which on a validation failure is the word "Validation failed" and
 * tells nobody anything. So the field list is read first and the envelope is
 * only the fallback.
 */
import { getApiErrorMessage } from "@/store/api/baseApi";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function openingBalanceError(error: unknown): string {
  if (isRecord(error) && isRecord(error.data)) {
    const details = error.data.errors;
    if (Array.isArray(details)) {
      const messages = details
        .map((entry) =>
          isRecord(entry) && typeof entry.message === "string" ? entry.message.trim() : "",
        )
        .filter((message) => message.length > 0);
      if (messages.length > 0) {
        return messages.join(" ");
      }
    }
    if (typeof error.data.message === "string" && error.data.message.trim()) {
      return error.data.message.trim();
    }
  }
  return (
    getApiErrorMessage(error as Parameters<typeof getApiErrorMessage>[0]) ?? "Request failed."
  );
}
