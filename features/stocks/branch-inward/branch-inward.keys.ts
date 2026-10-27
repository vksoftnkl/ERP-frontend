/**
 * The voucher's keyboard: the shared transaction set (`lib/txn-keys`), as Qt
 * binds it on this screen — New, Save Draft, Post, History, Show List, Close —
 * plus Edit (F2) to open a draft that was looked at. Prev / Next are not bound
 * on the Qt screen and are not here. The grid's own keys are on F1 under Lines.
 */
import { keySheetRows, type TxnKeyRow } from "@/lib/txn-keys";

/** F1 — the screen's own keys: the worklist's, then the grid's. */
export const LINE_KEYS: readonly TxnKeyRow[] = [
  { label: "Receive the despatch (worklist)", keyText: "Enter" },
  { label: "Refresh the worklist", keyText: "F5" },
  { label: "Add a Damaged line for this item", keyText: "+" },
  { label: "Remove a line", keyText: "−" },
  { label: "Next cell", keyText: "Enter" },
];

export const KEY_SHEET = keySheetRows(["new", "saveDraft", "post", "edit", "history", "open", "close"], LINE_KEYS);
