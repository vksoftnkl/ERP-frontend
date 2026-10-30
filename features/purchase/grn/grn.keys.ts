/**
 * The GRN's keyboard: the shared transaction set (`lib/txn-keys`) as the Qt
 * screen binds it — New, Save Draft, Post, Cancel, Close, and Qt 7c809f9's
 * `PurchaseDocNav` (Edit F2, Print, History, Previous / Next) — plus the web's
 * Show List. F12 (batches / serials) and Ctrl+A (attachments) are the screen's
 * own; the grid's keys are on F1 under Lines.
 */
import { keySheetRows, type TxnKeyRow } from "@/lib/txn-keys";

export const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Pick PO lines (several POs of the supplier)", keyText: "Ctrl+L" },
  { label: "Batch / godown / MRP / expiry split of the line", keyText: "F12" },
  { label: "Print the labels of a posted GRN", keyText: "Ctrl+Shift+P" },
  { label: "Make the bill from this GRN", keyText: "Ctrl+B" },
  { label: "Attachments (bill scan, damage photos)", keyText: "Ctrl+A" },
  { label: "Transport (on the Transport field)", keyText: "F4 / Space" },
  { label: "Next cell (Barcode, Item, Challan, Recd, Dmg, Rate)", keyText: "Enter" },
  { label: "The item list (from a blank line's Barcode)", keyText: "↓" },
  { label: "Same column, line above / below", keyText: "↑ / ↓" },
  { label: "Next / previous cell, Batch and Expiry included", keyText: "Tab" },
  { label: "Go to the blank line", keyText: "Alt+=" },
  { label: "Remove the line", keyText: "Alt+−" },
];

export const KEY_SHEET = keySheetRows(
  ["new", "saveDraft", "post", "edit", "cancelDoc", "print", "history", "previous", "next", "open", "close"],
  LINE_KEYS,
);

export type GrnScreenKeyEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey" | "repeat" | "defaultPrevented">;

/**
 * The window keys the GRN keeps for itself, beyond the shared set: F12 opens
 * the batches / serials of the line last worked on (Qt `QShortcut(Key_F12)`),
 * Ctrl+A the attachments (Qt `PurchaseAttach::install`), Ctrl+L From PO,
 * Ctrl+B Make bill, Ctrl+Shift+P Print labels. As in Qt, Ctrl+A in a field
 * being typed in stays that field's select-all. Pure.
 */
export type GrnScreenAction = "allocs" | "attach" | "fromPo" | "labels" | "makeBill";

export function grnScreenKey(
  event: GrnScreenKeyEvent,
  state: { overlayOpen: boolean; typingTarget: boolean },
): { action: GrnScreenAction | null; swallow: boolean } {
  if (state.overlayOpen || event.defaultPrevented) {
    return { action: null, swallow: false };
  }
  const bare = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
  if (event.key === "F12" && bare) {
    // Held down, one F12 would open the dialog under itself again and again.
    return { action: event.repeat ? null : "allocs", swallow: true };
  }
  const ctrlOnly = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
  if (ctrlOnly && (event.key === "a" || event.key === "A") && !state.typingTarget) {
    return { action: event.repeat ? null : "attach", swallow: true };
  }
  // Qt GrnEntry's own keys: Ctrl+L From PO, Ctrl+B Make bill, Ctrl+Shift+P labels (Ctrl+P stays Print).
  const once = (action: GrnScreenAction) => ({ action: event.repeat ? null : action, swallow: true });
  if (ctrlOnly && (event.key === "l" || event.key === "L")) {
    return once("fromPo");
  }
  if (ctrlOnly && (event.key === "b" || event.key === "B")) {
    return once("makeBill");
  }
  const ctrlShift = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
  if (ctrlShift && (event.key === "p" || event.key === "P")) {
    return once("labels");
  }
  return { action: null, swallow: false };
}

/** Is the key going to a field that types (where Ctrl+A means select-all)? */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) {
    return !(target as HTMLTextAreaElement).readOnly;
  }
  if (target instanceof HTMLInputElement) {
    const type = (target.type || "text").toLowerCase();
    return !target.readOnly && !target.disabled && ["text", "search", "number", "email", "tel", "url", "password"].includes(type);
  }
  return false;
}
