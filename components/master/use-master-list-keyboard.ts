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
   * Wraps the grid. Must be focusable (`tabIndex={-1}`): a click on a row or a
   * cell then lands focus on something inside it, which is what tells the hook
   * to hand the caret straight back to the search box.
   */
  tableContainerRef: RefObject<HTMLElement | null>;
  /**
   * The whole list screen — toolbar, filters, grid. A click anywhere in it
   * leaves the caret in the search box unless it lands on a control that takes
   * typing (a date, a select). Defaults to the grid alone.
   */
  listRootRef?: RefObject<HTMLElement | null>;
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
 * The shared keyboard chain for master list screens. The search box owns the
 * caret for as long as the list is on screen:
 *
 * 1. focus starts in the search box, with its text selected, and comes back to
 *    it when a dialog over the list closes;
 * 2. clicking a row selects it without taking the caret — nor do the toolbar
 *    buttons, the pager or a checkbox. Only a control that takes typing (a
 *    date, a select) keeps the focus it is given;
 * 3. Up/Down walk the row highlight from inside the search box, PageUp/PageDown
 *    jump to the first/last row, Ctrl+Enter opens the selected row;
 * 4. if focus did fall out of the box (onto the page body), a printable key
 *    jumps back carrying that character, and Escape or an arrow brings the
 *    caret back too.
 *
 * Lives here so every list screen gets the same wiring instead of repeating it.
 */
/** Controls that take typing or picking, and keep the focus a click gives them. */
const KEEPS_FOCUS_SELECTOR = [
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  // Popup triggers and their menus run their own keyboard and close on blur.
  '[aria-haspopup]:not([aria-haspopup="false"])',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="combobox"]',
  '[role="dialog"]',
].join(", ");

