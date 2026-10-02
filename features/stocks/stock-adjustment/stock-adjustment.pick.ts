/**
 * "Pick from stock" — the rows the Qt `StockPickDialog::paintRows` lays out
 * over `GET /stock/adjustment/pick-stock`, and its note. Pure.
 *
 * One row per HOLDING — lot × bucket in this godown, available > 0. Grouped by
 * supplier it is the "what goes back to which supplier" list; for an expiry
 * write-off it offers only lots expired by the cut-off, with the rest one tick
 * away, greyed, so the operator can see why a lot is missing.
 */
import { formatCurrency } from "@/domain/pricing";
import { dateFromWire, pickQtyText } from "./stock-adjustment.format";
import type { PickStockRow } from "./stock-adjustment.types";

export type PickDisplayRow =
  | { type: "group"; key: string; supplier: string; summary: string }
  | { type: "row"; key: string; index: number; row: PickStockRow; grey: boolean };

export type PickOptions = {
  group: boolean;
  /** ISO yyyy-MM-dd — offer only lots expired by this day. Null = no expiry filter. */
  expiredBy: string | null;
  showAll: boolean;
};

function expiryOf(row: PickStockRow): string {
  return (row.expiryDate ?? "").slice(0, 10);
}

/** Expired by the cut-off: an expiry on or before it. A lot with no expiry never has. */
export function isExpiredBy(row: PickStockRow, expiredBy: string | null): boolean {
  const expiry = expiryOf(row);
  return Boolean(expiry && expiredBy && expiry <= expiredBy);
}

/** By supplier, "no supplier" last, as the server sent them within one. */
function bySupplier(rows: readonly PickStockRow[]): number[] {
  const order = rows.map((_, index) => index);
  return order.sort((left, right) => {
    const a = (rows[left].supplierName ?? "").trim();
    const b = (rows[right].supplierName ?? "").trim();
    if (!a !== !b) {
      return a ? -1 : 1;
    }
    const compared = a.localeCompare(b);
    return compared !== 0 ? compared : left - right;
  });
}

export function pickDisplayRows(
  rows: readonly PickStockRow[],
  options: PickOptions,
): { display: PickDisplayRow[]; hidden: number } {
  // Row indices in the order they are painted: by supplier (then as sent)
  // when grouped, else as the server sent them (its FEFO-ish order).
  const order = options.group ? bySupplier(rows) : rows.map((_, index) => index);
  const onlyExpired = Boolean(options.expiredBy) && !options.showAll;
  const display: PickDisplayRow[] = [];
  let hidden = 0;
  let currentSupplier: string | null = null;

  for (const index of order) {
    const row = rows[index];
    const expired = isExpiredBy(row, options.expiredBy);
    if (onlyExpired && !expired) {
      hidden += 1;
      continue;
    }
    const supplier = (row.supplierName ?? "").trim();
    if (options.group && supplier !== currentSupplier) {
      currentSupplier = supplier;
      // The heading: the supplier's name, with what is held for them.
      let qty = 0;
      let value = 0;
      for (const other of rows) {
        if ((other.supplierName ?? "").trim() !== supplier) {
          continue;
        }
        qty += Number(other.availableQty) || 0;
        value += (Number(other.availableQty) || 0) * (Number(other.avgCostRate) || 0);
      }
      display.push({
        type: "group",
        key: `group:${supplier}`,
        supplier: supplier || "(no supplier on the lot)",
        summary: `${pickQtyText(qty)} held · ${formatCurrency(value, 2, true)}`,
      });
    }
    display.push({
      type: "row",
      key: `${row.sblId || row.lotId}:${row.bucket}:${index}`,
      index,
      row,
      grey: Boolean(options.expiredBy) && !expired,
    });
  }
  return { display, hidden };
}

/** The note under the list — what to do instead, what is hidden, and the BLOCK rule. */
export function pickNote(
  rows: readonly PickStockRow[],
  options: { itemScoped: boolean; hidden: number; expiredBy: string | null },
): { text: string; block: string } {
  const parts: string[] = [];
  if (rows.length === 0) {
    parts.push(`Nothing available in this godown${options.itemScoped ? " for this item" : ""}.`);
  } else {
    parts.push(
      "Leave the lot blank on the line instead, and Save picks by the item's issue strategy (FEFO / FIFO). " +
        "A quantity over one lot splits across lots.",
    );
  }
  if (options.hidden > 0) {
    parts.push(
      `${options.hidden} lot(s) not expired by ${dateFromWire(options.expiredBy)} are hidden — ` +
        "an unexpired lot is a damage write-off, not an expiry.",
    );
  }
  return {
    text: parts.join(" "),
    block: "A holding with less available than the line asks for is refused — negative stock is BLOCKED here.",
  };
}

/**
 * Panel 12 — the DAMAGED bucket of this godown grouped by the lot's supplier:
 * what goes back to whom. Sorted by supplier, "no supplier" last.
 */
export function damagedPanelRows(rows: readonly PickStockRow[]): PickStockRow[] {
  return bySupplier(rows).map((index) => rows[index]);
}

export function damagedPanelTitle(count: number, godownName: string, hasGodown: boolean): string {
  if (!hasGodown) {
    return "DAMAGED STOCK — choose the godown to see what is held for return";
  }
  if (count === 0) {
    return `DAMAGED STOCK — nothing is held for return in ${godownName}`;
  }
  return `DAMAGED STOCK — what goes back to which supplier (${count} held in ${godownName}, grouped by the lot's supplier)`;
}
