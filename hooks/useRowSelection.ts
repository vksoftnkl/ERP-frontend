"use client";

/**
 * Ticking rows on a list, so several can be acted on at once.
 *
 * A thin React wrapper and nothing more: every rule it applies — what
 * select-all means, what survives paging, what order the selection comes back
 * in — lives in `lib/row-selection.ts`, where it is tested without a DOM. This
 * file owns the state and the identity of the callbacks, and that is all.
 *
 * Used by the `CrudMasterPage` registers and by the three F8 picker modals,
 * which share no markup at all. That is the point: the markup is theirs, the
 * gesture is one gesture.
 *
 * -- `keyOf` MUST BE STABLE ------------------------------------------------
 *
 * Pass a module-scope function or a `useCallback`, never an inline arrow. It is
 * a real dependency of everything below — reading it through a ref instead
 * would be reading a ref during render, which is the thing refs are not for —
 * so an inline arrow rebuilds every callback on every render and throws the
 * memo away. All six call sites define theirs at module scope.
 */

import { useCallback, useMemo, useState } from "react";

import {
  allVisibleChecked,
  orderedSelection,
  someVisibleChecked,
  toggleRowIn,
  toggleVisibleIn,
} from "@/lib/row-selection";

export type RowSelection<T> = {
  /** How many rows are ticked, across every page. */
  count: number;
  isChecked: (row: T) => boolean;
  toggleRow: (row: T) => void;
  /** Tick this page, or untick it if it is all ticked already. */
  toggleVisible: () => void;
  /** Every visible row is ticked — the header box. */
  allChecked: boolean;
  /** Some but not all — the header box's indeterminate state. */
  someChecked: boolean;
  /** The ticked rows, this page's first and in list order. */
  selected: T[];
  clear: () => void;
};

export function useRowSelection<T>(
  visibleRows: readonly T[],
  /** Stable — see the note above. */
  keyOf: (row: T) => string | number,
): RowSelection<T> {
  const [checked, setChecked] = useState<Map<string | number, T>>(
    () => new Map(),
  );

  const isChecked = useCallback(
    (row: T) => checked.has(keyOf(row)),
    [checked, keyOf],
  );

  const toggleRow = useCallback(
    (row: T) => {
      setChecked((current) => toggleRowIn(current, keyOf(row), row));
    },
    [keyOf],
  );

  const toggleVisible = useCallback(() => {
    setChecked((current) => toggleVisibleIn(current, visibleRows, keyOf));
  }, [keyOf, visibleRows]);

  const selected = useMemo(
    () => orderedSelection(checked, visibleRows, keyOf),
    [checked, keyOf, visibleRows],
  );

  // A no-op when nothing is ticked, so a caller may clear on every list change
  // without forcing a render each time.
  const clear = useCallback(() => {
    setChecked((current) => (current.size > 0 ? new Map() : current));
  }, []);

  return {
    count: checked.size,
    isChecked,
    toggleRow,
    toggleVisible,
    allChecked: allVisibleChecked(checked, visibleRows, keyOf),
    someChecked: someVisibleChecked(checked, visibleRows, keyOf),
    selected,
    clear,
  };
}

export default useRowSelection;
