"use client";

/**
 * AskText — a prompt for one line of text, with optional presets and a
 * required flag (the plan's shared `AskText`). The cancel reason, the amend
 * remark, the order-line cancel, the Part-B vehicle and remark, and the
 * re-tender remark all ask through this so they ask the same way.
 *
 * Enter answers when the text is acceptable; Esc backs out. A preset fills the
 * box rather than answering, so the operator can still add to it.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import styles from "@/features/sales/quotation/page.module.scss";
import billStyles from "../page.module.scss";

export type AskTextProps = {
  isOpen: boolean;
  title: string;
  /** The question, under the title. Line breaks are kept. */
  message?: string;
  label?: string;
  placeholder?: string;
  presets?: readonly string[];
  required?: boolean;
  maxLength?: number;
  /** What the box opens with. */
  initialValue?: string;
  /** Upper-case what is typed (a vehicle number, a PAN). */
  uppercase?: boolean;
  busy?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The refusal shown when `required` and the box is blank on Enter. */
  requiredMessage?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void | Promise<void>;
};

export function AskText({
  isOpen,
  title,
  message,
  label = "Reason",
  placeholder,
  presets,
  required = false,
  maxLength = 250,
  initialValue = "",
  uppercase = false,
  busy = false,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  requiredMessage,
  onCancel,
  onConfirm,
}: AskTextProps) {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Every open starts from the initial value, not the last answer.
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setTouched(false);
      const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [initialValue, isOpen]);

  const trimmed = value.trim();
  const blocked = required && !trimmed;

  const submit = () => {
    setTouched(true);
    if (blocked || busy) {
      return;
    }
    void onConfirm(trimmed);
  };

  return (
    <ModalShell
      title={title}
      isOpen={isOpen}
      narrow
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={styles.button} disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cx(styles.button, styles.buttonPrimary)}
            disabled={busy || blocked}
            onClick={submit}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      {message ? <p className={cx(styles.modalNote, billStyles.askTextMessage)}>{message}</p> : null}
      {presets && presets.length > 0 ? (
        <div className={billStyles.reasonPresets}>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={billStyles.reasonPreset}
              disabled={busy}
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
      <label className={styles.label} htmlFor="ask-text-input">
        {label}
        {required ? <span className={styles.requiredMark}>*</span> : null}
        <input
          id="ask-text-input"
          ref={inputRef}
          className={cx(styles.input, touched && blocked && styles.cellInvalid)}
          value={value}
          maxLength={maxLength}
          disabled={busy}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) =>
            setValue(uppercase ? event.target.value.toUpperCase() : event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </label>
      {touched && blocked ? (
        <p className={styles.warning}>{requiredMessage ?? `${label} is required.`}</p>
      ) : null}
    </ModalShell>
  );
}
