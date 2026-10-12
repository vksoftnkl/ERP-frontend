/**
 * A refusal, read the way the server writes it.
 *
 * /tender-settlement/* has its own filter (tender-settlement-exception.filter
 * → ModuleExceptionFilter): `{ success:false, message, errors:[{ field,
 * message, code, …extra }] }` at the code's status, FLAT — a SETTLEMENT_* or
 * NONCASH_* code on each detail, a rights refusal as TSET_RIGHT_<VERB>. A file
 * that does not read lists every bad row (SETTLEMENT_FILE_INVALID), a map every
 * problem (SETTLEMENT_FORMAT_INVALID). The global AllExceptionsFilter's nested
 * `{ statusCode, message: { message, errors } }` is read too, for a route that
 * answers through it (the grid runner, a 401 before the controller).
 */
type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null;
}

/** The body of the error: RTK's `{ status, data }`, unwrapped once more when nested. */
function bodyOf(error: unknown): Obj | null {
  if (!isObj(error)) return null;
  const data = isObj(error.data) ? error.data : error;
  if (isObj(data.message) && !Array.isArray(data.message) && !Array.isArray(data.errors)) {
    return data.message;
  }
  return data;
}

function detailsOf(error: unknown): Obj[] {
  const body = bodyOf(error);
  const errors = body?.errors;
  return Array.isArray(errors) ? errors.filter(isObj) : [];
}

function messageIn(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(messageIn).filter(Boolean).join(" ");
  if (isObj(value)) return messageIn(value.message);
  return "";
}

/** The first detail's code (`SETTLEMENT_FORMAT_MISSING`, `TSET_RIGHT_EDIT` …), or "". */
export function settlementErrorCode(error: unknown): string {
  for (const detail of detailsOf(error)) {
    if (typeof detail.code === "string" && detail.code) return detail.code;
  }
  return "";
}

/** Every detail's message — a file's bad rows, a map's problems. */
export function settlementErrorDetails(error: unknown): string[] {
  return detailsOf(error)
    .map((detail) => messageIn(detail.message))
    .filter((message) => message !== "");
}

export function settlementErrorStatus(error: unknown): number | null {
  return isObj(error) && typeof error.status === "number" ? error.status : null;
}

/**
 * The sentence to show. The per-row messages are written for the operator;
 * the envelope's "Validation failed" tells nobody anything, so details come
 * first, the envelope after.
 */
export function settlementErrorMessage(error: unknown): string {
  const details = settlementErrorDetails(error);
  if (details.length > 0) {
    const envelope = messageIn(bodyOf(error)?.message);
    // "3 row(s) of the file cannot be read" over the rows themselves.
    return details.length > 1 && envelope && envelope !== "Validation failed"
      ? [envelope, ...details].join("\n")
      : details.join("\n");
  }
  const envelope = messageIn(bodyOf(error)?.message);
  if (envelope) return envelope;
  if (isObj(error)) {
    const own = messageIn(error.message) || messageIn(error.error);
    if (own) return own;
  }
  return "The request failed.";
}
