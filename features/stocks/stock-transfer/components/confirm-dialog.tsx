"use client";

import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import styles from "../page.module.scss";

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

/** A yes / no question in the app's own dialog (the Qt `AppMessage::showConfirm`). */
export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const cancel = () => {
    onClose();
    request?.onCancel?.();
  };
  return (
    <ModalShell
      title={request?.title ?? ""}
      isOpen={request !== null}
      narrow
      onClose={cancel}
      footer={
        <span className={quotationStyles.gridHeadActions}>
          <button
            type="button"
            autoFocus
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            onClick={() => {
              onClose();
              request?.onConfirm();
            }}
          >
            {request?.confirmLabel ?? "Yes"}
          </button>
          <button type="button" className={quotationStyles.button} onClick={cancel}>
            {request?.cancelLabel ?? "No"}
          </button>
        </span>
      }
    >
      <p className={styles.prompt}>{request?.message}</p>
    </ModalShell>
  );
}
