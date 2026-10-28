/**
 * The report screen's words and files — Qt `PriceChangeLogEntry` (refresh,
 * stepDays, paintDays, paintTotals, loadGaps, filterSummary, exportCsv,
 * print), as pure functions.
 */
import { addDays, daysInclusive, isIsoDate } from "@/features/reports/shared/wire/dates";
import { formatClock12 } from "@/lib/time-format";
import type { PriceLogDay, PriceLogGaps, PriceLogRow } from "../wire/types";
import { buildLines } from "./grid-model";
import {
  actionLabel,
  appliesText,
  branchText,
  changeText,
  countText,
  dateText,
  dayText,
  deviceText,
  itemText,
  sourceLabel,
  timeText,
  whoText,
} from "./words";

/** The route refuses a longer range (400 IPCL_BAD_RANGE); the screen asks first. */
export const MAX_RANGE_DAYS = 366;
/** `/list` pages read per refresh: 20 × 500 = 10,000 changes is enough to read on one screen. */
export const MAX_PAGES = 20;
/** The day strip shows the latest days; the grid has every one. */
export const MAX_DAY_CHIPS = 14;

export const RANGE_TOO_LONG = "Pick at most one year at a time.";

export type RangeCheck =
  | { ok: true; from: string; to: string; swapped: boolean }
  | { ok: false; reason: "invalid" | "too-long" };

/** From after To is swapped (Qt does it on screen); more than 366 days apart is refused. */
export function checkRange(from: string, to: string): RangeCheck {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return { ok: false, reason: "invalid" };
  }
  const swapped = from > to;
  const [a, b] = swapped ? [to, from] : [from, to];
  if (daysInclusive(a, b) - 1 > MAX_RANGE_DAYS) {
    return { ok: false, reason: "too-long" };
  }
  return { ok: true, from: a, to: b, swapped };
}

/** ◀ ▶ move the whole range by its own length: one day stays one day. */
export function stepRange(from: string, to: string, delta: -1 | 1): { from: string; to: string } | null {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    return null;
  }
  const span = Math.abs(daysInclusive(from, to)) || 1;
  return { from: addDays(from, delta * span), to: addDays(to, delta * span) };
}

/** The gap check in the title: should read 0. */
export function gapsLabel(gaps: Pick<PriceLogGaps, "since" | "total">): { text: string; tone: "ok" | "bad" } {
  const total = Number(gaps.total) || 0;
  if (total > 0) {
    return { text: `${total} price row${total === 1 ? "" : "s"} changed outside the log`, tone: "bad" };
  }
  const since = gaps.since && /^\d{4}-\d{2}-\d{2}/.test(gaps.since) ? dateText(gaps.since.slice(0, 10)) : "";
  return {
    text: since ? `Recorded from ${since} · 0 changes outside the log ✓` : "Nothing recorded yet",
    tone: "ok",
  };
}

export const GAPS_TOOLTIP =
  "Price rows changed since the log began whose change is not in the log. It should always be 0.";

export type DayChip = { day: string; label: string; sub: string };

/** One chip per day with changes, newest first, the latest 14. */
export function dayChips(days: readonly PriceLogDay[] | null | undefined): DayChip[] {
  return [...(days ?? [])]
    .filter((d) => d && typeof d.day === "string")
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .slice(0, MAX_DAY_CHIPS)
    .map((d) => ({
      day: d.day,
      label: dayText(d.day),
      sub: `${countText(Number(d.changes) || 0, "change", "changes")} · ${countText(Number(d.items) || 0, "item", "items")}`,
    }));
}

/** "6 changes · 3 items · 2 users · 2 devices", and the cap note when the range ran past it. */
export function totalsText(rows: readonly PriceLogRow[], total: number): { text: string; cap: string } {
  const items = new Set<string>();
  const users = new Set<string>();
  const devices = new Set<string>();
  for (const row of rows) {
    items.add(row.itemId ?? "");
    users.add(row.userId ?? "");
    devices.add(row.deviceId ?? "");
  }
  const text = rows.length
    ? [
        countText(rows.length, "change", "changes"),
        countText(items.size, "item", "items"),
        countText(users.size, "user", "users"),
        countText(devices.size, "device", "devices"),
      ].join(" · ")
    : "No price changes in this range";
  const cap = total > rows.length ? `(first ${rows.length} of ${total} — narrow the range)` : "";
  return { text, cap };
}

/** How many OTHER loaded rows the same save changed. */
export function sameSaveOthers(rows: readonly PriceLogRow[], row: PriceLogRow): number {
  if (!row.changeSetId) return 0;
  return rows.filter((r) => r.changeSetId === row.changeSetId && r.ipclId !== row.ipclId).length;
}

