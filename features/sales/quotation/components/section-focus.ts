/**
 * F1 — move between the screen's panels.
 *
 * Enter walks *within* a panel: `header-focus.ts` along the header fields,
 * `grid-focus.ts` along a grid's cells. Neither crosses a panel boundary, so
 * reaching the charges grid from the header meant the mouse. F1 is the step up:
 * it lands on the first field of the next panel and cycles, Header → Items →
 * Charges → Terms → Header.
 *
 * The panels are read from the DOM in document order, the same rule the other
 * two walks follow. Nothing lists them, so a panel that Visible Settings hides —
 * Terms, when every one of its rows is off — leaves the cycle by itself, and a
 * panel with nothing keyable in it (browse mode disables the lot) is stepped
 * over rather than swallowing the keypress.
 */
import { GRID_FOCUS_STOP_ATTR, SECTION_ATTR } from "../quotation.constants";

type Focusable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Every keyable control of one panel, in visual order. */
function fieldsOf(section: HTMLElement): Focusable[] {
  return Array.from(
    section.querySelectorAll<Focusable>('input:not([type="hidden"]), select, textarea'),
  ).filter((element) => !element.disabled);
}

/**
 * Where F1 puts the operator in a panel.
 *
 * On a grid that is the first cell the layout's Enter chain stops at — the
 * Description or Charge Name column — rather than the first control in the row,
 * which is a Barcode box or a read-out nobody arrives meaning to key. Elsewhere
 * it is the first field that is not read-only: landing on the quote number,
 * which the operator cannot change, would waste the keypress.
 */
function entryFieldOf(section: HTMLElement): Focusable | null {
  const fields = fieldsOf(section);
  return (
    fields.find((element) => element.hasAttribute(GRID_FOCUS_STOP_ATTR)) ??
    fields.find((element) => !("readOnly" in element && element.readOnly)) ??
    null
  );
}

/** Move focus to the next panel that has something to key. */
export function moveSectionFocus(delta: 1 | -1): boolean {
  const sections = Array.from(document.querySelectorAll<HTMLElement>(`[${SECTION_ATTR}]`));
  if (sections.length === 0) {
    return false;
  }
  const active = document.activeElement;
  const current = sections.findIndex(
    (section) => active instanceof Node && section.contains(active),
  );
  // Focus sitting outside every panel — the toolbar, or the page itself after a
  // dialog closed — starts the cycle at the first panel rather than nowhere.
  let index = current < 0 ? (delta === 1 ? -1 : 0) : current;
  for (let step = 0; step < sections.length; step += 1) {
    index = (index + delta + sections.length) % sections.length;
    const field = entryFieldOf(sections[index]);
    if (field) {
      field.focus();
      // Arriving with the value selected, the way every other hand-over here
      // does it, so the next keystroke replaces it.
      if ("select" in field) {
        field.select();
      }
      return true;
    }
  }
  return false;
}
