/**
 * The voucher's keyboard — which window key runs which action, decided here so
 * the entry view only wires the answer to its handlers.
 *
 * The function keys follow the house screens: F5 Save (and post), F7 New, F8
 * the list, F2 Edit on a saved draft (and, while keying, pick from stock — the
 * grid's own F2), F3 Cancel (the list's F3), F1 the panel walk, Esc leaves.
 * The Save draft / Validate buttons get the two free keys, F4 and F9. F6 and
 * Ctrl+Enter belong to Save & Print, which waits for stock-document printing.
 *
 * A key is "swallowed" (`preventDefault`) whenever it is one of the screen's
 * own, even when it does nothing right now — a held or refused F5 must never
 * fall through to the browser's reload and take the unsaved document with it.
 */
import type { FormMode } from "./stock-adjustment.types";

export type EntryAction =
  | "save"
  | "saveDraft"
  | "validate"
  | "print"
  | "new"
  | "list"
  | "close"
  | "edit"
  | "pick"
  | "cancel"
  | "panelNext"
  | "panelPrev";

export type EntryKeyEvent = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
};

export type EntryKeyState = {
  /** Something sits over the voucher (a dialog, the grid's settings menu): it owns the keyboard. */
  overlayOpen: boolean;
  mode: FormMode;
  status: string;
  saved: boolean;
  busy: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export type EntryKeyResult = { action: EntryAction | null; swallow: boolean };

/** The function keys this screen binds — never handed to the browser. */
const SCREEN_KEYS = new Set(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F12"]);

const NOTHING: EntryKeyResult = { action: null, swallow: false };

export function entryKeyAction(event: EntryKeyEvent, state: EntryKeyState): EntryKeyResult {
  const own = SCREEN_KEYS.has(event.key);
  // Under a dialog, and on auto-repeat (one held F5 would post a dozen times),
  // nothing runs — but the screen's keys still stay away from the browser.
  // F12 is left alone under a dialog: there it is only DevTools.
  if (state.overlayOpen) {
    return { action: null, swallow: own && event.key !== "F12" };
  }
  if (event.repeat) {
    return { action: null, swallow: own };
  }
  // An open dropdown, a half-keyed cell or the grid's own F2 claimed it first.
  if (event.defaultPrevented || event.altKey) {
    return NOTHING;
  }
  const draft = state.status === "DRAFT";
  const editable = state.mode === "entry" && draft;
  const act = (action: EntryAction | null): EntryKeyResult => ({ action, swallow: true });

  if (event.ctrlKey || event.metaKey) {
    // Both Enter keys arrive as "Enter".
    return event.key === "Enter" && !event.shiftKey ? act("print") : NOTHING;
  }
  if (event.shiftKey) {
    return event.key === "F1" ? act("panelPrev") : NOTHING;
  }
  switch (event.key) {
    case "F1":
      return act("panelNext");
    case "F2":
      if (editable) {
        return act("pick");
      }
      return act(draft && state.saved && state.mode === "browse" && state.canEdit && !state.busy ? "edit" : null);
    case "F3":
      return act(state.saved && state.status !== "CANCELLED" && state.canDelete && !state.busy ? "cancel" : null);
    case "F4":
      return act(draft && state.canCreate && !state.busy ? "saveDraft" : null);
    case "F5":
      return act(draft && state.canCreate && !state.busy ? "save" : null);
    case "F6":
      return act("print");
    case "F7":
      return act(state.canCreate && !state.busy ? "new" : null);
    case "F8":
      return act(state.busy ? null : "list");
    case "F9":
      return act(draft && !state.busy ? "validate" : null);
    case "F12":
      return act(editable ? "pick" : null);
    case "Escape":
      return act(state.busy ? null : "close");
    default:
      return NOTHING;
  }
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
