/**
 * The server's own words, shown as they arrive.
 *
 * This module answers `{ success:false, message, errors:[{field, message}] }`,
 * and the per-field messages are the ones written for the operator —
 * "rct00259 was received from Deepan and an amend cannot move it to
 * MADHAVAN…", "…is above accounts.writeoff_approval_above…". The envelope's
 * `message` on a validation failure is the words "Validation failed", which
 * tells nobody anything, so the field list is read first.
 */
import { getApiErrorMessage } from "@/store/api/baseApi";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function receiptError(error: unknown): string {
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

/** The HTTP status, when there is one. 409 means the server disagrees. */
export function statusOf(error: unknown): number | undefined {
  if (isRecord(error) && typeof error.status === "number") {
    return error.status;
  }
  return undefined;
}
