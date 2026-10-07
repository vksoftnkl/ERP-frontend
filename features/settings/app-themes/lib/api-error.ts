/**
 * The theme routes answer a 400 as `{ message: "Validation failed", errors:
 * [{ field: "tokens.primary", message: "…" }] }`. The shared extractor reads
 * `message` first and so says only "Validation failed"; the field lines are
 * what the operator needs.
 */

type FieldError = { field?: unknown; message?: unknown };

export function apiErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

export function apiErrorText(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const record = error as { message?: unknown; data?: unknown };
  const data = record.data as { message?: unknown; errors?: unknown } | undefined;
  const lines: string[] = [];
  if (data && Array.isArray(data.errors)) {
    for (const entry of data.errors as FieldError[]) {
      const message = typeof entry?.message === "string" ? entry.message.trim() : "";
      if (!message) continue;
      const field = typeof entry.field === "string" && entry.field ? `${entry.field}: ` : "";
      lines.push(`${field}${message}`);
    }
  }
  const head =
    (typeof data?.message === "string" && data.message.trim()) ||
    (typeof record.message === "string" && record.message.trim()) ||
    fallback;
  if (lines.length === 0) return head;
  // A single field error usually repeats the head; say it once.
  if (lines.length === 1 && lines[0].endsWith(head)) return lines[0];
  return `${head}\n${lines.join("\n")}`;
}
