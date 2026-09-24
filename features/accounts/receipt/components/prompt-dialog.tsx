"use client";

/**
 * The one-line prompt the lifecycle verbs need: a cancel's reason and an
 * amend's edit remark.
 *
 * Both are REQUIRED by the server, and both are required for the same reason —
 * the trail has to say WHY, and nobody writes it afterwards. So an empty answer
 * is not "proceed without one", it is a cancelled gesture.
 */
import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "../page.module.scss";

export type PromptDialogProps = {
  title: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

export function PromptDialog(props: PromptDialogProps) {
  const { title, message, placeholder, confirmLabel = "Continue", onCancel, onConfirm } = props;
  // Mounted only while it is open, so the box starts empty by construction
  // rather than by an effect that clears it.
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const submit = () => {
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <ModalShell
      title={title}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!value.trim()}
            onClick={submit}
          >
            {confirmLabel}
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
          maxLength={250}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>
    </ModalShell>
  );
}
