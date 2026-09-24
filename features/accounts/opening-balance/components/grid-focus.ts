/**
 * Where Enter goes inside either grid.
 *
 * The cells advertise themselves with `data-ob-*` attributes and the walk reads
 * the DOM: DOM order already IS row-then-column order, so "the next cell" needs
 * no model of the layout and cannot drift out of step with the configured
 * column order.
 *
 * **Enter stops at every EDITABLE cell, in order.** Next field, then the next
 * row — which is what an operator means by Enter, and on these two grids it is
 * also exactly the chain the layout was reaching for.
 *
 * That is worth saying, because the entry grids elsewhere in this app subset the
 * walk by `ui_tbl_clm_column_focus` instead, to run past the read-outs wedged
 * between the keyed columns. THERE IS NOTHING TO RUN PAST HERE: every column on
 * these grids that is not keyed — Group, Nature, Bill-wise, Prior closing, Side,
 * Source, Stale, Bills, Allocated, Pending, Status — renders as a `<span>`, so
 * it is not a form control and was never in the walk to begin with.
 *
 * Subsetting further only SUBTRACTS, and on the live layouts it subtracts what
 * the operator has to reach: table 30 flags Ledger and Opening, so Enter left
 * Dr/Cr unreachable and a liability could not be set to Cr without the mouse;
 * table 31 flags Invoice no alone, so Enter walked one column straight down the
 * grid and the date, the days, the side, the amount and the narration could not
 * be keyed at all. So the flag no longer decides where Enter STOPS. It decides
 * where the walk LANDS when it steps into a row, which is the part of it that
 * was always right — arriving on a ledger row puts the caret on the Ledger cell,
 * and on a bill row on its Invoice no.
 *
 * A hidden column needs no handling: the grids render only `column.visible`, so
 * it is not in the DOM and therefore not in the walk. A DISABLED cell drops out
 * too — which is what makes the trailing blank row land on its picker rather
 * than on an Opening cell that has no account to belong to.
 */

export const GRID_ATTR = "data-ob-grid";
export const ROW_ATTR = "data-ob-row";
export const FIELD_ATTR = "data-ob-field";
export const FOCUS_STOP_ATTR = "data-ob-focus-stop";
/** The picker cell — read-only, and its Enter opens the picker. */
export const LOOKUP_ATTR = "data-ob-lookup";

type Focusable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function cellsOf(gridName: string): Focusable[] {
  const selector = `[${GRID_ATTR}="${gridName}"][${FIELD_ATTR}]`;
  return Array.from(document.querySelectorAll<Focusable>(selector)).filter(
    (element) => !element.disabled,
  );
}

/** The enabled cells of one grid, grouped into rows in DOM order. */
function rowsOf(gridName: string): Focusable[][] {
  const rows: Focusable[][] = [];
  let currentKey: string | null = null;
  for (const cell of cellsOf(gridName)) {
    const key = cell.getAttribute(ROW_ATTR);
    if (rows.length === 0 || key !== currentKey) {
      rows.push([]);
      currentKey = key;
    }
    rows[rows.length - 1].push(cell);
  }
  return rows;
}

/**
 * The cells Enter may land on inside one row: every editable one, in order.
 *
 * `rowsOf` has already dropped the disabled cells, and the read-outs are spans
 * rather than controls, so this is the row as the operator keys it.
 */
function stopsInRow(row: readonly Focusable[]): Focusable[] {
  return [...row];
}

/**
 * Where the walk lands when it steps INTO a row.
 *
 * This is what the layout's `ui_tbl_clm_column_focus` still decides, and the
 * part of it that was always right: a ledger row opens on its Ledger cell and a
 * bill row on its Invoice no, rather than on whichever column happens to be
 * leftmost. Falls back to the first editable cell — which is what the trailing
 * blank row needs, since every flagged column on it is shut until a ledger is
 * picked.
 */
function entryOf(row: readonly Focusable[]): Focusable | null {
  const flagged = row.find((cell) => cell.hasAttribute(FOCUS_STOP_ATTR));
  const landing = flagged ?? row[0] ?? null;
  if (!landing || !namesSomething(landing)) {
    return landing;
  }
  // The Ledger cell is read-only and a SETTLED row cannot be repointed, so
  // landing there hands the operator a cell they cannot type in and an Enter
  // they have to press twice. On the trailing blank row the same cell is exactly
  // where they want to be — so it is the VALUE that decides, not the column.
  const index = row.indexOf(landing);
  return row[index + 1] ?? landing;
}

