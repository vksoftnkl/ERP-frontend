"use client";

/**
 * The two questions the voucher asks, on the house `ModalShell` (portaled,
 * backdrop split, Escape closes the topmost only):
 *
 *  - `CancelReasonDialog` — Qt `AppMessage::askText` for "Cancel voucher…"
 *    and "Cancel & re-enter…" (`reenter`): a required reason with the three
 *    preset chips. An empty answer is not "cancel without one"; the confirm
 *    button waits for text.
 *  - `ConfirmDialog` — a Yes / No (discarding unsaved typing). Yes holds the
 *    focus, so Enter answers it; Esc is No.
 *
 * Focus is taken with `autoFocus`, not a `focus()` a frame later: ModalShell
 * portals a commit after it opens, and a timer can lose that race and leave
 * the caret behind the dialog.
 */
import { useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "../expense.module.scss";

export const CANCEL_REASON_PRESETS = ["Entered in error", "Wrong amount", "Wrong ledger"] as const;

export type CancelReasonDialogProps = {
  voucherNo: string | null;
  /** Cancel, then open a copy to correct and post (Qt 5e25760). */
  reenter?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function CancelReasonDialog({ voucherNo, reenter = false, busy, onCancel, onConfirm }: CancelReasonDialogProps) {
  const [reason, setReason] = useState("");
  const ready = reason.trim().length > 0 && !busy;
  const submit = () => {
    if (ready) {
      onConfirm(reason.trim());
    }
  };

  return (
    <ModalShell
      title={`${reenter ? "Cancel and re-enter expense" : "Cancel expense"}${voucherNo ? ` ${voucherNo}` : ""}`}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={onCancel}>
            Back
          </button>
          <button type="button" className={styles.dangerButton} disabled={!ready} onClick={submit}>
            {busy ? "Cancelling…" : reenter ? "Cancel & re-enter" : "Cancel voucher"}
          </button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>
          {reenter
            ? "The voucher is cancelled (a mirror Rev voucher gives the cash back to the drawer) and a copy opens to correct and post. Why?"
            : "Cancelling writes a mirror voucher (Rev) and gives the cash back to the drawer it came from. Why?"}
        </p>
        <input
          autoFocus
          className={styles.input}
          value={reason}
          maxLength={250}
          placeholder="reason"
          aria-label="Reason"
          onChange={(event) => setReason(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className={styles.presets}>
          {CANCEL_REASON_PRESETS.map((preset) => (
            <button key={preset} type="button" className={styles.preset} onClick={() => setReason(preset)}>
              {preset}
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <ModalShell
      title={request?.title ?? ""}
      isOpen={request !== null}
      narrow
      onClose={onClose}
      footer={
        <div className={styles.dialogActions}>
          <button
            type="button"
            autoFocus
            className={styles.primaryButton}
            onClick={() => {
              onClose();
              request?.onConfirm();
            }}
          >
            {request?.confirmLabel ?? "Yes"}
          </button>
          <button type="button" className={styles.button} onClick={onClose}>
            No
          </button>
        </div>
      }
    >
      <p className={styles.dialogNote}>{request?.message}</p>
    </ModalShell>
  );
}
