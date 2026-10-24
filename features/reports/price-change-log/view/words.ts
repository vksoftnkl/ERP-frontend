/**
 * The words the Price Change Log uses — on its grid, its CSV and its print,
 * and in the quick rate popup's "Rate changes" panel. Qt `PriceLogView`
 * (inventory/report/pricelog/price_log_view.cpp) and the detail dialog's
 * `valueText` / `moveText`, as pure functions.
 *
 * Every figure is the SERVER's: these only say it.
 */
import { formatCurrency } from "@/domain/pricing";
import { clock12Of, dateTime12Of } from "@/lib/time-format";
import type { PriceLogField, PriceLogRow } from "../wire/types";

/** Hyphen-free minus and the em dash the report draws for "none". */
export const MINUS = "−";
export const DASH = "—";

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

/** A number off the wire, or null when it is not one (pg NUMERIC can arrive as a string). */
export function numberOf(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const SOURCE_WORDS: Record<string, string> = {
  ITEM_CARD: "Item card",
  CHANGE_SELLING_PRICE: "Change selling",
  QTY_PRICE: "Qty price",
  BUCKET_REKEY: "Bucket re-key",
  IMPORT: "Import",
};

const ACTION_WORDS: Record<string, string> = {
  CREATE: "New",
  UPDATE: "Changed",
  DELETE: "Deleted",
  RESTORE: "Restored",
  REKEY: "Re-keyed",
};

export function sourceLabel(source: string | null | undefined): string {
  const key = text(source);
  return SOURCE_WORDS[key] ?? key;
}

export function actionLabel(action: string | null | undefined): string {
  const key = text(action);
  return ACTION_WORDS[key] ?? key;
}

/** 118 · 118.50 · 1,20,000 — whole figures bare, the rest at two places; "—" for none. */
export function numberText(value: unknown): string {
  const n = numberOf(value);
  if (n === null) {
    return value === null || value === undefined || value === "" ? DASH : text(value);
  }
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  if (whole && Math.round(n) === 0) {
    return "0";
  }
  return formatCurrency(n, whole ? 0 : 2, true);
}

/** `hh:mm AM`, local (the app-wide 12-hour clock). */
export function timeText(iso: string | null | undefined): string {
  return clock12Of(iso ?? "") || text(iso);
}

/** `dd-MM-yyyy hh:mm AM`, local. */
export function stampText(iso: string | null | undefined): string {
  return dateTime12Of(iso ?? "") || text(iso);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** `2026-10-23` → `Fri 23-10-2026`. */
export function dayText(day: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(day));
  if (!match) {
    return text(day);
  }
  const weekday = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return `${WEEKDAYS[weekday]} ${match[3]}-${match[2]}-${match[1]}`;
}

/** `2026-10-23` (or a timestamp) → `23-10-2026`; anything else as it came. */
export function dateText(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value));
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text(value);
}

/** Where the price applies: "MRP 150 · SP 140" for a price row, "10+ qty · Retail · Ravi Stores" for a slab. */
export function appliesText(row: Pick<
  PriceLogRow,
  "priceTable" | "slabFromQty" | "slabToQty" | "priceLevelName" | "partyName" | "bucketMrp" | "bucketSp"
>): string {
  const parts: string[] = [];
  if (row.priceTable === "IQP") {
    if (numberOf(row.slabFromQty) !== null) {
      parts.push(
        numberOf(row.slabToQty) === null
          ? `${numberText(row.slabFromQty)}+ qty`
          : `${numberText(row.slabFromQty)}–${numberText(row.slabToQty)} qty`,
      );
    }
    if (text(row.priceLevelName)) parts.push(text(row.priceLevelName));
    if (text(row.partyName)) parts.push(text(row.partyName));
  } else {
    if (numberOf(row.bucketMrp) !== null) parts.push(`MRP ${numberText(row.bucketMrp)}`);
    if (numberOf(row.bucketSp) !== null) parts.push(`SP ${numberText(row.bucketSp)}`);
  }
  return parts.length ? parts.join(" · ") : DASH;
}

/** Who made it — "System" for a server process with no user. */
export function whoText(row: Pick<PriceLogRow, "app" | "userName">): string {
  if (text(row.app) === "SYSTEM" && !text(row.userName)) {
    return "System";
  }
  return text(row.userName) || DASH;
}

/** The device — or, with none registered, what reached the server. */
export function deviceText(row: Pick<PriceLogRow, "deviceName" | "ip">): string {
  if (text(row.deviceName)) {
    return text(row.deviceName);
  }
  return text(row.ip) ? `(no device) ${text(row.ip)}` : "(no device)";
}

