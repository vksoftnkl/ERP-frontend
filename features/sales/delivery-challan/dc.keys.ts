/**
 * Delivery Challan — the keys this screen owns beyond the shared TxnKeys
 * (Qt `DeliveryChallanEntry`'s QShortcuts). Pure: reads a keyboard event,
 * names the action.
 *
 * Every key named here is TAKEN from the browser, busy or not, dialog or not —
 * the screen calls `preventDefault()` before it decides whether to act. F5
 * reloads the page in a browser and F3 / F6 / F7 / F10 do things of their own,
 * so a press during a post (busy) or under a dialog must still never reach it.
 *
 * Import order lines is Ctrl+F4 in Qt, which Chrome keeps for closing the tab:
 * the page never sees it. It stays matched (Firefox, an installed app window
 * deliver it), and Alt+I does the same everywhere.
 */
import type { KeyLike } from "@/lib/txn-keys";

export type DcScreenKey =
  | "deleteDraft"
  | "primary"
  | "primaryPrint"
  | "clear"
  | "showList"
  | "hold"
  | "pickHeld"
  | "validate"
  | "importOrder"
  | "discountAll"
  | "showCost"
  | "copyAsNew"
  /** Taken from the browser and nothing more (Ctrl/Shift+F5 = a hard reload). */
  | "swallow";

/** The key the import is shown under — the one a browser delivers. */
export const DC_IMPORT_KEY_TEXT = "Alt+I";
/** Qt's own chord for it, still matched. */
export const DC_IMPORT_QT_KEY_TEXT = "Ctrl+F4";

function letter(event: KeyLike, wanted: string): boolean {
  // `code` too: Alt+letter is a dead key on some layouts.
  return event.key.toLowerCase() === wanted || event.code === `Key${wanted.toUpperCase()}`;
}

export function dcScreenKeyOf(event: KeyLike): DcScreenKey | null {
  const ctrl = event.ctrlKey || Boolean(event.metaKey);
  const alt = event.altKey;
  const shift = event.shiftKey;
  const key = event.key;
  if (!ctrl && !alt && !shift) {
    switch (key) {
      case "F3":
        return "deleteDraft";
      case "F5":
        return "primary";
      case "F6":
        return "primaryPrint";
      case "F7":
        return "clear";
      case "F8":
        return "showList";
      case "F9":
        return "hold";
      case "F10":
        return "pickHeld";
      default:
        return null;
    }
  }
  if (ctrl && !alt && !shift) {
    if (key === "F7") return "validate";
    if (key === "F4") return "importOrder";
  }
  if (alt && !ctrl && !shift) {
    if (letter(event, "i")) return "importOrder";
    if (letter(event, "d")) return "discountAll";
    if (letter(event, "o")) return "showCost";
    if (letter(event, "y")) return "copyAsNew";
  }
  // A reload by any other chord is still a reload.
  if (key === "F5") return "swallow";
  return null;
}
