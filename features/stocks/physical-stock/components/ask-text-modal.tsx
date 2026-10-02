"use client";

/**
 * AppMessage::askText — one line of text, with presets and a required flag.
 * The cancel reason is asked through this on the screen and on the list, so
 * both ask the same way. Enter answers when the text is acceptable; Esc backs
 * out. A preset fills the box rather than answering, so it can be added to.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import styles from "../page.module.scss";

export type AskTextModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  placeholder?: string;
  presets?: readonly string[];
  required?: boolean;
  /** CancelPhysicalStockVoucherDto.reason is TrimmedString(250). */
  maxLength?: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

/** Mounted only while open, so every open starts blank rather than with the last answer. */
export function AskTextModal(props: AskTextModalProps) {
  return props.isOpen ? <OpenAskText {...props} /> : null;
}

function OpenAskText({
  isOpen,
  title,
  message,
  placeholder,
  presets = [],
  required = false,
  maxLength = 250,
  busy = false,
  onCancel,
  onConfirm,
}: AskTextModalProps) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const trimmed = value.trim();
  const blocked = required && !trimmed;

  const submit = () => {
    setTouched(true);
    if (blocked || busy) {
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <ModalShell
      title={title}
      isOpen={isOpen}
      narrow
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={quotationStyles.button} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={busy || blocked}
            onClick={submit}
          >
            OK
          </button>
        </>
      }
    >
      <p className={cx(quotationStyles.modalNote, styles.askMessage)}>{message}</p>
      {presets.length > 0 ? (
        <div className={styles.reasonPresets}>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={styles.reasonPreset}
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
      <label className={cx(quotationStyles.label, styles.askField)} htmlFor="physical-stock-ask-text">
        <span>
          Reason
          {required ? <span className={quotationStyles.requiredMark}>*</span> : null}
        </span>
        <input
          id="physical-stock-ask-text"
          ref={inputRef}
          className={cx(quotationStyles.input, touched && blocked && quotationStyles.cellInvalid)}
          value={value}
          maxLength={maxLength}
          disabled={busy}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </label>
      {touched && blocked ? <p className={quotationStyles.warning}>Reason is required.</p> : null}
    </ModalShell>
  );
}
