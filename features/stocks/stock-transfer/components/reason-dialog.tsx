"use client";

/**
 * "Why?" — the Qt `AppMessage::askText`, required, with the screen's presets one
 * click away. Used by Cancel (a posted godown transfer is reversed), Recall (a
 * despatch nobody received comes back) and Settle short (what will never
 * arrive). The reason is a permanent row in the stock ledger's history, so it
 * is never blank.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { cancelReasonProblem } from "../stock-transfer.validate";
import styles from "../page.module.scss";

export type ReasonDialogProps = {
  isOpen: boolean;
  title: string;
  /** The question, and what it will cost. */
  prompt: string;
  placeholder?: string;
  presets?: readonly string[];
  onClose: () => void;
  onSubmit: (reason: string) => void;
};

export function ReasonDialog({ isOpen, title, prompt, placeholder = "Type the reason", presets = [], onClose, onSubmit }: ReasonDialogProps) {
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
      <p className={styles.prompt}>{prompt}</p>
      <input
        ref={inputRef}
        // autoFocus, not a focus() a frame later: the dialog is portaled one commit late.
        autoFocus
        className={quotationStyles.input}
        value={reason}
        maxLength={250}
        placeholder={placeholder}
        autoComplete="off"
        data-uppercase="off"
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
      {problem ? <p className={styles.fieldError}>{problem}</p> : null}
      {presets.length > 0 ? (
        <div className={styles.presetList}>
          {presets.map((preset) => (
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
      ) : null}
    </ModalShell>
  );
}
