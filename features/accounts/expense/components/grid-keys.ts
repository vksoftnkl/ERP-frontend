/**
 * The two grids' keyboard, as Qt's `NexTable` gives it (d97cdd4):
 *
 *   Enter / Shift+Enter   the next / previous cell that takes typing, then on
 *                         into the next row — DOM order IS the column order
 *                         the layout set, so nothing here models the layout
 *   +  /  −               add a line (the caret goes to the trailing blank
 *                         row) / remove this one — bare, in every cell where
 *                         the character means nothing; in a free-text cell
 *                         (Description, Ref) they are typed as written
 *
 * The cells advertise themselves with `data-expv-*` attributes. A disabled
 * cell drops out of the walk, so a posted voucher's Enter goes nowhere.
 */
import type { KeyboardEvent } from "react";

const GRID_ATTR = "data-expv-grid";
const ROW_ATTR = "data-expv-row";
const FIELD_ATTR = "data-expv-field";

export type ExpenseGridName = "lines" | "tenders";

type Focusable = HTMLInputElement | HTMLSelectElement;

/** The attributes one cell carries. */
export function cellAttrs(grid: ExpenseGridName, rowKey: string, field: string): Record<string, string> {
  return { [GRID_ATTR]: grid, [ROW_ATTR]: rowKey, [FIELD_ATTR]: field };
}

function cellsOf(grid: ExpenseGridName): Focusable[] {
  return Array.from(
    document.querySelectorAll<Focusable>(`[${GRID_ATTR}="${grid}"][${FIELD_ATTR}]`),
  ).filter((cell) => !cell.disabled);
}

/** Focus a cell and select what it holds, so a typed figure replaces it. */
function take(cell: Focusable): void {
  cell.focus();
  if (cell instanceof HTMLInputElement && !cell.readOnly) {
    cell.select();
  }
}

/** Enter / Shift+Enter: one cell along. Returns whether it moved. */
export function moveCell(grid: ExpenseGridName, from: EventTarget | null, direction: 1 | -1): boolean {
  const cells = cellsOf(grid);
  const index = cells.indexOf(from as Focusable);
  const next = index < 0 ? undefined : cells[index + direction];
  if (!next) {
    return false;
  }
  take(next);
  return true;
}

/** Put the caret on one named cell. */
export function focusCell(grid: ExpenseGridName, rowKey: string, field: string): boolean {
  const cell = document.querySelector<Focusable>(
    `[${GRID_ATTR}="${grid}"][${ROW_ATTR}="${rowKey}"][${FIELD_ATTR}="${field}"]`,
  );
  if (!cell || cell.disabled) {
    return false;
  }
  take(cell);
  return true;
}

/**
 * The same, once the render the caller's change causes has landed — a pick
 * grows the trailing blank row and closes the picker, and the caret has to
 * come back to the grid from the dialog that held it.
 */
export function focusCellSoon(grid: ExpenseGridName, rowKey: string, field: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      focusCell(grid, rowKey, field);
    });
  });
}

/** Whether a cell sits in a grid — F2 there is the cell's, not the screen's New. */
export function isGridCell(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${GRID_ATTR}]`) !== null;
}

/**
 * `+` / `−` as line keys: "add" / "remove", or null. Never with Ctrl / Alt /
 * Meta (those are other shortcuts), and never in a free-text cell.
 */
export function lineKeyOf(event: KeyboardEvent<HTMLElement>, freeText: boolean): "add" | "remove" | null {
  if (freeText || event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }
  if (event.key === "+") return "add";
  if (event.key === "-") return "remove";
  return null;
}

/** A key that types one character — what opens a popup cell's picker. */
export function typedCharacter(event: KeyboardEvent<HTMLElement>): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) {
    return null;
  }
  return event.key;
}

// ═══════════════════════════════════════════════════════════════════════════
//  The header (Qt 5e25760): Enter walks it like Tab, in Qt's tab order, and
//  from the last field into the lines — landing on Reason, never on "#".
// ═══════════════════════════════════════════════════════════════════════════

const HEAD_ATTR = "data-expv-head";

export const HEAD_ORDER = [
  "date",
  "paidTo",
  "party",
  "notes",
  "gstBill",
  "gstin",
  "invoiceNo",
  "invoiceDate",
  "pos",
] as const;

export type HeadField = (typeof HEAD_ORDER)[number];

/** The attribute a header field carries — on the wrapper for a dropdown, on the control otherwise. */
export function headAttrs(field: HeadField): Record<string, string> {
  return { [HEAD_ATTR]: field };
}

/** The control behind a header field: the element itself, or the first control inside a wrapper. */
function headControl(field: string): HTMLInputElement | HTMLSelectElement | null {
  const element = document.querySelector(`[${HEAD_ATTR}="${field}"]`);
  if (!element) return null;
  const control =
    element instanceof HTMLInputElement || element instanceof HTMLSelectElement
      ? element
      : element.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  return control && !control.disabled ? control : null;
}

/** Put the caret in a header field, selecting its text. */
export function focusHead(field: HeadField): boolean {
  const control = headControl(field);
  if (!control) return false;
  control.focus();
  if (control instanceof HTMLInputElement && control.type !== "date" && control.type !== "checkbox") {
    control.select();
  }
  return true;
}

/** The same, after the render a reset or a tick causes. */
export function focusHeadSoon(field: HeadField): void {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      focusHead(field);
    });
  });
}

/** The first cell of a grid that takes typing. */
export function focusFirstCell(grid: ExpenseGridName): boolean {
  const first = cellsOf(grid)[0];
  if (!first) return false;
  take(first);
  return true;
}

/**
 * Enter in the header: the next field that can take the caret (a disabled
 * one — the GST bill's fields without a bill, the date in a till session — is
 * stepped over), then the lines. Returns whether it moved.
 */
export function advanceHead(from: EventTarget | null): boolean {
  const owner = from instanceof Element ? from.closest(`[${HEAD_ATTR}]`) : null;
  const current = owner?.getAttribute(HEAD_ATTR) as HeadField | null | undefined;
  if (!current) return false;
  for (let index = HEAD_ORDER.indexOf(current) + 1; index < HEAD_ORDER.length; index += 1) {
    if (focusHead(HEAD_ORDER[index])) return true;
  }
  return focusFirstCell("lines");
}
