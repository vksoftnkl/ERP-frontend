/**
 * Typed handles for the overlay stacking scale declared on `:root` in
 * app/globals.css. See the comment there for the ordering contract and why
 * literals are not allowed.
 *
 * These are `var()` references rather than numbers on purpose: the numbers
 * live in exactly one place (globals.css), so retiering an overlay never
 * requires keeping CSS and TS in sync. They are valid anywhere a CSS length
 * is accepted — inline `style={{ zIndex: Z_POPUP }}` and custom-property
 * overrides such as `"--erp-modal-overlay-z-index": Z_MODAL_NESTED`.
 *
 * Because they are strings, they cannot be compared or arithmetic'd in JS. If
 * you ever need that, you want a new tier in the scale, not a computed value.
 */

/** Standard modal overlay. */
export const Z_MODAL = "var(--erp-z-modal)";

/** Modal opened from inside another modal (column settings, admin settings…). */
export const Z_MODAL_NESTED = "var(--erp-z-modal-nested)";

/** Portaled dropdown, action menu, context menu or tooltip. Clears all modals. */
export const Z_POPUP = "var(--erp-z-popup)";

/** Confirm / alert dialog. Interrupts whatever is open, so it clears popups. */
export const Z_CONFIRM = "var(--erp-z-confirm)";

/** Caret-following typing assist (Tamil suggestions). */
export const Z_INPUT_ASSIST = "var(--erp-z-input-assist)";

/** Toasts. Must stay readable over every other overlay. */
export const Z_TOAST = "var(--erp-z-toast)";
