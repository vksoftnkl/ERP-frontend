/**
 * Every figure box on the till selects its text on focus — Tab, Enter or a
 * click — so what is typed replaces it (Qt 2026-10-12: an empty-looking 0
 * took a typed 1 as "01"; a typed 500 must replace the float, not append).
 *
 * Selected at once for the keyboard, and again on the next tick: a click
 * places the caret AFTER the focus event, which would undo the first select
 * (Qt defers its `selectAll` the same way).
 */
import type { FocusEvent } from "react";

export function selectOnFocus(event: FocusEvent<HTMLInputElement>): void {
  const input = event.currentTarget;
  input.select();
  window.setTimeout(() => {
    if (document.activeElement === input) input.select();
  }, 0);
}
