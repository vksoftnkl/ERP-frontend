/**
 * How each grid cell reads — the Qt delegate's `paint()` as text: money at two
 * places (grouped), markups at one, "—" for an MRP / sale price there is none
 * of, and the ↑ / ↓ mark in front of a price that moved off its loaded value
 * (the amount in its tooltip, the delegate's `helpEvent`).
 */
import { formatCurrency } from "@/domain/pricing";
import { isMkupKey, isPriceKey, isRateKey, levelOfColumn, type ColumnKey } from "./selling-price.constants";
import { exclusiveOfTax, round2 } from "./selling-price.math";
import type { PriceGridRow } from "./selling-price.state";

export const DASH = "—";

export function moneyText(value: number): string {
  return formatCurrency(value, 2, true);
}

/** On hand: whole numbers bare, a fraction at three places. */
export function stockText(value: number): string {
  return formatCurrency(value, value === Math.round(value) ? 0 : 3, true);
}

export function markupText(value: number): string {
  return formatCurrency(value, 1, true);
}

/**
 * The text a data cell shows. MRP and Sale Px read "—" when there is none;
 * Cost, Cost before tax and Min read 0.00.
 */
export function cellText(row: PriceGridRow, column: ColumnKey): string {
  if (isPriceKey(column)) {
    return moneyText(row.prices[levelOfColumn(column)]);
  }
  if (isRateKey(column)) {
    return moneyText(row.rates[levelOfColumn(column)]);
  }
  if (isMkupKey(column)) {
    return markupText(row.markups[levelOfColumn(column)]);
  }
  switch (column) {
    case "stockQty":
      return row.stock === null ? "" : stockText(row.stock);
    case "mrpShown":
      return row.mrp !== null && row.mrp > 0 ? moneyText(row.mrp) : DASH;
    case "salePx":
      return row.salePx !== null && row.salePx > 0 ? moneyText(row.salePx) : DASH;
    case "costRate":
      return moneyText(row.cost > 0 ? row.cost : 0);
    case "costWot":
      return moneyText(row.costWot > 0 ? row.costWot : 0);
    case "minPrice":
      return moneyText(row.min > 0 ? row.min : 0);
    case "uomName":
      return row.unitName;
    case "barcodeText":
      return row.barcode;
    default:
      return "";
  }
}

/**
 * The change since load, for a price or a base-rate cell — null under half a
 * paisa. A base rate is measured against the loaded net price taken before
 * tax, the way the cell itself is.
 */
export function deltaOf(row: PriceGridRow, column: ColumnKey): number | null {
  const level = levelOfColumn(column);
  let delta: number;
  if (isPriceKey(column)) {
    delta = round2(row.prices[level] - row.base[level]);
  } else if (isRateKey(column)) {
    delta = round2(row.rates[level] - round2(exclusiveOfTax(row.base[level], row.taxPerc)));
  } else {
    return null;
  }
  return Math.abs(delta) < 0.005 ? null : delta;
}

/** "+1.00" / "−2.00" — the amount a price moved, for the mark's tooltip. */
export function deltaText(delta: number): string {
  return `${delta > 0 ? "+" : "−"}${moneyText(Math.abs(delta))}`;
}

/**
 * ↑ green / ↓ red at the left of a price that moved off what was loaded — the
 * item card's Pricing grid mark (Qt `priceUpArrow` / `priceDownArrow`).
 */
export function deltaArrow(delta: number): string {
  return delta > 0 ? "↑" : "↓";
}

/**
 * The mark's tooltip: "Was 110.00 (+8.00)" — the cell's loaded figure (a base
 * rate's is the loaded price before tax) and the move. "" when it has not moved.
 */
export function deltaTip(row: PriceGridRow, column: ColumnKey): string {
  const delta = deltaOf(row, column);
  if (delta === null) {
    return "";
  }
  const base = row.base[levelOfColumn(column)];
  const was = isRateKey(column) ? round2(exclusiveOfTax(base, row.taxPerc)) : base;
  return `Was ${moneyText(was)} (${deltaText(delta)})`;
}

/**
 * Whether the mark fits beside the figure in a cell this wide: a marker over
 * the price would make both unreadable, so a too-narrow column simply shows
 * the price — the Qt delegate's rule. Digits run about 0.58em; the
 * figure is drawn at 0.74 of the page unit, the chip at 0.6, with 18px of
 * padding between and around them.
 *
 * @param cellPx  the cell's drawn width
 * @param unitPx  the page unit (`--erp-q-u`) in the same pixels
 */
export function deltaFits(delta: string, figure: string, cellPx: number, unitPx = 16): boolean {
  const need = (delta.length * 0.6 + figure.length * 0.74) * unitPx * 0.58 + 18;
  return need <= cellPx;
}
