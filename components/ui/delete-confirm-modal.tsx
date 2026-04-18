"use client";

import { useEffect } from "react";
import {
  KeyboardShortcutHints,
  type KeyboardShortcutDefinition,
} from "@/components/library/ui/keyboard-shortcut-hints";
import styles from "./delete-confirm-modal.module.scss";

type DeleteConfirmModalProps = {
  isOpen: boolean;
  itemName?: string;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

function buildDefaultMessage(itemName?: string): string {
  if (!itemName) {
    return "Do you really want to delete this record? This action cannot be undone.";
  }

  return `Do you really want to delete "${itemName}"? This action cannot be undone.`;
}

export default function DeleteConfirmModal({
  isOpen,
  itemName,
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  loadingLabel = "Deleting...",
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
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
      onConfirm();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading, onCancel, onConfirm]);

  if (!isOpen) {
    return null;
  }

  const effectiveMessage = message ?? buildDefaultMessage(itemName);
  const footerShortcuts: KeyboardShortcutDefinition[] = loading
    ? []
    : [
        {
          label: cancelLabel,
          keys: ["Escape"],
        },
        {
          label: confirmLabel,
          keys: ["Enter"],
        },
      ];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className={styles.backdrop}
        onClick={onCancel}
        disabled={loading}
        aria-label="Close delete confirmation"
      />

      <div className={styles.modal}>
        <div className={styles.iconWrap} aria-hidden="true">
          <svg className={styles.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>

        <div className={styles.content}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.message}>{effectiveMessage}</p>
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

        {footerShortcuts.length > 0 ? (
          <div className={styles.footerShortcuts}>
            <KeyboardShortcutHints
              shortcuts={footerShortcuts}
              dense
            />
          </div>
        ) : null}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={styles.cancelButton}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={styles.deleteButton}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
