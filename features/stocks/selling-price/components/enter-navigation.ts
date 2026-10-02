/**
 * The Qt dialogs' EnterNavigation: Enter on a field moves to the next one
 * (what Tab does), Enter on a button presses it (the browser already does),
 * and whoever owns Enter right now keeps it — an open dropdown commits its
 * row (it calls `preventDefault`, which is how it is recognised here), a list
 * activates its row.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function enterMovesToNextField(event: ReactKeyboardEvent<HTMLElement>): void {
  if (
    event.key !== "Enter" ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
    return;
  }
  const root = (event.currentTarget.closest('[role="dialog"]') as HTMLElement | null) ?? event.currentTarget;
  const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && element.offsetParent !== null,
  );
  const index = focusables.indexOf(target);
  const next = index >= 0 ? focusables[index + 1] : undefined;
  if (!next) {
    return;
  }
  event.preventDefault();
  next.focus();
  if (next instanceof HTMLInputElement && next.type !== "checkbox") {
    next.select();
  }
}
