import type { KeyboardEvent } from "react";

const FOCUSABLE_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[role="combobox"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusElement(element: HTMLElement | null | undefined) {
  if (!element) return;
  requestAnimationFrame(() => {
    element.focus();
  });
}

function shouldBypassKeyboardNav(target: HTMLElement) {
  if (target.closest("[data-kb-ignore='true']")) return true;
  if (target.closest("[role='listbox']")) return true;

  const expandedCombobox = target.closest("[role='combobox'][aria-expanded='true']");
  if (expandedCombobox) return true;

  return false;
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [] as HTMLElement[];

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      el.tabIndex !== -1 &&
      !el.hasAttribute("data-kb-skip") &&
      el.getAttribute("aria-hidden") !== "true" &&
      !el.closest("[aria-hidden='true']"),
  );
}

function findCurrentIndex(elements: HTMLElement[], target: HTMLElement) {
  return elements.findIndex((el) => el === target || el.contains(target));
}

export function handleLinearKeyboardNav(
  e: KeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
) {
  const target = e.target as HTMLElement;
  if (!container || shouldBypassKeyboardNav(target)) return;

  const elements = getFocusableElements(container);
  const currentIndex = findCurrentIndex(elements, target);

  if (currentIndex < 0) return;

  if (e.key === "Enter" && e.shiftKey) {
    e.preventDefault();
    focusElement(elements[currentIndex - 1] ?? null);
    return;
  }

  if (e.key === "Enter" || e.key === "ArrowDown") {
    e.preventDefault();
    focusElement(elements[currentIndex + 1] ?? null);
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    focusElement(elements[currentIndex - 1] ?? null);
  }
}

function focusGridCell(group: string, row: number, col: number) {
  const cell = document.querySelector<HTMLElement>(
    `[data-kb-group="${group}"][data-kb-row="${row}"][data-kb-col="${col}"]`,
  );

  if (!cell) return;

  const firstFocusable =
    cell.matches(FOCUSABLE_SELECTOR)
      ? cell
      : cell.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);

  focusElement(firstFocusable ?? cell);
}

type GridNavArgs = {
  group: string;
  row: number;
  col: number;
  maxRow: number;
  maxCol: number;
  allowLeftRight?: boolean;
};

export function handleGridKeyboardNav(
  e: KeyboardEvent<HTMLElement>,
  args: GridNavArgs,
) {
  const target = e.target as HTMLElement;
  if (shouldBypassKeyboardNav(target)) return;

  const { group, row, col, maxRow, maxCol, allowLeftRight = false } = args;
  const isTextInput =
    target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button"].includes(target.type);

  const moveNextCell = () => {
    if (col < maxCol) {
      focusGridCell(group, row, col + 1);
      return;
    }

    if (row < maxRow) {
      focusGridCell(group, row + 1, 0);
    }
  };

  const movePrevCell = () => {
    if (col > 0) {
      focusGridCell(group, row, col - 1);
      return;
    }

    if (row > 0) {
      focusGridCell(group, row - 1, maxCol);
    }
  };

  if (e.key === "Enter" && e.shiftKey) {
    e.preventDefault();
    movePrevCell();
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    moveNextCell();
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (row < maxRow) focusGridCell(group, row + 1, col);
    return;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (row > 0) focusGridCell(group, row - 1, col);
    return;
  }

  if (allowLeftRight && !isTextInput && e.key === "ArrowRight") {
    e.preventDefault();
    moveNextCell();
    return;
  }

  if (allowLeftRight && !isTextInput && e.key === "ArrowLeft") {
    e.preventDefault();
    movePrevCell();
  }
}