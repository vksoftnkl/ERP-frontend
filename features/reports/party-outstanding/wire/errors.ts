/**
 * A refusal from the server → one sentence for the operator (plan §14).
 *
 * The shape is the house one, wrapped by the global `AllExceptionsFilter`:
 *
 *     { success: false, statusCode: 422,
 *       message: { success: false, message, errors: [{ field, code, message, count? }] } }
 *
 * The code is looked for in that shape first, and then anywhere else a house
 * filter has been known to put one, so an older wrapper still maps.
 */
import { displayDate } from "@/features/reports/shared/wire/dates";
import { OutstandingParseError } from "./parse";

export const OUTSTANDING_ERROR_CODES = [
  "AS_ON_OUTSIDE_YEARS",
  "BAD_BUCKETS",
  "BAD_SORT",
  "NOT_FOR_PAYABLE",
  "RANGE_TOO_LARGE",
  "RANGE_REVERSED",
  "PARTY_NOT_IN_COMPANY",
  "PARTY_REQUIRED",
  "BRANCH_NOT_IN_COMPANY",
  "BILL_NOT_FOUND",
  "NO_MENU_RIGHT",
] as const;

export type OutstandingErrorCode = (typeof OUTSTANDING_ERROR_CODES)[number];

/** Which filter a refusal is about, so the strip can outline it. */
export type ErrorField = "asOn" | "buckets" | "branch" | "party" | "dueDays" | "calendar" | null;

export type OutstandingError = {
  kind: "refused" | "forbidden" | "unavailable" | "unparsed";
  code: OutstandingErrorCode | null;
  message: string;
  field: ErrorField;
  /** Offer Retry: the request may succeed if made again. */
  retryable: boolean;
};

export type ErrorContext = { asOn?: string };

/** The server's export cap (backend plan §5.9), used when the refusal does not name it. */
export const EXPORT_ROW_CAP = 20_000;

export const NO_ACCESS_MESSAGE = "You do not have access to Party-wise Outstanding.";

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCode(value: unknown): OutstandingErrorCode | null {
  if (typeof value !== "string") return null;
  return (OUTSTANDING_ERROR_CODES as readonly string[]).includes(value) ? (value as OutstandingErrorCode) : null;
}

function codeInText(value: unknown): OutstandingErrorCode | null {
  if (typeof value !== "string") return null;
  return OUTSTANDING_ERROR_CODES.find((code) => value.includes(code)) ?? null;
}

/** The refusal detail: the first `{ code }` the body carries, wherever it sits. */
type Detail = { code: OutstandingErrorCode; field: string | null; detail: Obj };

function findDetail(data: unknown, depth = 0): Detail | null {
  if (depth > 4) return null;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findDetail(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isObj(data)) {
    const code = codeInText(data);
    return code ? { code, field: null, detail: {} } : null;
  }
  const direct = asCode(data.code) ?? asCode(data.errorCode);
  if (direct) return { code: direct, field: typeof data.field === "string" ? data.field : null, detail: data };
  for (const key of ["errors", "message", "error", "details"]) {
    const found = findDetail(data[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** The body inside the global filter's wrapper, or the body itself. */
function unwrap(data: unknown): unknown {
  return isObj(data) && isObj(data.message) ? data.message : data;
}

function serverMessage(data: unknown): string | null {
  const body = unwrap(data);
  if (!isObj(body)) return null;
  if (Array.isArray(body.errors)) {
    const messages = body.errors
      .map((entry) => (isObj(entry) && typeof entry.message === "string" ? entry.message.trim() : ""))
      .filter(Boolean);
    if (messages.length > 0) return messages.join(" ");
  }
  if (Array.isArray(body.message)) return body.message.filter((m) => typeof m === "string").join(" ");
  if (typeof body.message === "string" && body.message.trim() && body.message !== "Validation failed") {
    return body.message.trim();
  }
  return null;
}

/** A count for a sentence. Grouped Indian-style; a count is not money. */
function count(value: number): string {
  return value.toLocaleString("en-IN");
}

function numberIn(detail: Obj, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = detail[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function sentenceFor(found: Detail, ctx: ErrorContext): { message: string; field: ErrorField } {
  const { code, field, detail } = found;
  switch (code) {
    case "AS_ON_OUTSIDE_YEARS":
      return {
        message: ctx.asOn
          ? `${displayDate(ctx.asOn)} is outside every financial year set up for this company.`
          : "As on is outside every financial year set up for this company.",
        field: "asOn",
      };
    case "BAD_BUCKETS":
      return { message: "Buckets must be rising whole numbers of days, e.g. 30 60 90 180.", field: "buckets" };
    case "BAD_SORT":
      return { message: "That column cannot be sorted with these buckets. Press Show to re-sort.", field: null };
    case "NOT_FOR_PAYABLE":
      return { message: "Area / salesman filters apply to customers only.", field: null };
    case "RANGE_TOO_LARGE": {
      if (field === "to" || field === "from") {
        return { message: "The due calendar shows at most 92 days. Narrow From – To.", field: "calendar" };
      }
      const rows = numberIn(detail, ["count", "totalRows", "rows"]);
      const limit = numberIn(detail, ["limit", "maxRows", "max"]) ?? EXPORT_ROW_CAP;
      const has = rows !== null ? `This list has ${count(rows)} rows` : "This list has too many rows";
      return { message: `${has}, and the export limit is ${count(limit)}. Narrow the filters.`, field: null };
    }
    case "RANGE_REVERSED":
      if (field === "minDueDays" || field === "maxDueDays") {
        return { message: "Due days ≥ is more than Due days ≤.", field: "dueDays" };
      }
      return { message: "From is after To.", field: "calendar" };
    case "PARTY_NOT_IN_COMPANY":
      return { message: "This party belongs to another company.", field: "party" };
    case "PARTY_REQUIRED":
      return { message: "Choose a party first.", field: "party" };
    case "BRANCH_NOT_IN_COMPANY":
      return { message: "That branch is not part of this company.", field: "branch" };
    case "BILL_NOT_FOUND":
      return { message: "That bill could not be found. It may have been deleted.", field: null };
    case "NO_MENU_RIGHT":
      return { message: NO_ACCESS_MESSAGE, field: null };
  }
}

/** What the fetch layer threw → what the screen says. */
export function toOutstandingError(error: unknown, ctx: ErrorContext = {}): OutstandingError {
  if (error instanceof OutstandingParseError) {
    return {
      kind: "unparsed",
      code: null,
      message: `The server's answer was not understood (${error.route}: ${error.path}).`,
      field: null,
      retryable: false,
    };
  }
  const status = isObj(error) && typeof error.status === "number" ? error.status : undefined;
  const data = isObj(error) ? error.data : undefined;
  const found = findDetail(data);

  if (status === 403 || found?.code === "NO_MENU_RIGHT") {
    return { kind: "forbidden", code: found?.code ?? null, message: NO_ACCESS_MESSAGE, field: null, retryable: false };
  }
  if (found) {
    const { message, field } = sentenceFor(found, ctx);
    return { kind: "refused", code: found.code, message, field, retryable: false };
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return {
      kind: "refused",
      code: null,
      message: serverMessage(data) ?? "The report request was refused.",
      field: null,
      retryable: false,
    };
  }
  return { kind: "unavailable", code: null, message: "The report could not be loaded.", field: null, retryable: true };
}
