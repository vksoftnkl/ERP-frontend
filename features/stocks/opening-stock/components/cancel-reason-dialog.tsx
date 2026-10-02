"use client";

/**
 * "Why is this opening being reversed?" — `AppMessage::askText()` with the
 * screen's preset reasons.
 *
 * The reason is REQUIRED (the API refuses a cancel without one, and on a posted
 * document the reversal is a ledger row for ever). The presets exist so the
 * reasons that recur arrive spelled the same way; "Other" unlocks the box for
 * anything else. The combo's first entry is deliberately not an answer, so OK
 * cannot be pressed by an operator who never read the question.
 *
 * Drawn at the CONFIRM tier rather than the modal one: from the list it opens
 * over the list's own cancel confirmation, and has to sit above it.
 */
import { useEffect, useRef, useState } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import { cx } from "@/components/design-system/cx";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { Z_CONFIRM } from "@/lib/z-index";
import { CANCEL_REASONS, CANCEL_REASON_MAX_LENGTH } from "../opening-stock.constants";
import styles from "../page.module.scss";

const CHOOSE = "";
const OTHER = "__other__";

export type CancelReasonDialogProps = {
  isOpen: boolean;
  /** "Cancel OPN0001". */
  title: string;
  /** "Why is this opening being reversed?" */
  question: string;
  busy?: boolean;
  onCancel: () => void;
  onAccept: (reason: string) => void;
};

export function CancelReasonDialog({
  isOpen,
  title,
  question,
  busy = false,
  onCancel,
  onAccept,
}: CancelReasonDialogProps) {
  const [choice, setChoice] = useState(CHOOSE);
  const [text, setText] = useState("");
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setChoice(CHOOSE);
    setText("");
    // The combo is where the answer starts, so it takes the focus.
    const timer = window.setTimeout(() => selectRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Answered here and nowhere else — not by a confirmation underneath.
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  const answer = text.trim();
  const canAccept = answer.length > 0 && !busy;
  const accept = () => {
    if (canAccept) {
      onAccept(answer);
    }
  };

  return (
    <ModalPortal>
      <div className={quotationStyles.modalOverlay} style={{ zIndex: Z_CONFIRM }}>
        <button
          type="button"
          className={quotationStyles.modalBackdrop}
          aria-label="Close dialog"
          tabIndex={-1}
          onMouseDown={onCancel}
        />
        <section
          className={cx(quotationStyles.modalPanel, quotationStyles.modalPanelNarrow)}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <header className={quotationStyles.modalHeader}>
            <h2 className={quotationStyles.modalTitle}>{title}</h2>
            <button
              type="button"
              className={quotationStyles.modalClose}
              aria-label="Close"
              onClick={onCancel}
            >
              ×
            </button>
          </header>
          <form
            className={quotationStyles.modalBody}
            onSubmit={(event) => {
              event.preventDefault();
              accept();
            }}
          >
            <label className={styles.promptQuestion} htmlFor="opening-stock-cancel-reason">
              {question}
            </label>
            <select
              id="opening-stock-cancel-reason"
              ref={selectRef}
              className={quotationStyles.select}
              value={choice}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value;
                setChoice(next);
                if (next === OTHER) {
                  setText("");
                  window.setTimeout(() => inputRef.current?.focus(), 0);
                } else {
                  setText(next);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  accept();
                }
              }}
            >
              <option value={CHOOSE}>Select a reason…</option>
              {CANCEL_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
              <option value={OTHER}>Other — type it below</option>
            </select>
            <input
              ref={inputRef}
              className={cx(quotationStyles.input, choice !== OTHER && quotationStyles.inputReadOnly)}
              value={text}
              readOnly={choice !== OTHER}
              disabled={busy}
              maxLength={CANCEL_REASON_MAX_LENGTH}
              placeholder="Type the reason"
              autoComplete="off"
              onChange={(event) => setText(event.target.value)}
            />
            <div className={styles.promptActions}>
              <button type="button" className={quotationStyles.button} disabled={busy} onClick={onCancel}>
                Cancel
              </button>
              <button
                type="submit"
                className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
                disabled={!canAccept}
              >
                {busy ? "Cancelling…" : "OK"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </ModalPortal>
  );
}
