/**
 * How each grid cell reads — the Qt delegate's `paint()` as text: money at two
 * places (grouped), markups at one, "—" for an MRP / sale price there is none
 * of, and the delta chip against the loaded value in front of a price.
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

/** "+1.00" / "−2.00" — green up, red down. */
export function deltaText(delta: number): string {
  return `${delta > 0 ? "+" : "−"}${moneyText(Math.abs(delta))}`;
}

/**
 * Whether the delta chip fits beside the figure in a cell this wide: a marker
 * over the price would make both unreadable, so a too-narrow column simply
 * shows the price — the Qt delegate's rule. Digits run about 0.58em; the
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
