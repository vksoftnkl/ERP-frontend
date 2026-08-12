"use client";
/**
 * The order form's action bar. Same shape and shortcuts as the quotation's
 * (F5 save · F6 save+print · F7 clear · F8 list · F2 edit · F3 delete ·
 * Ctrl+F9 copy as new), plus the two the order adds: Ctrl+F3 imports a
 * quotation, and Advance opens the tender dialog. No hold on this screen —
 * an order is saved, not parked.
 */
import { cx } from "@/components/design-system/cx";
import styles from "@/features/sales/quotation/page.module.scss";
import type { SaleOrderBusy } from "../use-sale-order-draft";

export type SaleOrderToolbarProps = {
  mode: "entry" | "browse";
  busy: SaleOrderBusy;
  canEdit: boolean;
  canDelete: boolean;
  canCopyAsNew: boolean;
  canTender: boolean;
  onShowList: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
  onImportQuotation: () => void;
  onOpenTender: () => void;
  onCopyAsNew: () => void;
  onSave: () => void;
  onSaveAndPrint: () => void;
  onCancel: () => void;
};

export function SaleOrderToolbar(props: SaleOrderToolbarProps) {
  const {
    mode,
    busy,
    canEdit,
    canDelete,
    canCopyAsNew,
    canTender,
    onShowList,
    onEdit,
    onDelete,
    onClear,
    onImportQuotation,
    onOpenTender,
    onCopyAsNew,
    onSave,
    onSaveAndPrint,
    onCancel,
  } = props;
  const working = busy !== "idle";
  const editable = mode === "entry";
  return (
    <div className={styles.buttonBar}>
      <button type="button" className={styles.button} disabled={working} onClick={onShowList}>
        List <span className={styles.buttonHint}>F8</span>
      </button>
      {mode === "browse" ? (
        <button type="button" className={styles.button} disabled={working || !canEdit} onClick={onEdit}>
          Edit <span className={styles.buttonHint}>F2</span>
        </button>
      ) : null}
      <button type="button" className={styles.button} disabled={working || !canDelete} onClick={onDelete}>
        Delete <span className={styles.buttonHint}>F3</span>
      </button>
      <button type="button" className={styles.button} disabled={working || !editable} onClick={onClear}>
        Clear <span className={styles.buttonHint}>F7</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !editable}
        title="Raise this order from a quotation"
        onClick={onImportQuotation}
      >
        Import Quotation <span className={styles.buttonHint}>Ctrl+F3</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !canTender}
        title="Record the advance the customer is handing over"
        onClick={onOpenTender}
      >
        Advance…
      </button>
      <button type="button" className={styles.button} disabled={working || !canCopyAsNew} onClick={onCopyAsNew}>
        Copy as new <span className={styles.buttonHint}>Ctrl+F9</span>
      </button>
      <button type="button" className={styles.button} disabled={working} onClick={onCancel}>
        Close
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !editable}
        onClick={onSaveAndPrint}
      >
        Save &amp; Print <span className={styles.buttonHint}>F6</span>
      </button>
      <button
        type="button"
        className={cx(styles.button, styles.buttonPrimary)}
        disabled={working || !editable}
        onClick={onSave}
      >
        {busy === "saving" ? "Saving…" : "Save"} <span className={styles.buttonHint}>F5</span>
      </button>
    </div>
  );
}
