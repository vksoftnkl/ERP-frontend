"use client";
/**
 * The order form's action bar, in the Qt screen's own order and wording:
 *
 *   Tender - F5 | Save - F5 · Save & Print - F6 · Order List - F8 · Copy - Alt+Y ·
 *   Edit - F2 · Delete - F3 · Clear - F7 · Last Order - F11 · Cancel
 *
 * Two things follow from that set, and they are deliberate:
 *
 *  - **F5 is one button of two.** `sales.tender_type` decides the route: on the
 *    tender route F5 takes the money and the dialog's own Save / Save & Print
 *    writes the order; off it, F5 is a plain Save. Save & Print (F6) is always
 *    there.
 *  - **There is no Hold.** An order is saved, not parked; the quotation screen's
 *    F9/F10 have no counterpart here.
 */
import { cx } from "@/components/design-system/cx";
import styles from "@/features/sales/quotation/page.module.scss";
import type { SaleOrderBusy } from "../use-sale-order-draft";

export type SaleOrderSaveRoute = "tender" | "save";

export type SaleOrderToolbarProps = {
  mode: "entry" | "browse";
  busy: SaleOrderBusy;
  /** Which F5 the operator gets — see `tenderRouteApplies`. */
  saveRoute: SaleOrderSaveRoute;
  canEdit: boolean;
  canDelete: boolean;
  canCopyAsNew: boolean;
  canTender: boolean;
  onOpenTender: () => void;
  onSave: () => void;
  onSaveAndPrint: () => void;
  onShowList: () => void;
  onCopyAsNew: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
  /** F11 — reprint the order saved last on this screen. */
  onLastOrder: () => void;
  onCancel: () => void;
};

export function SaleOrderToolbar(props: SaleOrderToolbarProps) {
  const {
    mode,
    busy,
    saveRoute,
    canEdit,
    canDelete,
    canCopyAsNew,
    canTender,
    onOpenTender,
    onSave,
    onSaveAndPrint,
    onShowList,
    onCopyAsNew,
    onEdit,
    onDelete,
    onClear,
    onLastOrder,
    onCancel,
  } = props;
  const working = busy !== "idle";
  const editable = mode === "entry";
  return (
    <div className={styles.buttonBar}>
      {saveRoute === "tender" ? (
        <button
          type="button"
          className={styles.button}
          disabled={working || !canTender}
          title="Record the advance the customer is handing over, then save"
          onClick={onOpenTender}
        >
          Tender <span className={styles.buttonHint}>F5</span>
        </button>
      ) : (
        <button
          type="button"
          className={styles.button}
          disabled={working || !editable}
          onClick={onSave}
        >
          {busy === "saving" ? "Saving…" : "Save"} <span className={styles.buttonHint}>F5</span>
        </button>
      )}
      <button
        type="button"
        className={cx(styles.button, styles.buttonPrimary)}
        disabled={working || !editable}
        onClick={onSaveAndPrint}
      >
        {busy === "saving" ? "Saving…" : "Save & Print"} <span className={styles.buttonHint}>F6</span>
      </button>
      <button type="button" className={styles.button} disabled={working} onClick={onShowList}>
        Order List <span className={styles.buttonHint}>F8</span>
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
        disabled={working || mode === "entry" || !canEdit}
        onClick={onEdit}
      >
        Edit <span className={styles.buttonHint}>F2</span>
      </button>
      <button type="button" className={styles.button} disabled={working || !canDelete} onClick={onDelete}>
        Delete <span className={styles.buttonHint}>F3</span>
      </button>
      <button type="button" className={styles.button} disabled={working || !editable} onClick={onClear}>
        Clear <span className={styles.buttonHint}>F7</span>
      </button>
      <button
        type="button"
        className={styles.button}
        disabled={working}
        title="Reprint the order saved last on this screen"
        onClick={onLastOrder}
      >
        Last Order <span className={styles.buttonHint}>F11</span>
      </button>
      <button type="button" className={styles.button} disabled={working} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
