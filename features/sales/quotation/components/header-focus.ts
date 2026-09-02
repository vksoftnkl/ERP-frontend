/**
 * Enter walks the header, the way the Qt screen's header behaves: key a field,
 * press Enter, land on the next one — the operator never reaches for the mouse
 * between Customer Name and Price Level.
 *
 * The fields advertise themselves with `data-quotation-focus`, the attribute
 * `validate` already uses to send the operator to the field it rejected, so
 * nothing new has to be declared per field. The DOM is read rather than a list
 * of ids: the header is a three-column grid whose columns are laid out one after
 * another, so document order already IS the order the eye follows, and it cannot
 * drift out of step with a column that Visible Settings hides (a hidden field is
 * not rendered at all, so it simply is not in the walk).
 *
 * The same shape as `grid-focus.ts`, kept separate because the grids walk cells
 * within one grid and this walks fields within one panel.
 */
import { HEADER_FOCUS_ATTR } from "../quotation.constants";

type Focusable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Every field of one header panel, in visual order.
 *
 * A disabled field drops out (browse mode disables the lot); a read-only one
 * does too — the quote number is `readOnly` rather than `disabled` so it keeps
 * the white box of the fields around it, and stopping on a value the operator
 * cannot change would be a dead keypress.
 */
function fieldsOf(container: HTMLElement): Focusable[] {
  return Array.from(container.querySelectorAll<Focusable>(`[${HEADER_FOCUS_ATTR}]`)).filter(
    (element) => !element.disabled && !("readOnly" in element && element.readOnly),
  );
}

/** Move focus one header field forward or back. */
export function moveHeaderFocus(
  container: HTMLElement,
  from: EventTarget | null,
  delta: 1 | -1,
): boolean {
  const fields = fieldsOf(container);
  const index = fields.indexOf(from as Focusable);
  if (index < 0) {
    return false;
  }
  const next = fields[index + delta];
  if (!next) {
    return false;
  }
  next.focus();
  // `<select>` has no `select()`; the text fields do, and arriving with the
  // value selected is what lets the next keystroke replace it — the same way a
  // grid cell and the combo box already hand over.
  if ("select" in next) {
    next.select();
  }
  return true;
}
