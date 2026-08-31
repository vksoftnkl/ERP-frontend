"use client";

/**
 * Driving a picker dialog's row list from the keyboard — the F8 quotation list
 * and the F10 held list both.
 *
 * It exists because the obvious version does not work. Hanging the arrow keys
 * off the search box's own `onKeyDown` navigates only while that box has focus,
 * and the very first thing an operator does — click a row — takes focus off it
 * (a `<tr>` is not focusable, so the click lands focus on `<body>`), after which
 * ↑↓ and Enter reach nothing at all and the dialog looks frozen. So the listener
 * is on the DOCUMENT for as long as the dialog is open, and the keys work
 * wherever focus happens to be.
 *
 * Hover deliberately does NOT move the highlight, and these dialogs are why:
 * the selection is what Enter and the Select / Resume buttons act on, so a row
 * the pointer merely crossed on its way to a button must not become the row that
 * opens. Only a click, an arrow key or a page change moves it; `:hover` stays a
 * pointer affordance and nothing more.
 *
 * Capture phase, and it stops what it handles: the screen underneath has its own
 * grid navigation, and a dialog above it must not move both.
 */
import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

export type ListKeyboardNavOptions = {
  isOpen: boolean;
  /** Rows on the visible page — the highlight never leaves it. */
  rowCount: number;
  activeIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  /** Enter (and the toolbar's own button) act on the highlighted row. */
  onEnter: () => void;
  /** True while a nested dialog is up, so its Enter is not also this one's. */
  paused?: boolean;
};

export type ListKeyboardNav = {
  /** Attach to the scrolling container holding the rows, so the highlight can be kept in view. */
  viewportRef: RefObject<HTMLDivElement | null>;
};

/** Enter belongs to these, not to the list. */
const ENTER_OWNERS = new Set(["BUTTON", "SELECT", "A"]);

export function useListKeyboardNav(options: ListKeyboardNavOptions): ListKeyboardNav {
  const { isOpen, rowCount, activeIndex, setActiveIndex, onEnter, paused = false } = options;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  // The handler is re-read from a ref rather than re-subscribed on every render:
  // `onEnter` closes over the current row and changes identity constantly.
  const onEnterRef = useRef(onEnter);
  useEffect(() => {
    onEnterRef.current = onEnter;
  });

  useEffect(() => {
    if (!isOpen || paused) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const last = Math.max(rowCount - 1, 0);
      const move = (next: (index: number) => number) => {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((index) => Math.min(Math.max(next(index), 0), last));
      };
      switch (event.key) {
        case "ArrowDown":
          return move((index) => index + 1);
        case "ArrowUp":
          return move((index) => index - 1);
        case "PageDown":
          return move((index) => index + 5);
        case "PageUp":
          return move((index) => index - 5);
        case "Home":
          return move(() => 0);
        case "End":
          return move(() => last);
        case "Enter": {
          if (rowCount === 0 || (target && ENTER_OWNERS.has(target.tagName))) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onEnterRef.current();
          return;
        }
        default:
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, paused, rowCount, setActiveIndex]);

  // Keep the highlight on screen. `nearest` so a highlight already in view does
  // not scroll the list out from under the operator.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const row = viewportRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, rowCount]);

  return { viewportRef };
}