/** "All branches" for a chain price. */
export function branchText(row: Pick<PriceLogRow, "branchName">): string {
  return text(row.branchName) || "All branches";
}

/** "SKU · Name", or the name alone. */
export function itemText(row: Pick<PriceLogRow, "itemCode" | "itemName">): string {
  const code = text(row.itemCode);
  return code ? `${code} · ${text(row.itemName)}` : text(row.itemName);
}

// ---------------------------------------------------------------------------
// What changed, as chips
// ---------------------------------------------------------------------------

export type ChipTone = "up" | "down" | "warn" | "info" | "neutral";
export type Chip = { text: string; tone: ChipTone };

/** `Price A 118 → 119  ▲0.8%` — the label, the move, and its tone. */
export function moveChip(label: string, from: unknown, to: unknown): Chip {
  const a = numberOf(from);
  const b = numberOf(to);
  let chip = `${label} ${numberText(from)} → ${numberText(to)}`;
  let tone: ChipTone = "neutral";
  if (a !== null && b !== null && a !== b) {
    tone = b > a ? "up" : "down";
    if (a !== 0) {
      chip += `  ${b > a ? "▲" : "▼"}${Math.abs(((b - a) / a) * 100).toFixed(1)}%`;
    }
  }
  return { text: chip, tone };
}

const SINGLE_PRICE = /^Price [A-D]$/;

/** "Price B (w/o tax)" and "Markup B %" add nothing when "Price B" is shown; "Sl no" never does. */
export function isCompanion(label: string, shown: ReadonlySet<string>): boolean {
  for (const base of shown) {
    if (label === `${base} (w/o tax)`) return true;
    if (SINGLE_PRICE.test(base) && label === `Markup ${base.slice(-1)} %`) return true;
  }
  return label === "Sl no";
}

/**
 * The "What changed" cell (Qt `changeChips`): a create / delete / restore by
 * name; a change as one old → new chip per changed field (fields[], notes
 * 145), or — from an older server — the headline pairs plus the other changed
 * labels by name. A confirmed below-cost save adds a warning chip.
 */
export function changeChips(row: PriceLogRow): Chip[] {
  const chips: Chip[] = [];
  const slab = row.priceTable === "IQP";
  const action = text(row.action);

  if (action === "CREATE") {
    chips.push({ text: slab ? "new slab" : "new price row", tone: "info" });
    const headline = slab ? row.newSlabPrice : row.newPriceA;
    if (numberOf(headline) !== null) {
      chips.push({ text: `${slab ? "Slab price" : "Price A"} ${numberText(headline)}`, tone: "neutral" });
    }
    if (!slab && numberOf(row.newMrp) !== null) {
      chips.push({ text: `MRP ${numberText(row.newMrp)}`, tone: "neutral" });
    }
  } else if (action === "DELETE") {
    chips.push({ text: slab ? "slab deleted" : "price row deleted", tone: "down" });
  } else if (action === "RESTORE") {
    chips.push({ text: slab ? "slab restored" : "price row restored", tone: "info" });
  } else {
    const fields: PriceLogField[] = Array.isArray(row.fields) ? row.fields : [];
    if (fields.length) {
      const shown = new Set(fields.map((f) => f.label).filter((label) => SINGLE_PRICE.test(label)));
      for (const field of fields) {
        if (isCompanion(field.label, shown)) continue;
        chips.push(moveChip(field.label, field.before, field.after));
      }
    } else {
      const columns = new Set(row.changed ?? []);
      const shown = new Set<string>();
      const pair = (column: string, label: string, from: unknown, to: unknown) => {
        if (!columns.has(column)) return;
        chips.push(moveChip(label, from, to));
        shown.add(label);
      };
      if (slab) {
        pair("iqp_price", "Slab price", row.oldSlabPrice, row.newSlabPrice);
      } else {
        pair("ipm_sales_price_a", "Price A", row.oldPriceA, row.newPriceA);
        pair("ipm_max_price", "MRP", row.oldMrp, row.newMrp);
        pair("ipm_cost_price", "Cost", row.oldCost, row.newCost);
      }
      // The other changed fields by name — their figures are in the detail.
      const named = new Set(shown);
      for (const label of row.changedLabels ?? []) {
        if (SINGLE_PRICE.test(label)) named.add(label);
      }
      for (const label of row.changedLabels ?? []) {
        if (shown.has(label) || isCompanion(label, named)) continue;
        if (["Slab price", "Price A", "MRP", "Cost"].includes(label)) continue;
        chips.push({ text: label, tone: "neutral" });
      }
    }
    if (action === "REKEY") {
      chips.unshift({ text: "bucket re-key", tone: "neutral" });
    }
  }

  if (/below cost/i.test(text(row.reason))) {
    chips.push({ text: "below cost", tone: "warn" });
  }
  return chips;
}

