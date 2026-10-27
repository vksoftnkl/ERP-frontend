/**
 * Godown Transfer / Branch Outward — what the server's refusals say and where
 * they land. A 422 from the stock filter names each refused FIELD: a
 * `lines.<n>…` entry tints that line on the grid (Qt `showServerRefusal`), a
 * header field (`reasonId`, `toGodownId`, `driverId`, `loadDatetime`, …) is
 * carried to the box that owns it. Pure.
 */
import { CANCEL_REASON_MIN_LENGTH } from "./stock-transfer.constants";
import type { StockErrorDetail } from "./stock-transfer.types";

/** The 422's errors[], wherever the base query left the body. */
export function errorDetailsOf(error: unknown): StockErrorDetail[] {
  const data = (error as { data?: unknown } | null)?.data;
  const errors = (data as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors
    .filter((entry): entry is { field?: unknown; message?: unknown; code?: unknown } => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      field: String(entry.field ?? ""),
      message: String(entry.message ?? ""),
      ...(entry.code ? { code: String(entry.code) } : {}),
    }));
}

/**
 * What the operator reads from a refused request — the server's headline, then
 * every `errors[]` entry as "• field — message".
 */
export function apiErrorText(error: unknown): string {
  const record = (error ?? {}) as { data?: unknown; message?: unknown };
  const data = (record.data ?? {}) as { message?: unknown; errors?: unknown };
  const lines: string[] = [];
  if (typeof data.message === "string" && data.message.trim()) {
    lines.push(data.message.trim());
  } else if (data.message && typeof data.message === "object") {
    const nested = (data.message as { message?: unknown }).message;
    if (Array.isArray(nested)) {
      lines.push(...nested.map((entry) => String(entry)));
    } else if (typeof nested === "string" && nested.trim()) {
      lines.push(nested.trim());
    }
  } else if (typeof record.message === "string" && record.message.trim()) {
    lines.push(record.message.trim());
  }
  if (Array.isArray(data.errors)) {
    for (const entry of data.errors) {
      if (typeof entry === "string") {
        lines.push(entry);
        continue;
      }
      const field = String((entry as { field?: unknown })?.field ?? "");
      const message = String((entry as { message?: unknown })?.message ?? "");
      if (!message || lines.includes(message)) {
        continue;
      }
      lines.push(field ? `• ${field} — ${message}` : message);
    }
  }
  return lines.join("\n") || "An unexpected error occurred.";
}

export function httpStatusOf(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : 0;
}

/** The server's machine code on a refusal (`TRF_RIGHT_POST`, `STOCK_TRANSFER_RECALL_RECEIVED`, …). */
export function errorCodeOf(error: unknown): string {
  const data = (error as { data?: { code?: unknown; errorCode?: unknown } } | null)?.data;
  return String(data?.code ?? data?.errorCode ?? "");
}

export type MappedRefusal = {
  /** line key -> the server's message */
  lines: Record<string, string>;
  /** header field -> the server's message */
  header: Record<string, string>;
};

/** `lines.<n>…` back to the line sent as the n-th; every other field to the header. */
export function mapServerRefusal(errors: readonly StockErrorDetail[] | undefined, sentKeys: readonly string[]): MappedRefusal {
  const mapped: MappedRefusal = { lines: {}, header: {} };
  for (const error of errors ?? []) {
    const match = /^lines\.(\d+)/.exec(error?.field ?? "");
    if (match) {
      const key = sentKeys[Number(match[1])];
      if (key && !mapped.lines[key]) {
        mapped.lines[key] = error.message ?? "";
      }
      continue;
    }
    const field = (error?.field ?? "").replace(/^header\./, "");
    if (field && !mapped.header[field]) {
      mapped.header[field] = error.message ?? "";
    }
  }
  return mapped;
}

const LOADING_FIELDS = ["loadDatetime", "loadmanIds", "driverId", "supervisorId", "vehicleId", "vehicleNo"];
const UNLOADING_FIELDS = ["unloadDatetime", "unloadmanIds", "unloadSupervisorId"];

/** The first refusal belonging to the Loading (or Unloading) box. */
export function handlingProblem(header: Readonly<Record<string, string>>, box: "load" | "unload"): string {
  for (const field of box === "load" ? LOADING_FIELDS : UNLOADING_FIELDS) {
    if (header[field]) {
      return header[field];
    }
  }
  return "";
}

/** The validation strip: the first problem, "(+N more)" for the rest (Qt `refreshValidationStrip`). */
export function validationStrip(
  clientProblems: ReadonlyMap<string, string>,
  serverProblems: Readonly<Record<string, string>>,
  lineNumbers: ReadonlyMap<string, number>,
  headerProblems: Readonly<Record<string, string>>,
): { text: string; problems: Map<string, string> } | null {
  const all = new Map<string, string>();
  for (const [key, message] of Object.entries(serverProblems)) {
    const number = lineNumbers.get(key);
    all.set(key, number ? `Line ${number} — ${message}` : message);
  }
  for (const [key, message] of clientProblems) {
    if (!all.has(key)) {
      all.set(key, message);
    }
  }
  const header = Object.values(headerProblems).filter(Boolean);
  const total = all.size + header.length;
  if (total === 0) {
    return null;
  }
  const first = all.size > 0 ? [...all.values()][0] : header[0];
  return {
    text: `Validation · ${first}${total > 1 ? `   (+${total - 1} more)` : ""}`,
    problems: all,
  };
}

/** The cancel / recall prompt's answer, refused the way the DTO refuses it. */
export function cancelReasonProblem(reason: string): string | null {
  const reasonText = reason.trim();
  if (!reasonText) {
    return "Type the reason — a reversed transfer with no reason is unanswerable later.";
  }
  if (reasonText.length < CANCEL_REASON_MIN_LENGTH) {
    return `The reason must say something — at least ${CANCEL_REASON_MIN_LENGTH} characters.`;
  }
  return null;
}
