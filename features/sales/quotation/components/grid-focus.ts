/**
 * Keyboard navigation inside a grid.
 *
 * The cells advertise themselves with `data-quotation-*` attributes and the
 * walker reads the DOM, exactly as the stock grids do it: DOM order already is
 * row-then-column order, so "the next cell" needs no model of the layout and
 * cannot drift out of step with the configured column order.
 */
import {
  GRID_FIELD_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "../quotation.constants";

type Focusable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function cellsOf(gridName: string): Focusable[] {
  const selector = `[${GRID_GRID_ATTR}="${gridName}"][${GRID_FIELD_ATTR}]`;
  // A disabled cell drops out of the walk; a *read-only* one does not — the
  // lookup cells are read-only inputs that open a picker, and skipping them
  // would make Enter jump straight past the item column.
  return Array.from(document.querySelectorAll<Focusable>(selector)).filter(
    (element) => !element.disabled,
  );
}

/** Move focus one editable cell forward or back, in visual order. */
export function moveCellFocus(gridName: string, from: EventTarget | null, delta: 1 | -1): boolean {
  const cells = cellsOf(gridName);
  const index = cells.indexOf(from as Focusable);
  if (index < 0) {
    return false;
  }
  const next = cells[index + delta];
  if (!next) {
    return false;
  }
  next.focus();
  if ("select" in next) {
    next.select();
  }
  return true;
}

/**
 * Focus the LAST row's cell of a column, once React has appended the row.
 *
 * A barcode commit on the final row appends a blank one; the scanner then emits
 * the next code immediately, so focus has to be waiting in the new row's Barcode
 * cell rather than sitting in the row just scanned — otherwise every subsequent
 * scan overwrites the same line.
 */
export function focusLastCellAfterRender(gridName: string, fieldKey: string): void {
  const selector = `[${GRID_GRID_ATTR}="${gridName}"][${GRID_FIELD_ATTR}="${fieldKey}"]`;
  window.requestAnimationFrame(() => {
    const cells = document.querySelectorAll<Focusable>(selector);
    const target = cells[cells.length - 1];
    if (!target) {
      return;
    }
    target.focus();
    if ("select" in target) {
      target.select();
    }
  });
}

/**
 * Jump to the same column of another row — what a barcode commit does (straight
 * to the next row's Barcode cell, so a scanner can run without touching the
 * keyboard).
 */
export function focusCell(gridName: string, rowKey: string, fieldKey: string): boolean {
  const selector = `[${GRID_GRID_ATTR}="${gridName}"][${GRID_ROW_ATTR}="${rowKey}"][${GRID_FIELD_ATTR}="${fieldKey}"]`;
  const target = document.querySelector<Focusable>(selector);
  if (!target) {
    return false;
  }
  target.focus();
  if ("select" in target) {
    target.select();
  }
  return true;
}
