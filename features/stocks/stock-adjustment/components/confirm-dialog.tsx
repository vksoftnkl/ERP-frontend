"use client";

/**
 * The Qt `AppMessage::showConfirm(title, text)` — one question, Yes / No, the
 * text's line breaks kept (the post question carries the totals on their own
 * lines). Yes has the focus, so Enter answers it; Esc is No.
 */
import { useEffect, useRef } from "react";
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

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (request) {
      window.requestAnimationFrame(() => confirmRef.current?.focus());
    }
  }, [request]);

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
            ref={confirmRef}
            type="button"
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
      <p className={styles.prompt} style={{ whiteSpace: "pre-line" }}>
        {request?.message}
      </p>
    </ModalShell>
  );
}
