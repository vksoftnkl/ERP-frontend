"use client";
import { type ReactNode, useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";
import styles from "./page.module.scss";
const MAX_AUDIT_NOTES_LENGTH = 1000;
type OpeningStockAuditNotesModalProps = {
  isOpen: boolean;
  notes: string;
  error: string | null;
  loading: boolean;
  voucherLabel: string | null;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};
export function OpeningStockAuditNotesModal({
  isOpen,
  notes,
  error,
  loading,
  voucherLabel,
  onChange,
  onConfirm,
  onCancel,
}: OpeningStockAuditNotesModalProps): ReactNode {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const didJustOpen = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!didJustOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimeout = window.setTimeout(() => {
      textareaRef.current?.focus();
      const valueLength = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(valueLength, valueLength);
    }, 0);
    return () => {
      window.clearTimeout(focusTimeout);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, MAX_AUDIT_NOTES_LENGTH]);
  useEffect(() => {
    if (!isOpen || loading) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, loading, onCancel, onConfirm]);
  if (!isOpen) {
    return null;
  }
  const normalizedVoucherLabel = voucherLabel?.trim() ?? "";
  const helperText = normalizedVoucherLabel
    ? `Explain what changed for voucher "${normalizedVoucherLabel}". This note will be stored in audit history.`
    : "Explain what changed. This note will be stored in audit history.";
  const textareaClassName = error
    ? `${styles.auditNotesTextarea} ${styles.auditNotesTextareaInvalid}`
    : styles.auditNotesTextarea;
  return (
    <div className={styles.stockBrowserModalOverlay}>
      <button
        type="button"
        className={styles.stockBrowserModalBackdrop}
        onClick={onCancel}
        disabled={loading}
        aria-label="Close update audit notes"
      />
      <section
        className={styles.auditNotesModalPanel}
        role="dialog"
        aria-modal="true"
        aria-label="Opening stock update audit notes"
      >
        <header className={styles.stockBrowserModalHeader}>
          <div className={styles.stockBrowserModalTitleBlock}>
            <p className={styles.stockBrowserModalEyebrow}>Audit Notes</p>
            <h2 className={styles.stockBrowserModalTitle}>Update Opening Stock</h2>
            <p className={styles.stockBrowserModalSubtitle}>{helperText}</p>
          </div>
          <button
            type="button"
            className={styles.stockBrowserModalCloseButton}
            onClick={onCancel}
            disabled={loading}
            aria-label="Close update audit notes"
          >
            <FiX aria-hidden="true" />
          </button>
        </header>
        <div className={styles.auditNotesModalBody}>
          <label className={styles.auditNotesField}>
            <span className={styles.auditNotesLabel}>Notes</span>
            <textarea
              ref={textareaRef}
              value={notes}
              onChange={(event) => onChange(event.target.value)}
              maxLength={MAX_AUDIT_NOTES_LENGTH}
              rows={6}
              disabled={loading}
              placeholder="Describe the stock changes you made"
              className={textareaClassName}
            />
          </label>
          <div className={styles.auditNotesMetaRow}>
            <p className={error ? styles.auditNotesErrorText : styles.auditNotesHelperText}>
              {error ?? "This note is required for updates. Press Ctrl+Enter to save."}
            </p>
            <span className={styles.auditNotesCharCount}>
              {notes.length}/{MAX_AUDIT_NOTES_LENGTH}
            </span>
          </div>
        </div>
        <footer className={styles.stockBrowserModalFooter}>
          <span className={styles.stockBrowserSelectionText}>
            {loading ? "Saving updated opening stock..." : "Audit note will appear in record history."}
          </span>
          <div className={styles.stockBrowserModalActions}>
            <button
              type="button"
              className={styles.stockBrowserSecondaryButton}
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.stockBrowserPrimaryButton}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Update"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
