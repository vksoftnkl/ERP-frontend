/**
 * The till routes answer a 400 as `{ message, errors: [{ field, message }] }`.
 * The field lines are what the operator needs; the head alone often says only
 * "Validation failed".
 */
type FieldError = { field?: unknown; message?: unknown };

export function tillErrorText(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const record = error as { message?: unknown; data?: unknown };
  const data = record.data as { message?: unknown; errors?: unknown } | undefined;
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
