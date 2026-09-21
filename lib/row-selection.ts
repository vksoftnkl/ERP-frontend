/**
 * Ticking rows on a list — the rules, as plain functions.
 *
 * -- WHY THESE ARE NOT IN THE HOOK -----------------------------------------
 *
 * Four screens let an operator tick rows and print them as one document: the
 * three `CrudMasterPage` registers (Quotation, Sale Order, Sale Bill) and the
 * three F8 picker modals, which are hand-rolled tables with their own keyboard
 * navigation. They share no markup, which is exactly why the RULES have to be
 * shared — they are the part an operator notices:
 *
 *   - a tick survives paging, and the count keeps counting
 *   - select-all means THIS PAGE, and clearing it clears only this page
 *   - the batch comes out in LIST order, not in the order rows were clicked
 *
 * Four copies of that is four chances for one register to quietly disagree with
 * the next. `hooks/useRowSelection.ts` is the React wrapper; everything that
 * DECIDES anything lives here, where it can be tested without a DOM.
 *
 * -- WHY A MAP AND NOT A SET OF IDS ----------------------------------------
 *
 * The visible rows are only ever the page on screen. A Set of ids would leave
 * the caller holding ids it can no longer turn back into rows the moment the
 * operator pages forward — and the whole point is that a selection outlives the
 * page it was made on. So the ROWS are kept.
 */

/** Row id -> the row itself. */
export type SelectionMap<T> = ReadonlyMap<string | number, T>;

/** Tick a row, or untick it if it is already ticked. */
export function toggleRowIn<T>(
  current: SelectionMap<T>,
  key: string | number,
  row: T,
): Map<string | number, T> {
  const next = new Map(current);
  if (next.has(key)) next.delete(key);
  else next.set(key, row);
  return next;
}

/**
 * Tick every visible row, or untick them if they are ALL already ticked.
 *
 * Scoped to what is on screen on purpose. Clearing the header box should not
 * throw away ticks made on a page the operator has navigated away from and
 * cannot see to restore.
 */
export function toggleVisibleIn<T>(
  current: SelectionMap<T>,
  visibleRows: readonly T[],
  keyOf: (row: T) => string | number,
): Map<string | number, T> {
  const next = new Map(current);
  const allOn =
    visibleRows.length > 0 && visibleRows.every((row) => next.has(keyOf(row)));
  for (const row of visibleRows) {
    const key = keyOf(row);
    if (allOn) next.delete(key);
    else next.set(key, row);
  }
  return next;
}

/** Every visible row is ticked — what the header box shows as checked. */
export function allVisibleChecked<T>(
  current: SelectionMap<T>,
  visibleRows: readonly T[],
  keyOf: (row: T) => string | number,
): boolean {
  return (
    visibleRows.length > 0 && visibleRows.every((row) => current.has(keyOf(row)))
  );
}

/** Some but not all — the header box's indeterminate third state. */
export function someVisibleChecked<T>(
  current: SelectionMap<T>,
  visibleRows: readonly T[],
  keyOf: (row: T) => string | number,
): boolean {
  return (
    !allVisibleChecked(current, visibleRows, keyOf) &&
    visibleRows.some((row) => current.has(keyOf(row)))
  );
}

/**
 * The ticked rows, in the order the paper should come out.
 *
 * This page's rows first, in the order the LIST shows them, then anything
 * ticked on a page the operator has since navigated away from. Handing back the
 * Map's own insertion order would give the order rows were CLICKED, and the
 * document would be shuffled against the screen it was chosen on.
 *
 * The off-page rows keep insertion order among themselves: there is no list to
 * order them by any more, and the order they were picked is the only honest
 * thing left.
 */
export function orderedSelection<T>(
  current: SelectionMap<T>,
  visibleRows: readonly T[],
  keyOf: (row: T) => string | number,
): T[] {
  if (current.size === 0) return [];
  const onThisPage = visibleRows.filter((row) => current.has(keyOf(row)));
  const seen = new Set(onThisPage.map((row) => keyOf(row)));
  const elsewhere = [...current.values()].filter((row) => !seen.has(keyOf(row)));
  return [...onThisPage, ...elsewhere];
}
