/**
 * The voucher's keyboard. The document keys are the shared transaction set
 * (`lib/txn-keys.ts`, Qt `TxnKeys`), bound in the entry view with
 * `useTxnKeys` exactly as Opening Stock binds them: Alt+N New, Ctrl+S Save
 * Draft, Ctrl+Enter Save & Post (it still asks), F2 Edit, Alt+X Cancel,
 * Ctrl+H History, Ctrl+O the list, Esc Close, Alt+PgUp / Alt+PgDn the
 * document before / after, F1 the sheet of them (user, 2026-10-24).
 *
 * What is left here is the screen's OWN: Pick from stock moved from F2 to F12
 * — NexTable's key for it — because F2 is Edit on every screen; the F1 sheet's
 * rows; and the Type row's arrows.
 *
 * F12 under a dialog is left alone: there it is only DevTools. Everywhere else
 * on the voucher it is swallowed, picking only while a DRAFT is being keyed.
 * Bare F5 — Save until this rework — is swallowed always, so a habit press
 * cannot reload the page and take the unsaved document with it.
 */
import { keySheetRows, type TxnKeyRow } from "@/lib/txn-keys";

/** F1 — the grid's own keys, under "Lines" (Qt `installHelp()`). */
export const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Pick from stock (the line's lot)", keyText: "F12" },
  { label: "Item list (type a name in Barcode)", keyText: "↓" },
  { label: "Add a line", keyText: "+" },
  { label: "Remove a line", keyText: "−" },
  { label: "Next cell", keyText: "Enter" },
  { label: "Leave the grid", keyText: "Tab" },
];

/** The document keys this screen binds, in the Qt `bind()` order, then its line keys. */
export const KEY_SHEET = keySheetRows(
  ["new", "saveDraft", "post", "edit", "cancelDoc", "history", "open", "close", "previous", "next"],
  LINE_KEYS,
);

export type ScreenKeyEvent = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
};

export type ScreenKeyState = {
  /** Something sits over the voucher (a dialog, the grid's settings menu): it owns the keyboard. */
  overlayOpen: boolean;
  /** A DRAFT open for keying — the only state a pick may change a line in. */
  editable: boolean;
};

export type ScreenKeyResult = { action: "pick" | null; swallow: boolean };

const NOTHING: ScreenKeyResult = { action: null, swallow: false };

/**
 * The window keys this screen keeps for itself, beyond the shared set. The
 * grid's own F12 (on the line it is pressed on) claims the key first; this
 * one is for F12 pressed anywhere else — the line last worked on picks.
 */
export function screenKeyAction(event: ScreenKeyEvent, state: ScreenKeyState): ScreenKeyResult {
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return NOTHING;
  }
  if (event.key === "F5") {
    return { action: null, swallow: true };
  }
  if (event.key !== "F12" || state.overlayOpen) {
    return NOTHING;
  }
  // Held down, one F12 would open the dialog under itself again and again.
  if (event.repeat || event.defaultPrevented) {
    return { action: null, swallow: true };
  }
  return { action: state.editable ? "pick" : null, swallow: true };
}

/**
 * The Type row is a radio group: the arrow keys step to the neighbouring type
 * (wrapping), the way a Qt button group walks. `null` for any other key.
 */
export function kindStep<T>(kinds: readonly T[], current: T, key: string): T | null {
  const delta = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (delta === 0 || kinds.length === 0) {
    return null;
  }
  const index = kinds.indexOf(current);
  const from = index < 0 ? (delta === 1 ? -1 : 0) : index;
  return kinds[(from + delta + kinds.length) % kinds.length];
}
