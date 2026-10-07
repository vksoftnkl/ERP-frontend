"use client";

/**
 * "Why is this document being reversed?" — the Qt `AppMessage::askText` the
 * cancel asks, required, with the screen's presets one click away. The reason
 * is a permanent row in the stock ledger's history, so it is never blank.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { CANCEL_REASONS } from "../stock-adjustment.constants";
import { cancelReasonProblem } from "../stock-adjustment.validate";
import styles from "../page.module.scss";

export type CancelReasonDialogProps = {
  isOpen: boolean;
  /** "Cancel ADJ/2026-2027/PC01/00012" */
  title: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
};

export function CancelReasonDialog({ isOpen, title, onClose, onSubmit }: CancelReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setProblem(null);
    }
  }, [isOpen]);

  const submit = () => {
    const refusal = cancelReasonProblem(reason);
    if (refusal) {
      setProblem(refusal);
      inputRef.current?.focus();
      return;
    }
    onSubmit(reason.trim());
  };

  return (
    <ModalShell
      title={title}
      isOpen={isOpen}
      narrow
      onClose={onClose}
      footer={
        <span className={quotationStyles.gridHeadActions}>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={submit}>
            OK
          </button>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Cancel
          </button>
        </span>
      }
    >
      <p className={styles.prompt}>Why is this document being reversed?</p>
      <input
        ref={inputRef}
        // Focus on mount: the dialog is portaled one commit late, so a focus()
        // queued a frame after opening can land before the box exists.
        autoFocus
        className={quotationStyles.input}
        value={reason}
        maxLength={250}
        placeholder="Type the reason"
        autoComplete="off"
        list="stock-adjustment-cancel-reasons"
        onChange={(event) => {
          setReason(event.target.value);
          setProblem(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <datalist id="stock-adjustment-cancel-reasons">
        {CANCEL_REASONS.map((preset) => (
          <option key={preset} value={preset} />
        ))}
      </datalist>
      {problem ? <p className={styles.fieldError}>{problem}</p> : null}
      <div className={styles.presetList}>
        {CANCEL_REASONS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={styles.presetButton}
            onClick={() => {
              setReason(preset);
              setProblem(null);
              inputRef.current?.focus();
            }}
          >
            {preset}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}