/** The chips as one line — for CSV, print, tooltips and the quick rate panel. */
export function changeText(row: PriceLogRow): string {
  return changeChips(row)
    .map((chip) => chip.text)
    .join("; ");
}

// ---------------------------------------------------------------------------
// The detail dialog's cells
// ---------------------------------------------------------------------------

/**
 * The server's names for the price columns (price-field-labels.ts), so an
 * UNCHANGED field — which the server does not label — reads the same as a
 * changed one. In the order a person reads a price row (Qt `fieldLabels()`).
 */
export const PRICE_FIELD_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["ipm_sales_price_a", "Price A"],
  ["ipm_sales_price_b", "Price B"],
  ["ipm_sales_price_c", "Price C"],
  ["ipm_sales_price_d", "Price D"],
  ["ipm_max_price", "MRP"],
  ["ipm_min_price", "Min price"],
  ["ipm_cost_price", "Cost"],
  ["ipm_cost_wot", "Cost (w/o tax)"],
  ["ipm_price_a_wot", "Price A (w/o tax)"],
  ["ipm_price_b_wot", "Price B (w/o tax)"],
  ["ipm_price_c_wot", "Price C (w/o tax)"],
  ["ipm_price_d_wot", "Price D (w/o tax)"],
  ["ipm_price_a_markup_perc", "Markup A %"],
  ["ipm_price_b_markup_perc", "Markup B %"],
  ["ipm_price_c_markup_perc", "Markup C %"],
  ["ipm_price_d_markup_perc", "Markup D %"],
  ["ipm_disc_perc", "Disc %"],
  ["ipm_disc_qty", "Disc qty"],
  ["ipm_addl_cess", "Addl cess"],
  ["ipm_round_off", "Round off"],
  ["ipm_profit_type", "Profit type"],
  ["ipm_loading_charge", "Loading charge"],
  ["ipm_freight_charge", "Freight charge"],
  ["ipm_loyalty_points", "Loyalty points"],
  ["ipm_bucket_mrp", "MRP bucket"],
  ["ipm_bucket_sp", "Sale price bucket"],
  ["ipm_effective_from", "From date"],
  ["ipm_effective_to", "To date"],
  ["ipm_uom_remarks", "Unit remarks"],
  ["ipm_cost_remarks", "Cost remarks"],
  ["ipm_is_active", "Active"],
  ["ipm_is_deleted", "Deleted"],
  ["iqp_price", "Slab price"],
  ["iqp_from_qty", "From qty"],
  ["iqp_to_qty", "To qty"],
  ["iqp_price_mode", "Price mode"],
  ["iqp_disc_pct", "Disc %"],
  ["iqp_flat_off", "Flat off"],
  ["iqp_is_tax_incl", "Tax incl."],
  ["iqp_price_level", "Price level"],
  ["iqp_effective_from", "From date"],
  ["iqp_effective_to", "To date"],
  ["iqp_is_active", "Active"],
  ["iqp_is_deleted", "Deleted"],
];

/** One value in the Before / After columns: Yes / No, a number, a date, "open" for 9999-12-31, "—". */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) {
    return DASH;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return numberText(value);
  }
  const s = text(value);
  if (s.startsWith("9999-12-31")) {
    return "open";
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return dateText(s);
  }
  return s;
}

/** The Change column: `+1  ▲0.8%` / `−44  ▼37.3%` / `changed`, with the direction for its colour. */
export function moveText(before: unknown, after: unknown): { text: string; direction: -1 | 0 | 1 } {
  const a = typeof before === "number" ? before : null;
  const b = typeof after === "number" ? after : null;
  if (a !== null && b !== null) {
    if (a === b) {
      return { text: "", direction: 0 };
    }
    let move = `${b > a ? "+" : MINUS}${numberText(Math.abs(b - a))}`;
    if (a !== 0) {
      move += `  ${b > a ? "▲" : "▼"}${Math.abs(((b - a) / a) * 100).toFixed(1)}%`;
    }
    return { text: move, direction: b > a ? 1 : -1 };
  }
  return { text: JSON.stringify(before ?? null) === JSON.stringify(after ?? null) ? "" : "changed", direction: 0 };
}

/** "1 change" / "3 changes". */
export function countText(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