/** A picker cell that already names something. */
function namesSomething(cell: Focusable): boolean {
  return (
    cell.hasAttribute(LOOKUP_ATTR) &&
    typeof cell.value === "string" &&
    cell.value.trim() !== ""
  );
}

/**
 * Focus a cell, and select what it holds so the next keystroke replaces the
 * figure rather than appending to it.
 *
 * Duck-typed rather than `instanceof HTMLInputElement`: a `<select>` and a date
 * input have no usable `select()`, and the DOM constructors do not exist outside
 * a browser — which would make this walker untestable without jsdom, and would
 * throw rather than degrade anywhere else it ran.
 */
function select(cell: Focusable): void {
  cell.focus();
  const { type, select: selectText } = cell as Partial<HTMLInputElement>;
  if (typeof selectText === "function" && type !== "date" && type !== "checkbox") {
    selectText.call(cell);
  }
}

/** Enter / Shift+Enter, one step along the chain. Returns whether it moved. */
export function moveCellFocus(
  gridName: string,
  from: EventTarget | null,
  direction: 1 | -1,
): boolean {
  const cell = from as Focusable | null;
  if (!cell || !cell.getAttribute) {
    return false;
  }
  const rows = rowsOf(gridName);
  const rowIndex = rows.findIndex((row) => row.includes(cell));
  if (rowIndex < 0) {
    return false;
  }
  const stops = stopsInRow(rows[rowIndex]);
  const index = stops.indexOf(cell);
  const next = stops[index + direction];
  if (next) {
    select(next);
    return true;
  }
  const stepped = rows[rowIndex + direction];
  if (!stepped) {
    return false;
  }
  const landing =
    direction === 1 ? entryOf(stepped) : stopsInRow(stepped).slice(-1)[0] ?? null;
  if (!landing) {
    return false;
  }
  select(landing);
  return true;
}

/**
 * Up / Down, one ROW, staying in the same column where that column is open on
 * the row being stepped into.
 *
 * This is the walk the bill panel hangs off: selecting a row is what opens or
 * closes a breakup, and until arrow keys moved between rows the panel could only
 * be reached with the mouse — which is the one thing §6.7 is about, that a click
 * and a key do the same thing.
 *
 * Column first, then the row's own entry cell: stepping from Opening into the
 * trailing blank row, where Opening is shut until a ledger is picked, has to
 * land on the picker rather than nowhere at all.
 */
export function moveRowFocus(
  gridName: string,
  from: EventTarget | null,
  direction: 1 | -1,
): boolean {
  const cell = from as Focusable | null;
  if (!cell || !cell.getAttribute) {
    return false;
  }
  const rows = rowsOf(gridName);
  const rowIndex = rows.findIndex((row) => row.includes(cell));
  const stepped = rows[rowIndex + direction];
  if (rowIndex < 0 || !stepped) {
    return false;
  }
  const field = cell.getAttribute(FIELD_ATTR);
  const sameColumn = stepped.find((candidate) => candidate.getAttribute(FIELD_ATTR) === field);
  const landing = sameColumn ?? entryOf(stepped);
  if (!landing) {
    return false;
  }
  select(landing);
  return true;
}

/**
 * The first cell of a grid, for the F1 walk between the two panels.
 *
 * Enter moves WITHIN a grid and never crosses a boundary, so the breakup panel
 * under the ledger grid was otherwise reachable only with the mouse.
 */
export function focusGrid(gridName: string): boolean {
  const first = rowsOf(gridName)[0];
  const landing = first ? entryOf(first) : null;
  if (!landing) {
    return false;
  }
  select(landing);
  return true;
}

/** The row key the focused cell belongs to, or null when focus is outside. */
export function focusedRowKey(gridName: string): string | null {
  const active = document.activeElement as Focusable | null;
  if (!active?.getAttribute || active.getAttribute(GRID_ATTR) !== gridName) {
    return null;
  }
  return active.getAttribute(ROW_ATTR);
}

/** Put the caret on one named cell, once it exists. */
export function focusCell(gridName: string, rowKey: string, fieldKey: string): boolean {
  const cell = document.querySelector<Focusable>(
    `[${GRID_ATTR}="${gridName}"][${ROW_ATTR}="${rowKey}"][${FIELD_ATTR}="${fieldKey}"]`,
  );
  if (!cell || cell.disabled) {
    return false;
  }
  select(cell);
  return true;
}

/**
 * The same, after the render the caller's own state change causes — a pick
 * fills the row and grows the next blank one, and neither cell exists yet when
 * the pick is dispatched.
 */
export function focusCellAfterRender(gridName: string, rowKey: string, fieldKey: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.requestAnimationFrame(() => {
    focusCell(gridName, rowKey, fieldKey);
  });
}
