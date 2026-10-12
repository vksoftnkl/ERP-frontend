/**
 * The till routes answer a refusal through their own filter as
 * `{ success:false, message, errors: [{ field, code, message }] }`; anything
 * that escapes it comes back in the global filter's nested shape,
 * `{ message: { message, errors } }`. The field lines are what the operator
 * needs; the head alone often says only "Validation failed".
 */
type FieldError = { field?: unknown; message?: unknown };
type ErrorBody = { message?: unknown; errors?: unknown };

function bodyOf(data: unknown): ErrorBody | undefined {
  if (!data || typeof data !== "object") return undefined;
  const body = data as ErrorBody;
  // The global filter wraps the module's body one level down.
  if (body.message && typeof body.message === "object") return body.message as ErrorBody;
  return body;
}

export function tillErrorText(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const record = error as { message?: unknown; data?: unknown };
  const data = bodyOf(record.data);
  const lines: string[] = [];
  if (data && Array.isArray(data.errors)) {
    for (const entry of data.errors as FieldError[]) {
      const message = typeof entry?.message === "string" ? entry.message.trim() : "";
      if (message) lines.push(message);
    }
  }
  const head =
    (typeof data?.message === "string" && data.message.trim()) ||
    (typeof record.message === "string" && record.message.trim()) ||
    fallback;
  if (lines.length === 0) return head;
  if (lines.length === 1 && lines[0].endsWith(head)) return lines[0];
  return `${head}\n${lines.join("\n")}`;
}
