"use client";

/**
 * A required reason, with the Qt prompt's preset chips. An empty answer is not
 * "proceed without one" — the server stores whatever it is given (it does not
 * insist on a character), so the trail is guarded here.
 */
import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "@/features/accounts/cheques/cheques.module.scss";

export type ReasonDialogProps = {
  title: string;
  message: string;
  placeholder?: string;
  presets?: readonly string[];
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

export function ReasonDialog({ title, message, placeholder, presets, onCancel, onConfirm }: ReasonDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const ready = value.trim().length > 0;

  return (
    <ModalShell
      title={title}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!ready}
            onClick={() => onConfirm(value.trim())}
          >
            Continue
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
            if (event.key === "Enter" && ready) {
              event.preventDefault();
              onConfirm(value.trim());
            }
          }}
        />
        {presets && presets.length > 0 ? (
          <div className={styles.ticks}>
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={styles.tick}
                onClick={() => {
                  setValue(preset);
                  inputRef.current?.focus();
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
