/**
 * The labels of a posted GRN / bill, drawn (Qt `PurchaseLabelDialog::paintLabel`,
 * NexERP 6e025ef): one 50 × 38 mm label per page of the roll, Code 128 (set B)
 * bars of the batch (textile: the piece label the sale bill scans), else the
 * item's EAN. Pure — strings in, an SVG / a print document out — so the test
 * can read what goes to the printer.
 */
import { code128B, code128Modules } from "@/features/stocks/textile-tags/domain/code128";
import { num, text } from "./purchase.format";
import type { PurchaseLabelRow } from "./purchase-dialogs.api";

/** The label roll (Qt `QPageSize(QSizeF(50, 38), Millimeter)`), margins 1 mm. */
export const LABEL_PAGE_MM = { width: 50, height: 38, margin: 1 } as const;

/** A row as the grid edits it: the server's row and the copies typed. */
export type LabelLine = { row: PurchaseLabelRow; copies: number };

export function labelLinesOf(rows: readonly PurchaseLabelRow[]): LabelLine[] {
  return rows.map((row) => ({ row, copies: Math.max(0, Math.trunc(num(row.copies))) }));
}

export function totalCopies(lines: readonly LabelLine[]): number {
  return lines.reduce((sum, line) => sum + Math.max(0, line.copies), 0);
}

/** A typed Copies cell: whole labels, blank / junk / negative = 0. */
export function copiesOf(typed: string): number {
  const value = Number.parseInt(typed.trim(), 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 9999) : 0;
}

/** Two places, blank when not above zero (Qt `rateText`). */
export function labelRate(value: unknown): string {
  const amount = num(value);
  return amount > 0 ? amount.toFixed(2) : "";
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch] ?? ch);
}

/**
 * Qt elides on the right by the font's metrics. With none here, a line a little
 * too long is squeezed to the width (`textLength`) rather than cut; one far too
 * long is cut to half again the width first. Sans-serif runs about 0.5 em a
 * character.
 */
function fit(value: string, fontSize: number, width: number): { shown: string; squeeze: boolean } {
  const perChar = fontSize * 0.5;
  if (value.length * perChar <= width) {
    return { shown: value, squeeze: false };
  }
  const max = Math.max(1, Math.floor((width * 1.5) / perChar));
  return { shown: value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1))}…`, squeeze: true };
}

function mm(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * One label as an SVG in millimetres (the printable area: page less margins).
 * Lines, top down: company (bold), item · model, size · colour, the bars, the
 * barcode text with "Our price ₹" on the right, "MRP ₹ (incl. of all taxes)".
 */
export function labelSvg(row: PurchaseLabelRow): string {
  const width = LABEL_PAGE_MM.width - 2 * LABEL_PAGE_MM.margin;
  const height = LABEL_PAGE_MM.height - 2 * LABEL_PAGE_MM.margin;
  const left = width * 0.04;
  const bodyWidth = width * 0.92;
  const h = height * 0.92;
  let y = height * 0.04;
  const parts: string[] = [];

  const line = (value: string, share: number, bold: boolean, anchor: "start" | "end" = "start") => {
    const size = h * share * 0.8;
    const x = anchor === "end" ? left + bodyWidth : left;
    const baseline = y + h * share * 0.5 + size * 0.35;
    const { shown, squeeze } = fit(value, size, bodyWidth);
    const length = squeeze ? ` textLength="${mm(bodyWidth)}" lengthAdjust="spacingAndGlyphs"` : "";
    parts.push(
      `<text x="${mm(x)}" y="${mm(baseline)}" font-size="${mm(size)}" font-weight="${bold ? 700 : 400}" text-anchor="${anchor}"${length}>` +
        `${escapeXml(shown)}</text>`,
    );
    y += h * share;
  };

  line(text(row.companyName).toUpperCase(), 0.12, true);
  line([text(row.itemName), text(row.model)].filter(Boolean).join(" · "), 0.11, false);
  const second = [text(row.size), text(row.colour)].filter(Boolean);
  if (second.length > 0) {
    line(second.join(" · "), 0.11, false);
  }

  const code = text(row.barcode);
  const widths = code ? code128B(code) : [];
  const barsHeight = h * 0.3;
  const modules = code128Modules(widths);
  if (modules > 0) {
    const unit = bodyWidth / modules;
    let x = left;
    widths.forEach((moduleWidth, index) => {
      if (index % 2 === 0) {
        parts.push(`<rect x="${mm(x)}" y="${mm(y)}" width="${mm(unit * moduleWidth)}" height="${mm(barsHeight)}"/>`);
      }
      x += unit * moduleWidth;
    });
  }
  y += barsHeight;

  const price = num(row.price);
  const mrp = num(row.mrp);
  const before = y;
  line(code, 0.11, true);
  if (price > 0) {
    y = before;
    line(`Our price ₹${price.toFixed(2)}`, 0.11, true, "end");
  }
  if (mrp > 0) {
    line(`MRP ₹${mrp.toFixed(2)} (incl. of all taxes)`, 0.11, false);
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" ` +
    `font-family="Arial, Helvetica, sans-serif" fill="#000">${parts.join("")}</svg>`
  );
}

/** The whole roll: every label × its copies, one per page. */
export function labelsPrintDocument(lines: readonly LabelLine[], title: string): string {
  const pages: string[] = [];
  for (const { row, copies } of lines) {
    const svg = labelSvg(row);
    for (let copy = 0; copy < copies; copy += 1) {
      pages.push(`<div class="label">${svg}</div>`);
    }
  }
  const { width, height, margin } = LABEL_PAGE_MM;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>
@page { size: ${width}mm ${height}mm; margin: ${margin}mm; }
html, body { margin: 0; padding: 0; }
.label { width: ${width - 2 * margin}mm; height: ${height - 2 * margin}mm; overflow: hidden; break-after: page; page-break-after: always; }
.label:last-child { break-after: auto; page-break-after: auto; }
svg { display: block; }
</style></head><body>${pages.join("")}</body></html>`;
}
