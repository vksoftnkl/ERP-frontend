/**
 * Keyboard navigation inside a grid.
 *
 * The cells advertise themselves with `data-quotation-*` attributes and the
 * walker reads the DOM, exactly as the stock grids do it: DOM order already is
 * row-then-column order, so "the next cell" needs no model of the layout and
 * cannot drift out of step with the configured column order.
 *
 * **Where Enter stops is the layout's call, not the walk's.** `ui_table_columns`
 * carries a per-column `focus` flag and grid 23 sets it on exactly four of its
 * ninety columns — Description, Size, Quote Qty, Rate — which is the chain the
 * Qt screen walks: the operator keys those four and Enter runs straight past the
 * sixty-odd read-outs wedged between them. Hidden columns need no handling here
 * at all: the grids render only `column.visible`, so a column the layout hides
 * is not in the DOM and therefore not in the walk.
 *
 * A layout that flags no column (grid 24, the Sale Order items) keeps the old
 * behaviour of stopping at every editable cell — a chain of nothing would leave
 * Enter dead.
 */
import {
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
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

/**
 * The cells Enter may land on, with `from` kept in the list wherever it sits.
 *
 * Keeping it is what lets the chain be joined from outside it: click into Mrp —
 * not a flagged column — and Enter still carries on to the next flagged cell
 * below rather than doing nothing because the walk cannot find where it is.
 */
function stopsOf(gridName: string, from: Focusable | null): Focusable[] {
  const all = cellsOf(gridName);
  const flagged = all.filter((cell) => cell.hasAttribute(GRID_FOCUS_STOP_ATTR));
  if (flagged.length === 0) {
    return all;
  }
  return all.filter((cell) => cell === from || cell.hasAttribute(GRID_FOCUS_STOP_ATTR));
}

/** Land on a cell the way every hand-over on this screen does. */
function land(target: Focusable): void {
  target.focus();
  // Arriving with the value selected is what lets the next keystroke replace it.
  // `<select>` has no `select()`; the text cells do.
  if ("select" in target) {
    target.select();
  }
}

/** Move focus one stop forward or back along the layout's chain. */
export function moveCellFocus(gridName: string, from: EventTarget | null, delta: 1 | -1): boolean {
  const cells = stopsOf(gridName, from as Focusable);
  const index = cells.indexOf(from as Focusable);
  if (index < 0) {
    return false;
  }
  const next = cells[index + delta];
  if (!next) {
    return false;
  }
  land(next);
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
    land(target);
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
  land(target);
  return true;
}

/**
 * Carry on from a named cell rather than from wherever focus happens to be —
 * what the item picker needs on the way out.
 *
 * Picking an item takes focus into the dialog, so by the time the row is priced
 * there is nothing to walk *from*: the operator would have to click into the
 * grid to key the quantity they opened the picker to key. Resuming from the
 * Description cell they started at puts them on the next stop in the chain (Size
 * on grid 23, or whatever follows it on a layout that hides Size), which is the
 * cell the Qt screen leaves them in.
 *
 * Call it only once the row is priced: the cells after Description stay disabled
 * until the line has an item, and a disabled cell is not a stop.
 */
export function focusNextStopFrom(gridName: string, rowKey: string, fieldKey: string): boolean {
  const selector = `[${GRID_GRID_ATTR}="${gridName}"][${GRID_ROW_ATTR}="${rowKey}"][${GRID_FIELD_ATTR}="${fieldKey}"]`;
  const anchor = document.querySelector<Focusable>(selector);
  if (!anchor) {
    return false;
  }
  return moveCellFocus(gridName, anchor, 1);
}
