"use client";
/**
 * The button bar.
 *
 * Save stays clickable in browse mode and is refused by validation with a reason,
 * rather than being a dead button the operator cannot interrogate.
 */
import { cx } from "@/components/design-system/cx";
import type { QuotationBusy } from "../use-quotation-draft";
import styles from "../page.module.scss";
export type QuotationToolbarProps = {
  mode: "entry" | "browse";
  busy: QuotationBusy;
  /** False for a deleted document, which stays read-only for good. */
  canEdit: boolean;
  canDelete: boolean;
  onShowList: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
  onSaveAndPrint: () => void;
  onSave: () => void;
  /** Same gate as Delete/Edit — there is a saved document to base the copy on. */
  canCopyAsNew: boolean;
  onCopyAsNew: () => void;
  /** False when there is nothing on the grid worth parking. */
  canHold: boolean;
  /** Set once the cart has been parked — Hold then updates that same row. */
  heldNo: string;
  onHold: () => void;
  onPickHeld: () => void;
  onCancel: () => void;
};
function Hint({ children }: { children: string }) {
  return <span className={styles.buttonHint}>{children}</span>;
}
export function QuotationToolbar(props: QuotationToolbarProps) {
  const {
    mode,
    busy,
    canEdit,
    canDelete,
    onShowList,
    onEdit,
    onDelete,
    onClear,
    onSaveAndPrint,
    onSave,
    canCopyAsNew,
    onCopyAsNew,
    canHold,
    heldNo,
    onHold,
    onPickHeld,
    onCancel,
  } = props;
  const isBusy = busy !== "idle";
  return (
    <div className={styles.buttonBar}>
      <button
        type="button"
        className={cx(styles.button, styles.buttonPrimary)}
        disabled={isBusy}
        onClick={onSave}
      >
        {busy === "saving" ? "Saving…" : "Save"}
        <Hint>F5</Hint>
      </button>
      <button type="button" className={styles.button} disabled={isBusy} onClick={onSaveAndPrint}>
        Save &amp; print<Hint>F6</Hint>
      </button>
      <button type="button" className={styles.button} disabled={isBusy} onClick={onShowList}>
        Show list<Hint>F8</Hint>
      </button>
      {/* Park and recall. Hold is the alternative to Save, not a step towards
          it: nothing is written to `sale_quotation` until the cart is resumed
          and saved. */}
      <button
        type="button"
        className={styles.button}
        disabled={isBusy || !canHold}
        title={
          canHold
            ? heldNo
              ? `Update hold ${heldNo} and clear the form`
              : "Park this quotation and clear the form"
            : "Only a quotation being entered, with at least one item, can be held"
        }
        onClick={onHold}
      >
        {busy === "holding" ? "Holding…" : heldNo ? "Re-hold" : "Hold"}
        <Hint>F9</Hint>
      </button>
      <button type="button" className={styles.button} disabled={isBusy} onClick={onPickHeld}>
        {busy === "resuming" ? "Resuming…" : "Pick held"}
        <Hint>F10</Hint>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={isBusy || !canCopyAsNew}
        onClick={onCopyAsNew}
      >
        Copy as new<Hint>Ctrl+F9</Hint>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={isBusy || mode === "entry" || !canEdit}
        title={canEdit ? undefined : "This quotation is deleted and cannot be edited."}
        onClick={onEdit}
      >
        Edit<Hint>F2</Hint>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={isBusy || !canDelete}
        onClick={onDelete}
      >
        Delete<Hint>F3</Hint>
      </button>
      <button type="button" className={styles.button} disabled={isBusy} onClick={onClear}>
        Clear<Hint>F7</Hint>
      </button>
      <button type="button" className={styles.button} disabled={isBusy} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}