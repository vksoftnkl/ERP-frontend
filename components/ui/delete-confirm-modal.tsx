"use client";

import { useEffect, useRef } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import styles from "./delete-confirm-modal.module.scss";

type DeleteConfirmModalProps = {
  isOpen: boolean;
  itemName?: string;
  title?: string;
  message?: string;
  note?: string;
  iconVariant?: "delete" | "replace";
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// The record name is no longer folded into the sentence — it gets its own
// mono chip below it — so the default message never names the item.
const DEFAULT_MESSAGE = "Do you really want to delete this record?";
const DEFAULT_NOTE = "This action cannot be undone.";

export default function DeleteConfirmModal({
  isOpen,
  itemName,
  title = "Are you sure?",
  message,
  note,
  iconVariant = "delete",
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  loadingLabel = "Deleting...",
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      modalRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimeout);
    };
  }, [isOpen]);

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
        event.stopPropagation();
        event.stopImmediatePropagation();
        onCancel();
        return;
      }

      if (
        event.key !== "Enter" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLButtonElement ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLAnchorElement
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onConfirm();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onCancel, onConfirm]);

  if (!isOpen) {
    return null;
  }

  const isDefaultMessage = message === undefined;
  const effectiveMessage = message ?? DEFAULT_MESSAGE;
  const hasMessage = effectiveMessage.trim().length > 0;
  // Callers that fold the name into their own message keep it there; only chip
  // it when that would not repeat it.
  const showRecordChip = Boolean(itemName) && !effectiveMessage.includes(itemName ?? "");
  const effectiveNote = note ?? (isDefaultMessage ? DEFAULT_NOTE : undefined);
  const tone = iconVariant === "replace" ? "info" : "danger";

  return (
    <ModalPortal>
    <div
      className={`${styles.overlay} erp-ms-confirm-overlay`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className={styles.backdrop}
        onClick={onCancel}
        disabled={loading}
        aria-label="Close delete confirmation"
      />

      <div
        ref={modalRef}
        className={`${styles.modal} erp-ms-confirm erp-ms-confirm--${tone}`}
        tabIndex={-1}
      >
        <div className="erp-ms-confirm-head">
          <h3 className={`${styles.title} erp-ms-confirm-head-title`}>{title}</h3>
          <button
            type="button"
            className="erp-ms-confirm-close"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close delete confirmation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" aria-hidden="true">
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="erp-ms-confirm-body">
          <div className={`${styles.iconWrap} erp-ms-confirm-icon`} aria-hidden="true">
            <svg className={styles.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {iconVariant === "replace" ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.5 7.5h11.25m0 0-3-3m3 3-3 3M19.5 16.5H8.25m0 0 3 3m-3-3 3-3"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              )}
            </svg>
          </div>

          <div className={`${styles.content} erp-ms-confirm-msg`}>
            {hasMessage ? (
              <p className={`${styles.message} erp-ms-confirm-q`}>{effectiveMessage}</p>
            ) : null}
            {showRecordChip ? (
              <p className="erp-ms-confirm-record">
                Record: <span className="erp-ms-confirm-entity">{itemName}</span>
              </p>
            ) : null}
            {effectiveNote ? (
              <p className="erp-ms-confirm-note">{effectiveNote}</p>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className={styles.progressWrap}>
            <div className={styles.progressHeader}>
              <span>{loadingLabel}</span>
              <span aria-hidden="true">...</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} />
            </div>
          </div>
        ) : null}

        <div className={`${styles.footerRow} erp-ms-confirm-foot`}>
          <span className="erp-ms-confirm-hint">
            <kbd>Enter</kbd>: {confirmLabel} <span>|</span> <kbd>Esc</kbd>: {cancelLabel}
          </span>
          <div className={`${styles.actions} erp-ms-confirm-actions`}>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className={`${styles.cancelButton} erp-ms-confirm-cancel`}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`${styles.deleteButton} erp-ms-confirm-ok`}
            >
              {loading ? loadingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
