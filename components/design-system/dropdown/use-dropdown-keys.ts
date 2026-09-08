"use client";
import { useCallback, useState, type KeyboardEvent } from "react";

export type UseDropdownKeysArgs = {
  /**
   * Whether the popup is open. Owned by the caller rather than by this hook,
   * because the data hook is skipped on it and has to be called first.
   */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** How many rows the popup is showing. */
  rowCount: number;
  /**
   * Identifies the result set. When it changes, the highlight goes back to the
   * top row; when only `rowCount` changes (another page appended) it does not.
   */
  resetKey: string;
  disabled?: boolean;
  onChoose: (index: number) => void;
  /**
   * Backspace, when the operator is not mid-edit. Return true to say it was
   * handled (the variants differ: single clears the whole selection, multi drops
   * the last chip) and the keystroke is swallowed.
   */
  onBackspace?: () => boolean;
  /** Alt+C — add a record to the master behind this dropdown. */
  onCreateShortcut?: () => void;
  /** Alt+A — amend the selected record in that master. */
  onEditShortcut?: () => void;
};

export type DropdownKeys = {
  highlight: number;
  /**
   * Whether the operator has actually engaged the list — arrowed to a row or typed
   * a search — as opposed to merely having focus in the field.
   *
   * Enter commits only when engaged. Focusing a field opens its list with the top
   * row highlighted, so "Enter picks the highlighted row whenever the popup is
   * open" silently rewrites values while the operator is walking the form with
   * Enter-as-Tab: on the quotation header that turned Place of Supply from Tamil
   * Nadu into whatever sorted first, which is the field the whole local-sale GST
   * split hangs off.
   */
  engaged: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  setHighlight: (index: number) => void;
  /** Open and engage, for a keystroke that is itself a search. */
  engage: () => void;
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

/** Printable, as opposed to a named key like "ArrowDown" or "F2". */
function isTypingKey(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function useDropdownKeys({
  open,
  setOpen,
  rowCount,
  resetKey,
  disabled = false,
  onChoose,
  onBackspace,
  onCreateShortcut,
  onEditShortcut,
}: UseDropdownKeysArgs): DropdownKeys {
  const [engaged, setEngaged] = useState(false);
  /**
   * The highlighted row, stored with the result set it belongs to.
   *
   * Derived rather than reset from an effect, which is also what makes the two
   * rules here distinguishable: a *new* result set highlights its top row (so
   * Enter after typing takes the best match without an arrow press), while merely
   * appending a page must leave the highlight where the operator put it.
   */
  const [highlightState, setHighlightState] = useState({ key: resetKey, index: 0 });
  const storedHighlight = highlightState.key === resetKey ? highlightState.index : 0;
  // Clamped into a list that shrank under it.
  const highlight = rowCount === 0 ? 0 : Math.min(storedHighlight, rowCount - 1);

  const setHighlight = useCallback(
    (index: number) => {
      setHighlightState({ key: resetKey, index });
    },
    [resetKey],
  );

  const openMenu = useCallback(() => {
    if (disabled) {
      return;
    }
    setOpen(true);
  }, [disabled, setOpen]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setEngaged(false);
  }, [setOpen]);

  const engage = useCallback(() => {
    if (disabled) {
      return;
    }
    setOpen(true);
    setEngaged(true);
  }, [disabled, setOpen]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (disabled) {
        return;
      }
      // Alt+C / Alt+A are checked before the switch: their keys are printable, and
      // the default branch would otherwise read them as the start of a search.
      // The modifier test matches the one LookupCell already uses.
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const shortcut = event.key.trim().toLowerCase();
        if (shortcut === "c" && onCreateShortcut) {
          event.preventDefault();
          onCreateShortcut();
          return;
        }
        if (shortcut === "a" && onEditShortcut) {
          event.preventDefault();
          onEditShortcut();
          return;
        }
      }
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp": {
          event.preventDefault();
          if (!open) {
            engage();
            return;
          }
          setEngaged(true);
          if (rowCount === 0) {
            return;
          }
          // Clamped at both ends: no wrap, so holding a key cannot cycle the list
          // back past the operator.
          const next = event.key === "ArrowDown" ? highlight + 1 : highlight - 1;
          setHighlight(Math.min(Math.max(next, 0), rowCount - 1));
          return;
        }
        case "Enter": {
          // Not engaged, or nothing to pick: this Enter belongs to the form's
          // Enter-as-Tab walk, so it must NOT be swallowed here.
          if (!open || !engaged || highlight < 0 || highlight >= rowCount) {
            return;
          }
          event.preventDefault();
          onChoose(highlight);
          return;
        }
        case "Escape": {
          if (!open) {
            return;
          }
          // The text and the focus stay put; only the list closes.
          event.preventDefault();
          closeMenu();
          return;
        }
        case "Backspace": {
          if (onBackspace?.()) {
            event.preventDefault();
          }
          return;
        }
        case "Tab": {
          if (open) {
            closeMenu();
          }
          return;
        }
        default: {
          if (isTypingKey(event)) {
            engage();
          }
        }
      }
    },
    [
      closeMenu,
      disabled,
      engage,
      engaged,
      highlight,
      onBackspace,
      onChoose,
      onCreateShortcut,
      onEditShortcut,
      open,
      rowCount,
      setHighlight,
    ],
  );

  return { highlight, engaged, openMenu, closeMenu, setHighlight, engage, handleKeyDown };
}
