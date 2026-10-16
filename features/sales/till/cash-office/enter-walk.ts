/**
 * Enter moves to the next field, as Qt's `EnterNavigation` on the Cash Office
 * and its popups: put on a form's container, it takes a plain Enter in an
 * input or a select and focuses the next control (the last field's next is
 * the panel's button, which Enter then presses). A control that took the
 * Enter itself — the count's Qty boxes, a dropdown committing a row — has
 * already called `preventDefault`, and is left alone; Ctrl+Enter is the
 * dialogs' own.
 */
import type { KeyboardEvent } from "react";
import { focusNextInteractiveControl } from "@/components/design-system/ui/focus-next-control";

export function walkOnEnter(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter" || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  event.preventDefault();
  focusNextInteractiveControl(target);
}
