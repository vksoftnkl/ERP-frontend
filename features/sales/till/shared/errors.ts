/**
 * A till refusal, read out of whatever the request threw.
 *
 * `/till/*` answers through its own `TillExceptionFilter`, which passes the
 * house body through FLAT: `{ success:false, message, errors:[{ field,
 * message, code }] }` at the status the code carries (409, 403, 422, 428 …).
 * Anything that reaches the global `AllExceptionsFilter` instead (a guard, the
 * grid runner) nests it one level down: `{ statusCode, message: { message,
 * errors } }`. Both are read here, so a screen asks for `code` and never
 * learns which filter answered.
 */

export type TillError = {
  /** HTTP status, or null for a network failure. */
  status: number | null;
  /** The first `errors[].code` — `TILL_COUNTER_BUSY` … — or "". */
  code: string;
  field: string;
  /** The head line: what was refused. */
  message: string;
  /** Head and reasons in one sentence, for a message popup. */
  text: string;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The `{ message, errors }` body, wherever the filter put it. */
function bodyOf(data: unknown): { message: string; errors: JsonRecord[] } {
  if (!isRecord(data)) return { message: text(data), errors: [] };
  const nested = isRecord(data.message) ? data.message : null;
  const holder = nested && Array.isArray(nested.errors) ? nested : data;
  const errors = Array.isArray(holder.errors) ? holder.errors.filter(isRecord) : [];
  const message = text(holder.message) || text(nested?.message) || text(data.error);
  return { message, errors };
}

export function tillErrorOf(error: unknown, fallback = "The request failed."): TillError {
  if (!isRecord(error)) {
    const message = text(error) || fallback;
    return { status: null, code: "", field: "", message, text: message };
  }
  const status = typeof error.status === "number" ? error.status : null;
  const { message: head, errors } = bodyOf(error.data);
  const first = errors[0] ?? {};
  const code = text(first.code);
  const field = text(first.field);
  const message = head || text(error.error) || text(error.message) || fallback;
  const details: string[] = [];
  for (const entry of errors) {
    const detail = text(entry.message);
    if (detail && detail !== message && !details.includes(detail)) details.push(detail);
  }
  const joined =
    details.length === 0 ? message : `${message}${/[.!?]$/.test(message) ? " " : ". "}${details.join(" ")}`;
  return { status, code, field, message, text: joined };
}

/** True for a refusal that means "this session is not there". */
export function isSessionGone(error: TillError): boolean {
  return error.status === 404 || error.code === "TILL_SESSION_NOT_FOUND";
}
