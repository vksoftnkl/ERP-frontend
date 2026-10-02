/**
 * One sentence out of a failed request, title AND reason.
 *
 * The settings modules answer a refusal as
 * `{ success: false, message: "This company is still in use",
 *    errors: [{ field: "compId", message: "Used by 2 live branches. …" }] }`.
 * `useApi`'s popup reads `message` alone, which names the refusal but drops
 * the reason — the part the operator can act on. This joins the two.
 */

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** `title. detail detail`, without doubling a detail that repeats the title. */
export function joinServerErrorBody(body: unknown): string {
  if (!isRecord(body)) {
    return text(body);
  }
  const title = text(body.message) || text(body.error);
  const details: string[] = [];
  const errors = Array.isArray(body.errors) ? body.errors : [];
  for (const entry of errors) {
    const detail = isRecord(entry) ? text(entry.message) : text(entry);
    if (detail && detail !== title && !details.includes(detail)) {
      details.push(detail);
    }
  }
  if (!title) {
    return details.join(" ");
  }
  if (details.length === 0) {
    return title;
  }
  const separator = /[.!?]$/.test(title) ? " " : ". ";
  return `${title}${separator}${details.join(" ")}`;
}

/** The message for a thrown request: the response body when there is one, else the error's own. */
export function describeServerError(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const response = isRecord(error.response) ? error.response : null;
    if (response) {
      return joinServerErrorBody(response.data) || fallback;
    }
    return text(error.message) || fallback;
  }
  return text(error) || fallback;
}
