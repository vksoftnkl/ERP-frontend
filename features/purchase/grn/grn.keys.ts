/**
 * The GRN's keyboard: the shared transaction set (`lib/txn-keys`) as the Qt
 * screen binds it — New, Save Draft, Post, Cancel, Close — plus the web's Show
 * List, History and Edit (F2, to key a draft that was opened to look at). The
 * grid's own keys are on F1 under Lines.
 */
import { keySheetRows, type TxnKeyRow } from "@/lib/txn-keys";

export const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Next cell (Barcode, Item, Challan, Recd, Dmg, Rate)", keyText: "Enter" },
  { label: "The item list (from a blank line's Barcode)", keyText: "↓" },
  { label: "Same column, line above / below", keyText: "↑ / ↓" },
  { label: "Next / previous cell, Batch and Expiry included", keyText: "Tab" },
  { label: "Go to the blank line", keyText: "Alt+=" },
  { label: "Remove the line", keyText: "Alt+−" },
];

export const KEY_SHEET = keySheetRows(
  ["new", "saveDraft", "post", "edit", "cancelDoc", "history", "open", "close"],
  LINE_KEYS,
);
