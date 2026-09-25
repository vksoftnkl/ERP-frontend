/**
 * A refusal from the server → one sentence for the operator (plan §12).
 *
 * The ledger-statement exception filter did not exist yet when this was
 * written, and the house filters each wrap a refusal differently
 * (`{ code }`, `{ error: { code } }`, `{ errors: [{ code }] }`, or the code
 * inside `message`). So the code is looked for in all of them. When the
 * filter lands, narrow `findCode` to the shape it really sends.
 */
import { LedgerParseError } from "./parse";
import { displayDate } from "./dates";

export const LEDGER_ERROR_CODES = [
  "LEDGER_NOT_IN_COMPANY",
  "LEDGER_NOT_FOUND",
  "BRANCH_NOT_IN_COMPANY",
  "YEAR_UNKNOWN",
  "RANGE_OUTSIDE_YEAR",
  "RANGE_REVERSED",
  "RANGE_TOO_LARGE",
  "VOUCHER_NOT_FOUND",
  "NO_MENU_RIGHT",
] as const;

export type LedgerErrorCode = (typeof LEDGER_ERROR_CODES)[number];

/** Which filter field a refusal is about, so the strip can outline it. */
export type ErrorField = "ledger" | "branch" | "dates" | null;

export type LedgerError = {
  kind: "refused" | "forbidden" | "unavailable" | "unparsed";
  code: LedgerErrorCode | null;
  message: string;
  field: ErrorField;
  /** Offer Retry: the request may succeed if made again. */
  retryable: boolean;
};

export type ErrorContext = {
  accYear?: string;
  yearBegin?: string | null;
  yearEnd?: string | null;
};

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null;
}

function asCode(value: unknown): LedgerErrorCode | null {
  if (typeof value !== "string") return null;
  return (LEDGER_ERROR_CODES as readonly string[]).includes(value) ? (value as LedgerErrorCode) : null;
}

function codeInText(value: unknown): LedgerErrorCode | null {
  if (typeof value !== "string") return null;
  return LEDGER_ERROR_CODES.find((code) => value.includes(code)) ?? null;
}

function findCode(data: unknown): LedgerErrorCode | null {
  if (!isObj(data)) return codeInText(data);
  const direct = asCode(data.code) ?? asCode(data.errorCode);
  if (direct) return direct;
  if (isObj(data.error)) {
    const nested = asCode(data.error.code) ?? codeInText(data.error.message);
    if (nested) return nested;
  }
  if (Array.isArray(data.errors)) {
    for (const entry of data.errors) {
      const found = isObj(entry) ? (asCode(entry.code) ?? codeInText(entry.message)) : codeInText(entry);
      if (found) return found;
    }
  }
  if (Array.isArray(data.message)) {
    for (const entry of data.message) {
      const found = codeInText(entry);
      if (found) return found;
    }
  }
  return codeInText(data.message);
}

/** The first whole number anywhere in the body under one of these keys. */
function findNumber(data: unknown, keys: readonly string[]): number | null {
  if (!isObj(data)) return null;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  for (const nested of [data.error, data.details, data.meta]) {
    const found = findNumber(nested, keys);
    if (found !== null) return found;
  }
  if (Array.isArray(data.errors)) {
    for (const entry of data.errors) {
      const found = findNumber(entry, keys);
      if (found !== null) return found;
    }
  }
  return null;
}

/** A count for a sentence. Grouped Indian-style; a count is not money. */
function count(value: number): string {
  return value.toLocaleString("en-IN");
}

function serverMessage(data: unknown): string | null {
  if (!isObj(data)) return null;
  if (Array.isArray(data.errors)) {
    const messages = data.errors
      .map((entry) => (isObj(entry) && typeof entry.message === "string" ? entry.message.trim() : ""))
      .filter(Boolean);
    if (messages.length > 0) return messages.join(" ");
  }
  if (Array.isArray(data.message)) return data.message.filter((m) => typeof m === "string").join(" ");
  if (typeof data.message === "string" && data.message.trim() && data.message !== "Validation failed") {
    return data.message.trim();
  }
  return null;
}

function sentenceFor(code: LedgerErrorCode, data: unknown, ctx: ErrorContext): { message: string; field: ErrorField } {
  switch (code) {
    case "LEDGER_NOT_IN_COMPANY":
      return { message: "This ledger belongs to another company.", field: "ledger" };
    case "LEDGER_NOT_FOUND":
      return { message: "That ledger no longer exists.", field: "ledger" };
    case "BRANCH_NOT_IN_COMPANY":
      return { message: "That branch is not part of this company.", field: "branch" };
    case "YEAR_UNKNOWN":
      return {
        message: ctx.accYear
          ? `The year ${ctx.accYear} is not set up for this company.`
          : "This year is not set up for this company.",
        field: null,
      };
    case "RANGE_OUTSIDE_YEAR":
      return {
        message:
          ctx.yearBegin && ctx.yearEnd
            ? `Both dates must fall inside ${displayDate(ctx.yearBegin)} – ${displayDate(ctx.yearEnd)}.`
            : "Both dates must fall inside the fiscal year.",
        field: "dates",
      };
    case "RANGE_REVERSED":
      return { message: "From is after To.", field: "dates" };
    case "RANGE_TOO_LARGE": {
      const rows = findNumber(data, ["totalRows", "rows", "count", "vouchers"]);
      const limit = findNumber(data, ["limit", "maxRows", "max"]);
      const has = rows !== null ? `This range has ${count(rows)} vouchers` : "This range has too many vouchers";
      const cap = limit !== null ? `, and the export limit is ${count(limit)}` : " for one export";
      return { message: `${has}${cap}. Narrow the dates.`, field: "dates" };
    }
    case "VOUCHER_NOT_FOUND":
      return { message: "That voucher could not be found. It may have been deleted.", field: null };
    case "NO_MENU_RIGHT":
      return { message: "You do not have access to the Ledger Statement.", field: null };
  }
}

/** What the fetch layer threw → what the screen says. */
export function toLedgerError(error: unknown, ctx: ErrorContext = {}): LedgerError {
  if (error instanceof LedgerParseError) {
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
  const code = findCode(data);

  if (status === 403 || code === "NO_MENU_RIGHT") {
    return {
      kind: "forbidden",
      code: code ?? null,
      message: "You do not have access to the Ledger Statement.",
      field: null,
      retryable: false,
    };
  }
  if (code) {
    const { message, field } = sentenceFor(code, data, ctx);
    return { kind: "refused", code, message, field, retryable: false };
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
  return {
    kind: "unavailable",
    code: null,
    message: "The report could not be loaded.",
    field: null,
    retryable: true,
  };
}
