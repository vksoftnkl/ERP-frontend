const FOCUSABLE_CONTROL_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(", ");
export function focusNextInteractiveControl(
  current: HTMLElement,
  skipWithin?: HTMLElement | null,
): boolean {
  const scope = current.closest<HTMLElement>("form") ?? document.body;
  const candidates = Array.from(
    scope.querySelectorAll<HTMLElement>(FOCUSABLE_CONTROL_SELECTOR),
  ).filter(
    (candidate) =>
      candidate.tabIndex >= 0 && candidate.getClientRects().length > 0,
  );
  const currentIndex = candidates.indexOf(current);
  if (currentIndex < 0) {
    return false;
  }
  for (let index = currentIndex + 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (skipWithin && skipWithin.contains(candidate)) {
      continue;
    }
    candidate.focus();
    if (candidate instanceof HTMLInputElement) {
      candidate.select();
    }
    return true;
  }
  return false;
}
