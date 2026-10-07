/**
 * Small readers shared by both screens: a refusal's text and code, and the
 * dd-mm-yyyy hh:mm stamps the Qt panels show.
 */
import { joinServerErrorBody } from "@/features/masters/shared/server-error-text";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The refusal as one sentence: `message` AND each `errors[].message` — the
 * reason ("CHARTERED is still used by 2 live credentials") is the part the
 * operator can act on. An RTK Query error carries the body in `data`.
 */
export function gstErrorText(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    const fromBody = joinServerErrorBody(error.data);
    if (fromBody) {
      return fromBody;
    }
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
  }
  return fallback;
}

/** The first `errors[].code` (GST_*), which is what a screen branches on. */
export function gstErrorCode(error: unknown): string {
  if (!isRecord(error) || !isRecord(error.data)) {
    return "";
  }
  const errors = error.data.errors;
  const first = Array.isArray(errors) ? errors[0] : null;
  return isRecord(first) && typeof first.code === "string" ? first.code : "";
}

/** The first `errors[].message`, alone. */
export function gstFirstErrorMessage(error: unknown): string {
  if (!isRecord(error) || !isRecord(error.data)) {
    return "";
  }
  const errors = error.data.errors;
  const first = Array.isArray(errors) ? errors[0] : null;
  return isRecord(first) && typeof first.message === "string" ? first.message.trim() : "";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `dd-MM-yyyy HH:mm` in local time, or "—". */
export function formatStamp(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `dd-MM HH:mm` — the credential list's short Verified column. */
export function formatShortStamp(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Today, as the date field edits it. */
export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
