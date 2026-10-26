"use client";

/**
 * "Keyboard shortcuts" from the user menu, or `?` anywhere outside a field: the
 * keys every screen shares. A screen's own sheet (F1, `TxnKeysSheet`) lists only
 * what that screen binds; this one is the whole vocabulary, read from the same
 * tables (`lib/txn-keys`) so the two never disagree.
 */
import { TxnKeysSheetSection } from "@/components/txn/txn-keys-sheet";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { keySheetRows, TXN_KEY_ACTIONS, type TxnKeyRow } from "@/lib/txn-keys";
import sheetStyles from "@/components/txn/txn-keys-sheet.module.scss";

const ANYWHERE_KEYS: readonly TxnKeyRow[] = [
  { label: "Keyboard shortcuts", keyText: "?" },
  { label: "Keys on this screen", keyText: "F1" },
  { label: "Close a dialog", keyText: "Esc" },
];

// NexDropdown's registry keys (components/design-system/dropdown/use-dropdown-keys.ts).
const DROPDOWN_KEYS: readonly TxnKeyRow[] = [
  { label: "Add a record to the list", keyText: "Alt+C" },
  { label: "Amend the selected record", keyText: "Alt+A" },
];

const ENTRY_KEYS = keySheetRows(TXN_KEY_ACTIONS);

export type KeyboardShortcutsDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <ModalShell
      title="Keyboard shortcuts"
      isOpen={open}
      narrow
      onClose={onClose}
      footer={
        <button type="button" className={quotationStyles.button} autoFocus onClick={onClose}>
          Close · Esc
        </button>
      }
    >
      <div className={sheetStyles.sheet}>
        <TxnKeysSheetSection heading="Anywhere" rows={ANYWHERE_KEYS} />
        <TxnKeysSheetSection heading="Entry screens" rows={ENTRY_KEYS.document} />
        <TxnKeysSheetSection heading="Entry lines" rows={ENTRY_KEYS.lines} />
        <TxnKeysSheetSection heading="Dropdowns" rows={DROPDOWN_KEYS} />
      </div>
    </ModalShell>
  );
}
