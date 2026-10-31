/**
 * Print / PDF / Excel — the export route's rows, rendered here (Qt
 * `exportCols()`, `exportHtml()`, `saveTabAsCsv()`).
 *
 * `/reports/loyalty-status/export` returns DATA only: the tab's rows unpaged
 * (≤ 20,000) and `printedAs`, the line of every filter applied, built by the
 * server so a print cannot disagree with the screen. Its dates are re-spelled
 * `dd/MM/yyyy` (the web's rule); nothing else in it is touched.
 *
 * Excel is a real .xlsx (the reports' shared writer); Qt writes a CSV that
 * Excel opens. This is the ONE place a point or money figure becomes a
 * spreadsheet number: the user wants to sum the column.
 */
import type { Cell as SheetCell, Sheet } from "@/features/reports/shared/export/xlsx-writer";
import type { Tab } from "../query/params";
import { money, num, pts, respellDates, showDate, txt } from "./format";

export type ExportCol = { title: string; key: string; numeric: boolean };

/** Per tab: the grid's columns in its order, as the export row keys name them. */
export function exportCols(tab: Tab): ExportCol[] {
  const c = (title: string, key: string, numeric = false): ExportCol => ({ title, key, numeric });
  switch (tab) {
    case "members":
      return [
        c("Card no", "cardNo"),
        c("Customer", "customerName"),
        c("Mobile", "mobile"),
        c("Scheme", "schemeName"),
        c("Status", "status"),
        c("Earned", "earned", true),
        c("Redeemed", "redeemed", true),
        c("Gift", "gift", true),
        c("Expired", "expired", true),
        c("Balance", "balance", true),
        c("Value", "value", true),
        c("Next expiry", "nextExpiryOn"),
        c("Last visit", "lastActivityOn"),
      ];
    case "expiring":
      return [
        c("Expires", "expiresOn"),
        c("Days left", "daysLeft", true),
        c("Customer", "customerName"),
        c("Card no", "cardNo"),
        c("Mobile", "mobile"),
        c("Scheme", "schemeName"),
        c("Expiring", "points", true),
        c("Value", "value", true),
        c("Balance", "balance", true),
        c("After", "balanceAfter", true),
      ];
    default:
      return [
        c("Scheme", "schemeName"),
        c("Status", "status"),
        c("Holders", "holders", true),
        c("Bills", "bills", true),
        c("Opening", "opening", true),
        c("Earned", "earned", true),
        c("Redeemed", "redeemed", true),
        c("Gift", "gift", true),
        c("Expired", "expired", true),
        c("Adjust", "adjusted", true),
        c("Outstanding", "outstanding", true),
        c("Value", "value", true),
        c("Used %", "usedPct", true),
      ];
  }
}

function isDateKey(key: string): boolean {
  return key.endsWith("On");
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && txt(value) !== "";
}

/** One export cell as the print shows it. */
export function exportText(row: Record<string, unknown>, col: ExportCol): string {
  const value = row[col.key];
  if (col.numeric) {
    if (!present(value)) return "";
    return col.key === "value" ? money(value) : pts(value);
  }
  if (isDateKey(col.key)) return showDate(value);
  return txt(value);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The print (and PDF) page: the tab's name, the "Printed as" line, the rows, landscape. */
export function exportHtml(input: {
  tabLabel: string;
  printedAs: string;
  tab: Tab;
  rows: ReadonlyArray<Record<string, unknown>>;
}): string {
  const cols = exportCols(input.tab);
  const printedAs = respellDates(input.printedAs);
  const head = cols
    .map((c) => `<th style="text-align:${c.numeric ? "right" : "left"}">${escapeHtml(c.title)}</th>`)
    .join("");
  const body = input.rows
    .map(
      (row) =>
        `<tr>${cols
          .map((c) => {
            const shown = exportText(row, c);
            return `<td style="text-align:${c.numeric ? "right" : "left"}">${shown ? escapeHtml(shown) : "&nbsp;"}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("\n");
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<title>${escapeHtml(`Loyalty Status — ${input.tabLabel}`)}</title>`,
    "<style>",
    "@page { size: A4 landscape; margin: 10mm; }",
    "body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: #000; margin: 0; }",
    "h2 { margin: 0 0 4pt; font-size: 13pt; }",
    "p { margin: 0 0 6pt; }",
    "table { width: 100%; border-collapse: collapse; }",
    "th, td { border: 1px solid #555; padding: 3px; vertical-align: top; }",
    "thead { display: table-header-group; }",
    "tr { page-break-inside: avoid; }",
    "</style></head><body>",
    `<h2>${escapeHtml(input.tabLabel)}</h2>`,
    `<p>${escapeHtml(printedAs)}</p>`,
    `<table><thead><tr>${head}</tr></thead><tbody>`,
    body,
    "</tbody></table>",
    `<p>${input.rows.length} row(s)</p>`,
    "</body></html>",
  ].join("\n");
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function dateCell(value: unknown): SheetCell {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(txt(value));
  if (!match) return present(value) ? { t: "s", v: txt(value) } : null;
  const serial = (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - EXCEL_EPOCH) / 86_400_000;
  return { t: "n", v: serial, style: "date" };
}

/** The workbook's one sheet: `printedAs`, the headings, then a row per export row. */
export function exportSheet(input: {
  tabLabel: string;
  printedAs: string;
  tab: Tab;
  rows: ReadonlyArray<Record<string, unknown>>;
}): Sheet {
  const cols = exportCols(input.tab);
  const rows: SheetCell[][] = [
    [{ t: "s", v: respellDates(input.printedAs) }],
    cols.map((c): SheetCell => ({ t: "s", v: c.title, style: "bold" })),
  ];
  for (const row of input.rows) {
    rows.push(
      cols.map((c): SheetCell => {
        const value = row[c.key];
        if (c.numeric) {
          if (!present(value)) return null;
          return { t: "n", v: num(value), style: c.key === "value" ? "money" : "text" };
        }
        if (isDateKey(c.key)) return dateCell(value);
        return present(value) ? { t: "s", v: txt(value) } : null;
      }),
    );
  }
  return {
    name: input.tabLabel.slice(0, 31),
    rows,
    widths: cols.map((c) => (c.numeric ? 12 : c.key === "customerName" || c.key === "schemeName" ? 28 : 14)),
  };
}

export function exportFileName(tab: Tab, ext: "xlsx"): string {
  return `loyalty-status-${tab}.${ext}`;
}
