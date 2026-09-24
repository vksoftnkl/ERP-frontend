/**
 * Where the cursor starts, and where Enter takes it next.
 *
 * The screen is keyed top to bottom, so Enter is a Tab that knows the ORDER a
 * receipt is written in — not the order the DOM happens to be in. That
 * distinction matters here: the party picker sits in a panel below the header
 * strip and the Amount box sits in a section bar below that, so a DOM walk
 * would visit three buttons and a table before reaching the next thing anybody
 * types.
 *
 * `focusNextInteractiveControl` — the app's own Enter-as-Tab — is the DOM walk,
 * and it is right for a modal form whose fields ARE in order. Here the order is
 * declared instead, which is also what makes it reviewable: the list below is
 * the keying sequence, and nothing else decides it.
 */

/** The attribute a field carries. On the wrapper for a dropdown, on the input otherwise. */
export const RECEIPT_FIELD_ATTR = "data-receipt-field";

/**
 * The keying order.
 *
 * It starts on RECEIPT NO — which is read-only, and deliberately so: the
 * operator's eye starts at the top left, and a receipt takes its number at
 * post (R10). Landing there says "this is the document" before asking for
 * anything; Enter moves on at once.
 */
export const RECEIPT_FIELD_ORDER = [
  "receiptNo",
  "date",
  "beat",
  "collectedBy",
  "theirRef",
  "refDate",
  "ourRef",
  "narration",
  "party",
  "amount",
] as const;

export type ReceiptFieldName = (typeof RECEIPT_FIELD_ORDER)[number];

/** The field after this one, or null at the end of the walk. Pure. */
export function nextFieldName(current: string | null): ReceiptFieldName | null {
  if (!current) {
    return RECEIPT_FIELD_ORDER[0];
  }
  const index = RECEIPT_FIELD_ORDER.indexOf(current as ReceiptFieldName);
  if (index < 0 || index >= RECEIPT_FIELD_ORDER.length - 1) {
    return null;
  }
  return RECEIPT_FIELD_ORDER[index + 1];
}

/**
 * The control to put the caret in for a named field.
 *
 * A dropdown carries the name on its WRAPPER, because the input inside it
 * belongs to the component; everything else carries it on the input itself.
 * So: the element if it can take focus, otherwise the first control inside it.
 */
function controlOf(element: Element | null): HTMLElement | null {
  if (!element) {
    return null;
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.disabled ? null : element;
  }
  const inner = element.querySelector<HTMLElement>("input, select, textarea");
  if (!inner) {
    return null;
  }
  const disabled =
    (inner instanceof HTMLInputElement ||
      inner instanceof HTMLSelectElement ||
      inner instanceof HTMLTextAreaElement) &&
    inner.disabled;
  return disabled ? null : inner;
}

function fieldElement(root: ParentNode, name: string): HTMLElement | null {
  return controlOf(root.querySelector(`[${RECEIPT_FIELD_ATTR}="${name}"]`));
}

/** Put the caret in a named field, selecting what is there. */
export function focusReceiptField(root: ParentNode | null, name: ReceiptFieldName): boolean {
  const control = root ? fieldElement(root, name) : null;
  if (!control) {
    return false;
  }
  control.focus();
  if (control instanceof HTMLInputElement && control.type !== "date") {
    // A date input has no text selection of its own, and asking for one throws
    // in Chromium.
    control.select();
  }
  return true;
}

/**
 * Enter: move to the next field that can actually take the caret.
 *
 * A disabled one is stepped OVER rather than stopped at — on a posted receipt
 * every field is disabled, and Enter should do nothing at all rather than
 * strand the caret.
 */
export function advanceReceiptField(root: ParentNode | null, from: HTMLElement | null): boolean {
  if (!root || !from) {
    return false;
  }
  const owner = from.closest(`[${RECEIPT_FIELD_ATTR}]`);
  const current = owner?.getAttribute(RECEIPT_FIELD_ATTR) ?? null;
  if (!current) {
    return false;
  }
  let name = nextFieldName(current);
  while (name) {
    if (focusReceiptField(root, name)) {
      return true;
    }
    name = nextFieldName(name);
  }
  return false;
}
