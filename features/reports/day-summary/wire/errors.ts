/**
 * A refusal from the server → one sentence for the operator (plan §11).
 *
 * The house shape, wrapped by the global `AllExceptionsFilter`:
 *
 *     { success: false, statusCode: 400,
 *       message: { success: false, message, errors: [{ field, code, message, count? }] } }
 *
 * The code is looked for in that shape first, and then anywhere else a house
 * filter has been known to put one, so an older wrapper still maps. The error
 * family is `DAY_SUMMARY_ERROR` (backend §9); the codes below are its members.
 */
import { DaySummaryParseError } from "./parse";

export const DAY_SUMMARY_ERROR_CODES = [
  "RANGE_OUTSIDE_YEAR",
  "RANGE_REVERSED",
  "BRANCH_NOT_IN_COMPANY",
  "YEAR_UNKNOWN",
  "TYPE_UNKNOWN",
  "GROUP_UNKNOWN",
  "CHECK_UNKNOWN",
  "RANGE_TOO_LARGE",
  "NO_MENU_RIGHT",
] as const;

export type DaySummaryErrorCode = (typeof DAY_SUMMARY_ERROR_CODES)[number];

/** Which filter a refusal is about, so the strip can outline it. */
export type ErrorField = "dates" | "branch" | "type" | null;

export type DaySummaryError = {
  kind: "refused" | "forbidden" | "unavailable" | "unparsed";
  code: DaySummaryErrorCode | null;
  message: string;
  field: ErrorField;
  /** Offer Retry: the request may succeed if made again. */
  retryable: boolean;
};

/** `route` names the call in the catch-all sentence; `accYear` fills the year ones. */
export type ErrorContext = { route?: string; accYear?: string };

export const NO_ACCESS_MESSAGE = "You do not have the Account Day Summary right.";

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCode(value: unknown): DaySummaryErrorCode | null {
  if (typeof value !== "string") return null;
  return (DAY_SUMMARY_ERROR_CODES as readonly string[]).includes(value) ? (value as DaySummaryErrorCode) : null;
}

function codeInText(value: unknown): DaySummaryErrorCode | null {
  if (typeof value !== "string") return null;
  return DAY_SUMMARY_ERROR_CODES.find((code) => value.includes(code)) ?? null;
}

type Detail = { code: DaySummaryErrorCode; detail: Obj };

/** The first `{ code }` the body carries, wherever it sits. */
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
    return code ? { code, detail: {} } : null;
  }
  const direct = asCode(data.code) ?? asCode(data.errorCode);
  if (direct) return { code: direct, detail: data };
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
  const year = ctx.accYear ? ` ${ctx.accYear}` : "";
  switch (found.code) {
    case "RANGE_OUTSIDE_YEAR":
      return { message: `The dates must be inside the year${year}.`, field: "dates" };
    case "RANGE_REVERSED":
      return { message: "The To date is before the Date.", field: "dates" };
    case "BRANCH_NOT_IN_COMPANY":
      return { message: "That branch is not in this company.", field: "branch" };
    case "YEAR_UNKNOWN":
      return { message: `No financial year${year} for this company.`, field: null };
    case "TYPE_UNKNOWN":
      return { message: "That voucher type no longer exists — reload the screen.", field: "type" };
    case "GROUP_UNKNOWN":
      return { message: "That group is not visible to this company — press Show again.", field: null };
    case "CHECK_UNKNOWN":
      return { message: "The server does not know that check — reload the screen.", field: null };
    case "RANGE_TOO_LARGE": {
      const rows = numberIn(found.detail, ["count", "totalRows", "rows"]);
      return {
        message: `Too many vouchers to export${rows !== null ? ` (${count(rows)})` : ""}. Narrow the range or pick a type.`,
        field: null,
      };
    }
    case "NO_MENU_RIGHT":
      return { message: NO_ACCESS_MESSAGE, field: null };
  }
}

/** What the fetch layer threw → what the screen says. */
export function toDaySummaryError(error: unknown, ctx: ErrorContext = {}): DaySummaryError {
  if (error instanceof DaySummaryParseError) {
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
  if (status !== undefined && status >= 400 && status < 500 && status !== 404 && status !== 408 && status !== 429) {
    return {
      kind: "refused",
      code: null,
      message: serverMessage(data) ?? "The day summary request was refused.",
      field: null,
      retryable: false,
    };
  }
  // Network, 5xx, and a 404 (the route not deployed yet) all read the same way.
  return {
    kind: "unavailable",
    code: null,
    message: `Could not load the day summary${ctx.route ? ` (${ctx.route})` : ""}. Try Show again.`,
    field: null,
    retryable: true,
  };
}
