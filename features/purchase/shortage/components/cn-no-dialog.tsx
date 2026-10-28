"use client";

/**
 * Supplier CN… — the supplier's credit note number for a shortage they will
 * never send. Optional, as the Qt prompt has it (`askText(…, required = !cn)`):
 * the credit is booked bill-wise either way, and the number can be on the
 * supplier's statement before it is on paper here.
 */
import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "@/features/accounts/cheques/cheques.module.scss";
import { CN_NO_MAX_LENGTH } from "../shortage.constants";

export type CnNoDialogProps = {
  message: string;
  onCancel: () => void;
  onConfirm: (cnNo: string) => void;
};

export function CnNoDialog({ message, onCancel, onConfirm }: CnNoDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <ModalShell
      title="Supplier credit note"
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Back
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => onConfirm(value.trim())}>
            Close the shortage
          </button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>{message}</p>
        <input
          ref={inputRef}
          className={styles.input}
          value={value}
          maxLength={CN_NO_MAX_LENGTH}
          placeholder="CN no"
          autoComplete="off"
          data-uppercase="off"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onConfirm(value.trim());
            }
          }}
        />
      </div>
    </ModalShell>
  );
}
