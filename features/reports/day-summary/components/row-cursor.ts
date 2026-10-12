"use client";
/**
 * Keyboard rows for the plain (non-virtual) tables: the table box holds
 * focus, ↑/↓/Home/End move a cursor, Enter drills (plan §9.1). The cursor is
 * the table's own; a click moves it, a double-click drills.
 */
import { useCallback, useState, type KeyboardEvent, type RefObject } from "react";

export function useRowCursor(count: number, onEnter: (index: number) => void, boxRef: RefObject<HTMLElement | null>) {
  const [cursor, setCursor] = useState(-1);
  const at = cursor >= count ? count - 1 : cursor;

  const reveal = useCallback(
    (index: number) => {
      window.requestAnimationFrame(() => {
        boxRef.current?.querySelector(`[data-row="${index}"]`)?.scrollIntoView({ block: "nearest" });
      });
    },
    [boxRef],
  );

  const moveTo = useCallback(
    (index: number) => {
      if (count === 0) return;
      const next = Math.max(0, Math.min(count - 1, index));
      setCursor(next);
      reveal(next);
    },
    [count, reveal],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || count === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(at < 0 ? 0 : at + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(at - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(count - 1);
        break;
      case "Enter":
        if (at >= 0) {
          event.preventDefault();
          onEnter(at);
        }
        break;
      default:
    }
  };

  const onFocus = () => {
    if (at < 0 && count > 0) setCursor(0);
  };

  return { cursor: at, setCursor, onKeyDown, onFocus };
}
