import {
  LEDGER_FIELD_CONTAINER_SELECTOR,
  LEDGER_PRIMARY_FIELD_CONTROL_SELECTOR,
} from "./constants";
import type {
  LedgerFocusableFieldTarget,
  LedgerFieldNavigationDirection,
} from "./types";

export function getLedgerFocusableFieldControl(container: HTMLElement): HTMLElement | null {
  const primaryControl = container.querySelector<HTMLElement>(
    LEDGER_PRIMARY_FIELD_CONTROL_SELECTOR,
  );
  if (primaryControl) {
    return primaryControl;
  }

  return container.querySelector<HTMLElement>(
    [
      'input:not([type="hidden"]):not([disabled])',
      "textarea:not([disabled])",
      "select:not([disabled])",
      '[role="combobox"]:not([disabled])',
      "button:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(", "),
  );
}

export function getLedgerFocusableFieldTargets(
  root: HTMLElement,
): LedgerFocusableFieldTarget[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(LEDGER_FIELD_CONTAINER_SELECTOR),
  )
    .map((container) => {
      const control = getLedgerFocusableFieldControl(container);
      if (!control || control.getClientRects().length === 0) {
        return null;
      }

      const fieldName = container.dataset.ledgerModalFieldName;
      if (!fieldName) {
        return null;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return null;
      }

      return {
        control,
        fieldName,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    })
    .filter((target): target is LedgerFocusableFieldTarget => target !== null);
}

export function findNextLedgerFieldTarget(
  targets: LedgerFocusableFieldTarget[],
  currentTarget: LedgerFocusableFieldTarget,
  direction: LedgerFieldNavigationDirection,
): LedgerFocusableFieldTarget | null {
  const isHorizontal = direction === "left" || direction === "right";
  let bestTarget: LedgerFocusableFieldTarget | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of targets) {
    if (candidate.fieldName === currentTarget.fieldName) {
      continue;
    }

    const primaryDelta = isHorizontal
      ? candidate.centerX - currentTarget.centerX
      : candidate.centerY - currentTarget.centerY;
    const isInDirection =
      direction === "left" || direction === "up"
        ? primaryDelta < -6
        : primaryDelta > 6;

    if (!isInDirection) {
      continue;
    }

    const overlap = isHorizontal
      ? Math.max(
          0,
          Math.min(currentTarget.rect.bottom, candidate.rect.bottom) -
            Math.max(currentTarget.rect.top, candidate.rect.top),
        )
      : Math.max(
          0,
          Math.min(currentTarget.rect.right, candidate.rect.right) -
            Math.max(currentTarget.rect.left, candidate.rect.left),
        );
    const crossDistance = isHorizontal
      ? Math.abs(candidate.centerY - currentTarget.centerY)
      : Math.abs(candidate.centerX - currentTarget.centerX);
    const score =
      (overlap > 0 ? 0 : 100000) + Math.abs(primaryDelta) * 100 + crossDistance;

    if (score < bestScore) {
      bestScore = score;
      bestTarget = candidate;
    }
  }

  return bestTarget;
}

export function getFirstLedgerFocusableFieldTarget(
  root: HTMLElement,
): LedgerFocusableFieldTarget | null {
  const targets = getLedgerFocusableFieldTargets(root);
  if (targets.length === 0) {
    return null;
  }

  return [...targets].sort((left, right) => {
    const topDifference = left.rect.top - right.rect.top;
    if (Math.abs(topDifference) > 6) {
      return topDifference;
    }

    return left.rect.left - right.rect.left;
  })[0] ?? null;
}

export function focusLedgerFieldControl(control: HTMLElement) {
  control.focus();
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement
  ) {
    try {
      const selectionIndex = control.value.length;
      control.setSelectionRange(selectionIndex, selectionIndex);
    } catch {
      // Ignore unsupported input types.
    }
  }
  control.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
}
