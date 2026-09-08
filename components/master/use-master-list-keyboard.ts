"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/** The minimum a row must carry for the list keyboard chain to address it. */
export interface MasterListKeyboardRow {
  __rowId: string | number;
}

export interface UseMasterListKeyboardOptions<Row extends MasterListKeyboardRow> {
  /** Off while the screen shows something other than its list (a full-page form). */
  enabled?: boolean;
  rows: Row[];
  selectedRowId: string | number | null;
  searchInputRef: RefObject<HTMLInputElement | null>;
  /**
   * Wraps the grid. Must be focusable (`tabIndex={-1}`) so the list can hold
   * focus once the search box hands over.
   */
  tableContainerRef: RefObject<HTMLElement | null>;
  onSelectRow: (row: Row) => void;
  onSearchTermChange: (value: string) => void;
  /** Ctrl/Cmd+Enter on the selected row; omitted screens simply ignore the chord. */
  onViewRow?: (row: Row) => void;
  /** True while a modal, confirm dialog or context menu owns the keyboard. */
  isSuspended?: () => boolean;
  /** Retries the first focus until the list has actually rendered its input. */
  loading?: boolean;
}

/**
 * The shared keyboard chain for master list screens:
 *
 * 1. focus starts in the search box, with its text selected;
 * 2. Down/PageDown there hands over to the grid (row 0, or the current row);
 * 3. Up/Down walk the row highlight, Left/Right scroll the grid sideways,
 *    Ctrl+Enter opens the selected row;
 * 4. Escape, or Up on the first row, walks back out to the search box — and a
 *    printable key typed at the grid jumps to search carrying that character.
 *
 * Lives here so every list screen gets the same wiring instead of repeating it.
 */
export function useMasterListKeyboard<Row extends MasterListKeyboardRow>({
  enabled = true,
  rows,
  selectedRowId,
  searchInputRef,
  tableContainerRef,
  onSelectRow,
  onSearchTermChange,
  onViewRow,
  isSuspended,
  loading,
}: UseMasterListKeyboardOptions<Row>) {
  // Keep refs in sync with the latest render so the one bound listener below
  // never reads stale rows, selection or handlers.
  const rowsRef = useRef(rows);
  const selectedRowIdRef = useRef(selectedRowId);
  const onSelectRowRef = useRef(onSelectRow);
  const onSearchTermChangeRef = useRef(onSearchTermChange);
  const onViewRowRef = useRef(onViewRow);
  const isSuspendedRef = useRef(isSuspended);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => { selectedRowIdRef.current = selectedRowId; }, [selectedRowId]);
  useEffect(() => { onSelectRowRef.current = onSelectRow; }, [onSelectRow]);
  useEffect(() => { onSearchTermChangeRef.current = onSearchTermChange; }, [onSearchTermChange]);
  useEffect(() => { onViewRowRef.current = onViewRow; }, [onViewRow]);
  useEffect(() => { isSuspendedRef.current = isSuspended; }, [isSuspended]);

  /** Put the caret back in the search box and pre-select whatever is typed. */
  const focusSearchInput = useCallback(
    (selectAll = true) => {
      const input = searchInputRef.current;
      if (!input) return;
      input.focus();
      if (selectAll) input.select();
    },
    [searchInputRef],
  );

  /**
   * First focus lands on the search box — but only once the list has actually
   * rendered it, so a page that mounts while its columns load still gets it.
   */
  const initialFocusDoneRef = useRef(false);
  useEffect(() => {
    if (!enabled || initialFocusDoneRef.current) return;
    if (!searchInputRef.current) return;
    initialFocusDoneRef.current = true;
    focusSearchInput();
  }, [enabled, loading, focusSearchInput, searchInputRef]);

  // Scroll the active row into view whenever the selection changes.
  useEffect(() => {
    if (selectedRowId === null) return;
    const container = tableContainerRef.current;
    if (!container) return;
    container
      .querySelector<HTMLElement>('[class*="activeRow"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedRowId, tableContainerRef]);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      if (event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (isSuspendedRef.current?.()) return;

      const container = tableContainerRef.current;
      if (!container) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      const hasModifier =
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey;

      // Search box → list. Down (or PageDown) drops into the grid, keeping the
      // current row if one is already selected and starting at row 0 otherwise.
      if (target === searchInputRef.current) {
        if (hasModifier) return;
        if (key !== "ArrowDown" && key !== "PageDown") return;
        const currentRows = rowsRef.current;
        if (currentRows.length === 0) return;
        event.preventDefault();
        const currentId = selectedRowIdRef.current;
        const hasSelection =
          currentId !== null && currentRows.some((row) => row.__rowId === currentId);
        if (!hasSelection) {
          onSelectRowRef.current(currentRows[0]);
        }
        container.focus({ preventScroll: true });
        container
          .querySelector<HTMLElement>('[class*="activeRow"]')
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }

      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;

      // "The list has focus" — the grid itself, or the page body once the grid
      // moved selection without any element of its own taking focus.
      const listHasFocus = target === document.body || container.contains(target);

      // Escape always returns to the search box.
      if (key === "Escape" && !hasModifier && listHasFocus) {
        event.preventDefault();
        focusSearchInput();
        return;
      }

      const isArrow =
        key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
      // Ctrl+Enter (Cmd+Enter on a Mac) — plain Enter is deliberately left
      // alone, since it submits the search box and activates focused buttons.
      const isViewChord =
        key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;

      // Tally-style: a printable key typed at the list jumps to search and
      // carries the character with it, so users can just start typing.
      if (
        !isArrow &&
        !isViewChord &&
        listHasFocus &&
        key.length === 1 &&
        key !== " " &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !target.closest('button, a, [role="button"]')
      ) {
        const input = searchInputRef.current;
        if (!input) return;
        event.preventDefault();
        onSearchTermChangeRef.current(`${input.value}${key}`);
        focusSearchInput(false);
        return;
      }

      if (!isArrow && !isViewChord) return;
      // The arrows are the unmodified ones only; the chord owns its modifier.
      if (isArrow && hasModifier) return;

      if (isViewChord) {
        const currentId = selectedRowIdRef.current;
        if (currentId === null) return;
        const row = rowsRef.current.find((candidate) => candidate.__rowId === currentId);
        if (!row) return;
        event.preventDefault();
        onViewRowRef.current?.(row);
        return;
      }

      if (key === "ArrowDown" || key === "ArrowUp") {
        event.preventDefault();
        const currentRows = rowsRef.current;
        if (currentRows.length === 0) {
          if (key === "ArrowUp") focusSearchInput();
          return;
        }
        const currentId = selectedRowIdRef.current;
        const currentIndex =
          currentId !== null
            ? currentRows.findIndex((row) => row.__rowId === currentId)
            : -1;
        // Up from the first row walks back out to the search box.
        if (key === "ArrowUp" && currentIndex === 0) {
          focusSearchInput();
          return;
        }
        const nextIndex =
          key === "ArrowDown"
            ? Math.min(currentIndex + 1, currentRows.length - 1)
            : Math.max(currentIndex <= 0 ? 0 : currentIndex - 1, 0);
        const nextRow = currentRows[nextIndex];
        if (nextRow) onSelectRowRef.current(nextRow);
        return;
      }

      // Left/Right — scroll the table viewport
      event.preventDefault();
      const viewport = container.querySelector<HTMLElement>('[data-erp-table-viewport="true"]');
      if (!viewport) return;
      viewport.scrollBy({ left: key === "ArrowRight" ? 150 : -150, behavior: "smooth" });
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, focusSearchInput, searchInputRef, tableContainerRef]);

  return { focusSearchInput };
}
