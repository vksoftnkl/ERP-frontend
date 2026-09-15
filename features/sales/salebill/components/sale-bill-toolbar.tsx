"use client";

/**
 * The bill form's action bar, in the legacy screen's own order and wording:
 *
 *   Settle - F5 · Adjust - F4 · Save - F6 · Bill List - F8 ·
 *   Quotation - Ctrl+F3 · Order - Ctrl+F4 · Hold - F9 · Held - F10 ·
 *   Copy - Alt+Y · Edit - F2 · Cancel Order · Clear - F7 · Close
 *
 * Two things are ABSENT rather than present-and-dead, and both are deliberate:
 *
 *  - **Print (F11).** Not yet wired, though the pipeline DOES exist — the plan's
 *    §18.1 describes the Qt client, not this repo. `SALE_INVOICE` is a seeded
 *    purpose, the server has three sale-bill data providers, and the F8 picker
 *    already prints the highlighted bill through them. What is missing is only
 *    the binding for the bill on screen, so the button waits rather than being
 *    offered dead.
 *  - **"Delete".** A bill is never deleted, and `POST /bills/delete` does not
 *    delete one: it cancels the SOURCE ORDER. It is labelled for what it does.
 */
import { cx } from "@/components/design-system/cx";
import styles from "@/features/sales/quotation/page.module.scss";
import type { SaleBillBusy } from "../use-sale-bill-draft";

export type SaleBillToolbarProps = {
  mode: "entry" | "browse";
  busy: SaleBillBusy;
  canEdit: boolean;
  canSave: boolean;
  canCopyAsNew: boolean;
  canCancelOrder: boolean;
  onOpenTender: () => void;
  onOpenAdjust: () => void;
  onSave: () => void;
  onShowList: () => void;
  onImportQuotation: () => void;
  onImportOrder: () => void;
  onHold: () => void;
  onShowHeld: () => void;
  onCancelOrder: () => void;
  onCopyAsNew: () => void;
  onEdit: () => void;
  onClear: () => void;
  onClose: () => void;
};

export function SaleBillToolbar(props: SaleBillToolbarProps) {
  const {
    mode,
    busy,
    canEdit,
    canSave,
    canCopyAsNew,
    canCancelOrder,
    onOpenTender,
    onOpenAdjust,
    onSave,
    onShowList,
    onImportQuotation,
    onImportOrder,
    onHold,
    onShowHeld,
    onCancelOrder,
    onCopyAsNew,
    onEdit,
    onClear,
    onClose,
  } = props;
  const working = busy !== "idle";
  const editable = mode === "entry";

  return (
    <div className={styles.buttonBar}>
      <button
        type="button"
        className={styles.button}
        disabled={working || !canSave}
        title="Take the money — cash, card, UPI, cheque, credit"
        onClick={onOpenTender}
      >
        Settle <span className={styles.buttonHint}>F5</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !canSave}
        title="Set off advances and credit notes this customer already holds"
        onClick={onOpenAdjust}
      >
        Adjust <span className={styles.buttonHint}>F4</span>
      </button>
      <button
        type="button"
        className={cx(styles.button, styles.buttonPrimary)}
        disabled={working || !canSave}
        onClick={onSave}
      >
        {busy === "saving" ? "Saving…" : "Save"} <span className={styles.buttonHint}>F6</span>
      </button>
      <button type="button" className={styles.button} disabled={working} onClick={onShowList}>
        Bill List <span className={styles.buttonHint}>F8</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !canSave}
        title="Bill a quotation"
        onClick={onImportQuotation}
      >
        Quotation <span className={styles.buttonHint}>Ctrl+F3</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !canSave}
        title="Bill a sales order's pending quantity"
        onClick={onImportOrder}
      >
        Order <span className={styles.buttonHint}>Ctrl+F4</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !canSave}
        title="Park this cart on the server — it can be resumed at any counter"
        onClick={onHold}
      >
        {busy === "holding" ? "Holding…" : "Hold"} <span className={styles.buttonHint}>F9</span>
      </button>
      <button type="button" className={styles.button} disabled={working} onClick={onShowHeld}>
        Held <span className={styles.buttonHint}>F10</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !canCopyAsNew}
        onClick={onCopyAsNew}
      >
        Copy <span className={styles.buttonHint}>Alt+Y</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || editable || !canEdit}
        onClick={onEdit}
      >
        Edit <span className={styles.buttonHint}>F2</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !canCancelOrder}
        title="Write off every open line of the sales order this bill was raised against. The bill itself is untouched."
        onClick={onCancelOrder}
      >
        Cancel Order
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working || !editable}
        onClick={onClear}
      >
        Clear <span className={styles.buttonHint}>F7</span>
      </button>
      <button type="button" className={styles.button} disabled={working} onClick={onClose}>
        Close
      </button>
    </div>
  );
}
