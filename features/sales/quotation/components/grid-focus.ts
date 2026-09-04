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
 *
 * **The chain is walked a row at a time.** Enter on a row's last stop steps into
 * the next row, and the row it steps into gets its own landing spot: the blank
 * row waiting at the bottom of the grid has every flagged column disabled until
 * it names an item, so the walk lands on its picker cell instead of finding no
 * flagged cell ahead of it anywhere and leaving focus stuck on the line the
 * operator has just finished.
 */
import {
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_LOOKUP_ATTR,
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
 * The enabled cells of one grid, grouped into rows in DOM order.
 *
 * The walk is row-by-row rather than one flat list because a row is where the
 * chain can run out: the trailing blank row has every flagged column shut until
 * it names an item, so a flat "next flagged cell" hop off the last row with data
 * finds nothing at all and Enter dies at the bottom of the grid. Grouping lets
 * the walk say "this row is done, step into the next one" and pick a landing
 * spot that row actually has.
 */
function rowsOf(gridName: string): Focusable[][] {
  const rows: Focusable[][] = [];
  let currentKey: string | null = null;
  for (const cell of cellsOf(gridName)) {
    const key = cell.getAttribute(GRID_ROW_ATTR);
    // A row's cells are contiguous in the DOM, so a change of key opens a row.
    if (rows.length === 0 || key !== currentKey) {
      rows.push([]);
      currentKey = key;
    }
    rows[rows.length - 1].push(cell);
  }
  return rows;
}

function flaggedIn(row: readonly Focusable[]): Focusable[] {
  return row.filter((cell) => cell.hasAttribute(GRID_FOCUS_STOP_ATTR));
}

/**
 * The cells Enter may land on inside one row, with `from` kept where it sits.
 *
 * Keeping it is what lets the chain be joined from outside it: click into Mrp —
 * not a flagged column — and Enter still carries on to the next flagged cell
 * rather than doing nothing because the walk cannot find where it is.
 *
 * A row with no flagged cell of its own stops at every editable cell, which is
 * both the old whole-grid fallback (grid 24 flags nothing) and what the blank
 * row needs: its flagged columns are all disabled, so the only stops it can
 * offer are Barcode and the picker.
 */
function stopsInRow(row: readonly Focusable[], from: Focusable | null): Focusable[] {
  const flagged = flaggedIn(row);
  if (flagged.length === 0) {
    return [...row];
  }
  return row.filter((cell) => cell === from || cell.hasAttribute(GRID_FOCUS_STOP_ATTR));
}

/**
 * Where the walk lands when it steps INTO a row: the row's first flagged cell,
 * or — when the layout's flagged columns are all shut, as on the blank row that
 * always trails the grid — the picker cell, which is the one thing that row is
 * there for. Falls back to the row's first editable cell (Barcode, on a layout
 * that hides the picker column).
 */
function entryStopOf(row: readonly Focusable[], delta: 1 | -1): Focusable | null {
  const flagged = flaggedIn(row);
  if (flagged.length > 0) {
    return delta === 1 ? flagged[0] : flagged[flagged.length - 1];
  }
  if (delta === 1) {
    const lookup = row.find((cell) => cell.hasAttribute(GRID_LOOKUP_ATTR));
    if (lookup) {
      return lookup;
    }
  }
  return (delta === 1 ? row[0] : row[row.length - 1]) ?? null;
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

/**
 * Move focus one stop forward or back along the layout's chain, crossing into
 * the next row once this row's chain is spent.
 *
 * The row hop is the point: the last stop of a line is where the operator is
 * done with it, and Enter there is how the Qt screen starts the next line. It
 * cannot be left to "the next flagged cell in the grid" because the row it steps
 * into is usually the blank one, whose flagged columns are disabled until it has
 * an item — the walk has to land on that row's picker instead.
 */
export function moveCellFocus(gridName: string, from: EventTarget | null, delta: 1 | -1): boolean {
  const cell = from as Focusable | null;
  if (!cell) {
    return false;
  }
  const rows = rowsOf(gridName);
  const rowIndex = rows.findIndex((row) => row.includes(cell));
  if (rowIndex < 0) {
    return false;
  }
  const stops = stopsInRow(rows[rowIndex], cell);
  const next = stops[stops.indexOf(cell) + delta];
  if (next) {
    land(next);
    return true;
  }
  for (let index = rowIndex + delta; index >= 0 && index < rows.length; index += delta) {
    const target = entryStopOf(rows[index], delta);
    if (target) {
      land(target);
      return true;
    }
  }
  return false;
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
 * Enter into the grid from outside it — what the header hand-off needs.
 *
 * Price Level is the last field of the header walk (the row renders Customer,
 * then Sales Info, then Quote Info), so Enter there has nowhere left to go
 * inside the panel; the next thing keyed on a quotation is the first line's
 * Description. Takes the FIRST row's cell, the top of the grid, rather than the
 * trailing blank one: on a loaded document that is the line the operator reads
 * first, and on a new one the two are the same row.
 *
 * Disabled cells are skipped, so browse mode — where the whole grid is shut —
 * simply declines and leaves focus in the header.
 */
export function focusFirstCell(gridName: string, fieldKey: string): boolean {
  const selector = `[${GRID_GRID_ATTR}="${gridName}"][${GRID_FIELD_ATTR}="${fieldKey}"]`;
  const target = Array.from(document.querySelectorAll<Focusable>(selector)).find(
    (cell) => !cell.disabled,
  );
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