/** Anything a press can put focus on. A press on none of these blurs to the body. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "summary",
  "[tabindex]",
  '[contenteditable]:not([contenteditable="false"])',
].join(", ");

export function useMasterListKeyboard<Row extends MasterListKeyboardRow>({
  enabled = true,
  rows,
  selectedRowId,
  searchInputRef,
  tableContainerRef,
  listRootRef,
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
   * rendered it, so a page that mounts while its columns load still gets it —
   * and again each time the list comes back from behind a full-page form.
   */
  const initialFocusDoneRef = useRef(false);
  useEffect(() => {
    if (!enabled) {
      initialFocusDoneRef.current = false;
      return;
    }
    if (initialFocusDoneRef.current) return;
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
      const inSearch = target === searchInputRef.current;

      if (!inSearch) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;

        // "The list has focus" — the grid itself, or the page body after a
        // click or a closing dialog dropped focus out of the search box.
        const listHasFocus = target === document.body || container.contains(target);
        if (!listHasFocus) return;

        if (key === "Escape" && !hasModifier) {
          event.preventDefault();
          focusSearchInput();
          return;
        }

        // Tally-style: a printable key typed at the list jumps to search and
        // carries the character with it, so users can just start typing.
        if (
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
      }

      const isRowWalk =
        key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown";
      // Ctrl+Enter (Cmd+Enter on a Mac) — plain Enter is deliberately left
      // alone, since it submits the search box and activates focused buttons.
      const isViewChord =
        key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;

      if (isViewChord) {
        const currentId = selectedRowIdRef.current;
        if (currentId === null) return;
        const row = rowsRef.current.find((candidate) => candidate.__rowId === currentId);
        if (!row) return;
        event.preventDefault();
        onViewRowRef.current?.(row);
        return;
      }

      // Up/Down step the row highlight and PageUp/PageDown jump to the ends —
      // from inside the search box, which keeps the caret while they do.
      if (isRowWalk) {
        if (hasModifier) return;
        event.preventDefault();
        if (!inSearch) focusSearchInput(false);
        const currentRows = rowsRef.current;
        if (currentRows.length === 0) return;
        const currentId = selectedRowIdRef.current;
        const currentIndex =
          currentId !== null
            ? currentRows.findIndex((row) => row.__rowId === currentId)
            : -1;
        const lastIndex = currentRows.length - 1;
        const nextIndex =
          key === "PageDown"
            ? lastIndex
            : key === "PageUp"
              ? 0
              : key === "ArrowDown"
                ? Math.min(currentIndex + 1, lastIndex)
                : Math.max(currentIndex - 1, 0);
        const nextRow = currentRows[nextIndex];
        if (nextRow) onSelectRowRef.current(nextRow);
        return;
      }

      // Left/Right move the caret in the search box; only a list that has
      // lost the box scrolls the grid sideways with them.
      if (inSearch || hasModifier) return;
      if (key !== "ArrowLeft" && key !== "ArrowRight") return;

      event.preventDefault();
      const viewport = container.querySelector<HTMLElement>('[data-erp-table-viewport="true"]');
      if (!viewport) return;
      viewport.scrollBy({ left: key === "ArrowRight" ? 150 : -150, behavior: "smooth" });
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, focusSearchInput, searchInputRef, tableContainerRef]);

  /**
   * Keeps the caret in the search box while the operator works the list with
   * the mouse. Two halves, because a click either moves focus somewhere or
   * drops it on the page body:
   *
   * - focus that lands inside the list on anything but a typing control (a row,
   *   the grid, a checkbox, a toolbar or pager button) is handed straight back.
   *   The click itself still happens — the row still selects, the checkbox
   *   still ticks, the header still drags — it just does not keep the focus;
   * - a press on something that cannot take focus at all (blank space, a label)
   *   is told not to blur the box in the first place; a disabled button, which
   *   blurs it regardless, has it handed back straight after.
   *
   * A dialog over the list owns focus outright, so both stand aside while one
   * is up.
   */
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const listRoot = () => listRootRef?.current ?? tableContainerRef.current;
    const listOwnsFocus = () =>
      !document.querySelector('[role="dialog"], [aria-modal="true"]') &&
      !isSuspendedRef.current?.();

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const input = searchInputRef.current;
      if (!target || !input || target === input) return;
      if (!listRoot()?.contains(target) || target.closest(KEEPS_FOCUS_SELECTOR)) return;
      if (!listOwnsFocus()) return;
      input.focus({ preventScroll: true });
    };

    const handleMouseDown = (event: MouseEvent) => {
      // The middle button's autoscroll is not a focus change; leave it be.
      if (event.button === 1) return;
      const target = event.target as HTMLElement | null;
      const root = listRoot();
      if (!target || !root?.contains(target)) return;
      const focusable = target.closest(FOCUSABLE_SELECTOR);
      if (focusable && root.contains(focusable)) return;
      if (!listOwnsFocus()) return;
      event.preventDefault();
      // Focus had already fallen to the body — say a dialog closed without
      // handing it back — so a click on the list is as good a cue as any.
      const input = searchInputRef.current;
      if (input && document.activeElement !== input) input.focus({ preventScroll: true });
    };

    // A disabled button (Edit or Delete with no row picked) gets no mousedown
    // at all, yet Chromium still blurs the box on the press; put it back once
    // the press is through.
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(":disabled") || !listRoot()?.contains(target)) return;
      if (!listOwnsFocus()) return;
      window.setTimeout(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        searchInputRef.current?.focus({ preventScroll: true });
      }, 0);
    };

    // Capture phase: the table stops mousedown propagation on some of its
    // buttons, and React's root listener sits below the document.
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [enabled, listRootRef, searchInputRef, tableContainerRef]);

  /**
   * A dialog over the list (print, history, a confirm, the message popup) takes
   * focus with it, and closing it drops focus on the page body. Dialogs portal
   * into `document.body`, so watching its direct children is enough to see one
   * go — without observing every render in the app.
   */
  useEffect(() => {
    if (!enabled || typeof document === "undefined" || typeof MutationObserver === "undefined") {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.removedNodes.length > 0)) return;
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      if (isSuspendedRef.current?.()) return;
      focusSearchInput(false);
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [enabled, focusSearchInput]);

  return { focusSearchInput };
}