export type SummaryInput = {
  from: string;
  to: string;
  branchName?: string | null;
  itemName?: string | null;
  /** The chosen Show / Source / Action words, or null for the first ("any") choice. */
  tableWord?: string | null;
  sourceWord?: string | null;
  actionWord?: string | null;
  userName?: string | null;
  search?: string | null;
};

/** "23-10-2026 to 23-10-2026 · every branch · Samsung H1 · by VKPOS · “sam”" — the print heading. */
export function filterSummary(f: SummaryInput): string {
  const parts = [`${dateText(f.from)} to ${dateText(f.to)}`, f.branchName || "every branch"];
  if (f.itemName) parts.push(f.itemName);
  if (f.tableWord) parts.push(f.tableWord);
  if (f.sourceWord) parts.push(f.sourceWord);
  if (f.actionWord) parts.push(f.actionWord);
  if (f.userName) parts.push(`by ${f.userName}`);
  const search = (f.search ?? "").trim();
  if (search) parts.push(`“${search}”`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const CSV_HEADER = [
  "Date",
  "Time",
  "Item code",
  "Item",
  "Unit",
  "Branch",
  "Applies to",
  "Action",
  "What changed",
  "Changed fields",
  "By",
  "Device",
  "IP",
  "App",
  "Source",
  "Menu",
  "Reason",
] as const;

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** The rows as shown, the Qt columns, every cell quoted. */
export function csvText(rows: readonly PriceLogRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    const menu = typeof r.menuId === "number" && Number.isFinite(r.menuId) ? String(r.menuId) : "";
    const cells = [
      dateText(r.day),
      timeText(r.changedOn),
      r.itemCode ?? "",
      r.itemName ?? "",
      r.unitName ?? "",
      branchText(r),
      appliesText(r),
      actionLabel(r.action),
      changeText(r),
      (r.changedLabels ?? []).join(", "),
      whoText(r),
      r.deviceName ?? "",
      r.ip ?? "",
      r.app ?? "",
      sourceLabel(r.source),
      menu,
      r.reason ?? "",
    ];
    lines.push(cells.map(quote).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** `price-changes-2026-10-01-2026-10-23.csv`. */
export function csvFileName(from: string, to: string): string {
  return `price-changes-${from}-${to}.csv`;
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "Printed 23/10/2026 02:10 PM by VKPOS". */
export function printedLine(now: Date, userName: string | null | undefined): string {
  const when = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${formatClock12(now)}`;
  return `Printed ${when} by ${userName || "—"}`;
}

export const PRINT_COLUMNS = [
  "Time",
  "Item",
  "Unit",
  "Branch",
  "Applies to",
  "What changed",
  "By",
  "Device",
  "Source",
  "Reason",
] as const;

/**
 * The printout (Qt `print()`): a landscape HTML table — the title, the filter
 * summary and who printed it, then the rows with a header row per day.
 */
export function printHtml(input: {
  rows: readonly PriceLogRow[];
  days?: readonly PriceLogDay[] | null;
  summary: string;
  printed: string;
  title?: string;
}): string {
  const title = input.title ?? "Price Change Log";
  const body: string[] = [];
  for (const line of buildLines(input.rows, input.days)) {
    if (line.kind === "day") {
      body.push(`<tr class="day"><td colspan="${PRINT_COLUMNS.length}"><b>${escapeHtml(line.dayLabel)}</b></td></tr>`);
      continue;
    }
    const r = line.row;
    const cells = [
      timeText(r.changedOn),
      itemText(r),
      r.unitName ?? "",
      branchText(r),
      appliesText(r),
      changeText(r),
      whoText(r),
      deviceText(r),
      sourceLabel(r.source),
      r.reason ?? "",
    ];
    body.push(`<tr>${cells.map((c) => `<td>${c ? escapeHtml(c) : "&nbsp;"}</td>`).join("")}</tr>`);
  }
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<title>${escapeHtml(`${title} — ${input.summary}`)}</title>`,
    "<style>",
    "@page { size: A4 landscape; margin: 10mm; }",
    "body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8pt; color: #000; margin: 0; }",
    "h2 { margin: 0 0 4pt; font-size: 13pt; }",
    "p { margin: 0 0 6pt; }",
    "table { width: 100%; border-collapse: collapse; }",
    "th, td { border: 1px solid #555; padding: 2pt 3pt; text-align: left; vertical-align: top; }",
    "thead { display: table-header-group; }",
    "tr { page-break-inside: avoid; }",
    "tr.day td { background: #eef1f5; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    "</style></head><body>",
    `<h2>${escapeHtml(title)}</h2>`,
    `<p>${escapeHtml(input.summary)}<br>${escapeHtml(input.printed)}</p>`,
    "<table><thead><tr>",
    PRINT_COLUMNS.map((h) => `<th>${escapeHtml(h)}</th>`).join(""),
    "</tr></thead><tbody>",
    body.join(""),
    "</tbody></table></body></html>",
  ].join("\n");
}
