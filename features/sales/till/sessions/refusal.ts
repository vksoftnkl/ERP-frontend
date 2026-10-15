/**
 * A refusal as the cockpit's exception dialogs show it (Qt c77f3f1: Approve
 * Cash, Force close, Reopen): the server's own sentence — the FIRST error's
 * message, else the head message — under the form. Who may (the cashier, the
 * grant, the limit, the PIN) is the server's call, so it is said as the
 * server says it. A PIN refusal (any code naming PIN, or the approverPin
 * field) clears the PIN and puts the focus back in it.
 */
import { tillErrorOf } from "../shared/errors";

export type DialogRefusal = {
  line: string;
  /** The PIN was refused: typed again from empty. */
  pin: boolean;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** `errors[0].message`, wherever the filter put the body (flat, or nested one level). */
function firstErrorMessage(error: unknown): string {
  if (!isRecord(error) || !isRecord(error.data)) return "";
  const data = error.data;
  const holder = isRecord(data.message) && Array.isArray(data.message.errors) ? data.message : data;
  const errors = Array.isArray(holder.errors) ? holder.errors : [];
  const first = errors.find(isRecord);
  return typeof first?.message === "string" ? first.message.trim() : "";
}

export function dialogRefusal(error: unknown, fallback: string): DialogRefusal {
  const read = tillErrorOf(error, fallback);
  return {
    line: firstErrorMessage(error) || read.message,
    pin: read.code.includes("PIN") || read.field === "approverPin",
  };
}
