/**
 * The Statement format dialog's model (Qt SettlementFormatDialog): a tender's
 * `tnd_statement_format` as a form — for each field the import reads, the
 * file's column header; for each line kind, the provider's words — and back.
 * Only `gross` is required; the server validates the whole map and lists every
 * problem (SETTLEMENT_FORMAT_INVALID).
 */
import { LINE_KINDS, SETTLEMENT_SOURCES, type FormatPayload, type FormatTestResult, type StatementFormat } from "./types";

/** The fields the import reads (settlement-format.ts COLUMN_KEYS), in order, with Qt's labels. */
export const FORMAT_FIELDS: readonly { key: string; label: string }[] = [
  { key: "gross", label: "gross amount *" },
  { key: "txnOn", label: "txn time" },
  { key: "kind", label: "kind" },
  { key: "terminalId", label: "terminal" },
  { key: "vpa", label: "VPA" },
  { key: "refNo", label: "RRN / UTR" },
  { key: "authCode", label: "auth code" },
  { key: "cardLast4", label: "card last4" },
  { key: "payer", label: "payer" },
  { key: "fee", label: "fee" },
  { key: "tax", label: "GST on fee" },
  { key: "net", label: "net" },
  { key: "payoutRef", label: "payout UTR" },
  { key: "payoutDate", label: "payout date" },
];

export const FORMAT_KINDS = LINE_KINDS;
export const FORMAT_SOURCES = SETTLEMENT_SOURCES;
export const DATE_FORMAT_PLACEHOLDER = "DD/MM/YYYY HH:mm";

export type FormatForm = {
  provider: string;
  source: string;
  dateFormat: string;
  negativeIsRefund: boolean;
  /** field key → header */
  columns: Record<string, string>;
  /** kind → the provider's words, comma-separated as typed */
  kinds: Record<string, string>;
};

export function emptyFormatForm(): FormatForm {
  return {
    provider: "",
    source: "CARD",
    dateFormat: "",
    negativeIsRefund: true,
    columns: Object.fromEntries(FORMAT_FIELDS.map((field) => [field.key, ""])),
    kinds: Object.fromEntries(FORMAT_KINDS.map((kind) => [kind, ""])),
  };
}

export function formFromFormat(format: StatementFormat | null): FormatForm {
  const form = emptyFormatForm();
  if (!format) return form;
  return {
    provider: format.provider,
    source: format.source || "CARD",
    dateFormat: format.dateFormat ?? "",
    negativeIsRefund: format.negativeIsRefund ?? true,
    columns: Object.fromEntries(FORMAT_FIELDS.map((field) => [field.key, format.columns[field.key] ?? ""])),
    kinds: Object.fromEntries(FORMAT_KINDS.map((kind) => [kind, (format.kindMap?.[kind] ?? []).join(", ")])),
  };
}

/** Qt `format()`: the map as typed — blanks left out, words split on commas. */
export function formatFromForm(form: FormatForm): StatementFormat {
  const columns: Record<string, string> = {};
  for (const field of FORMAT_FIELDS) {
    const header = (form.columns[field.key] ?? "").trim();
    if (header) columns[field.key] = header;
  }
  const kindMap: Record<string, string[]> = {};
  for (const kind of FORMAT_KINDS) {
    const words = (form.kinds[kind] ?? "")
      .split(",")
      .map((word) => word.trim())
      .filter((word) => word !== "");
    if (words.length > 0) kindMap[kind] = words;
  }
  const dateFormat = form.dateFormat.trim();
  return {
    version: 1,
    source: form.source,
    provider: form.provider.trim(),
    columns,
    negativeIsRefund: form.negativeIsRefund,
    ...(Object.keys(kindMap).length > 0 ? { kindMap } : {}),
    ...(dateFormat ? { dateFormat } : {}),
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The same map, whatever order its keys were written in. */
export function sameFormat(a: StatementFormat | null, b: StatementFormat | null): boolean {
  if (a === null || b === null) return a === b;
  return canonical(a) === canonical(b);
}

/**
 * What format/test will read: the map as last read / saved, normalised the way
 * the form writes it (Qt keeps `m_saved = format()` right after showing it).
 */
export function savedMapOf(payload: FormatPayload): StatementFormat | null {
  return payload.format ? formatFromForm(formFromFormat(payload.format)) : null;
}

export function terminalText(payload: FormatPayload | null): string {
  if (!payload) return "—";
  const parts = [payload.terminalId, payload.upiVpa].filter((part) => part.trim() !== "");
  return parts.length > 0 ? parts.join(" · ") : "— none (one tender for the shop)";
}

export function settlesText(payload: FormatPayload | null): string {
  if (!payload) return "—";
  return payload.settlementLedgerId
    ? `the tender's settlement ledger · ${payload.settlementDays} day(s)`
    : "⚠ no settlement (bank) ledger — set it on the Tender master, or the import refuses";
}

/** "✓  21 line(s) read · 0 error(s) · 1 payout(s)" and one line per problem. */
export function formatTestSummary(result: FormatTestResult): { summary: string; ok: boolean; problems: string[] } {
  const ok = result.problems.length === 0;
  return {
    ok,
    summary:
      `${ok ? "✓" : "✗"}  ${result.lines.length} line(s) read · ${result.problems.length} error(s) · ` +
      `${result.payouts.length} payout(s)`,
    problems: result.problems.map((p) => `line ${p.lineNo}: ${p.message}`),
  };
}
