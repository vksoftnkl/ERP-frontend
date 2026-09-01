"use client";
import { useEffect, useRef } from "react";
import ModalPortal from "@/components/ui/modal-portal";
import styles from "./template-scope-modal.module.scss";

export type TemplateScopeChoice = "COMPANY" | "BRANCH";

type TemplateScopeModalProps = {
  isOpen: boolean;
  /** What is being templated, in the plural: "customers", "items". */
  entityLabelPlural: string;
  /** What the values are being taken from, when the form is on a saved record. */
  sourceRecordName?: string | null;
  /** A one-line summary of the document about to be written (§ "no preview"). */
  summary?: string | null;
  /** False disables "This Branch Only" — there is no branch to save it against. */
  canSaveToBranch: boolean;
  /** True when this branch already has its own template, which outranks a
   *  company-wide one and would otherwise make "All Branches" look inert. */
  hasBranchTemplate: boolean;
  /** Whether that branch template goes away when "All Branches" is chosen. */
  clearBranchTemplate: boolean;
  onClearBranchTemplateChange: (next: boolean) => void;
  saving: boolean;
  onChoose: (scope: TemplateScopeChoice) => void;
  onCancel: () => void;
};

/**
 * Three answers, so a real modal rather than `window.confirm`: both scopes are
 * legal (`asd_max_scope` BRANCH is the deepest level ALLOWED, not a
 * requirement) and they mean different things, so the operator picks.
 *
 * The body is also the only place "existing customers are not touched" gets
 * said, and "default template" reads like a bulk update to anyone who has not
 * written one.
 */
export default function TemplateScopeModal({
  isOpen,
  entityLabelPlural,
  sourceRecordName,
  summary,
  canSaveToBranch,
  hasBranchTemplate,
  clearBranchTemplate,
  onClearBranchTemplateChange,
  saving,
  onChoose,
  onCancel,
}: TemplateScopeModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const focusTimeout = window.setTimeout(() => modalRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || saving) {
      return;
    }
    // CAPTURE phase, and this is the whole reason: the entry modal underneath
    // registered its own window listener when it opened, so a bubble-phase
    // handler here would run second and Escape would close the FORM behind the
    // prompt. The same handler swallows the form's save chords, so a stray
    // Ctrl+S cannot create a customer while this is up — the two writes on this
    // form must never trigger each other.
    //
    // Escape only. There is no Enter shortcut on purpose: with two legal
    // answers, a blind Enter would pick one of them for the operator.
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSubmitChord =
        (!event.altKey &&
          !event.shiftKey &&
          (event.ctrlKey || event.metaKey) &&
          (event.key === "Enter" || event.key.toLowerCase() === "s")) ||
        event.key === "F12";
      if (event.key !== "Escape" && !isSubmitChord) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, saving, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <ModalPortal>
      <div
        className={styles.overlay}
        role="dialog"
        aria-modal="true"
        aria-label="Save as default template"
      >
        <button
          type="button"
          className={styles.backdrop}
          onClick={onCancel}
          disabled={saving}
          aria-label="Close save as default template"
        />
        <div ref={modalRef} className={styles.modal} tabIndex={-1}>
          <h3 className={styles.title}>Save as Default Template</h3>
          <p className={styles.message}>
            {sourceRecordName
              ? `New ${entityLabelPlural} will start with the values on this form, taken from ${sourceRecordName}.`
              : `New ${entityLabelPlural} will start with the values on this form.`}
          </p>
          <p className={styles.note}>
            {`Existing ${entityLabelPlural} are not touched. Where should this template apply?`}
          </p>
          {summary ? <p className={styles.summary}>{summary}</p> : null}
          {hasBranchTemplate ? (
            // Said before the choice, not after it: settings layer GLOBAL <
            // COMPANY < BRANCH, so a company-wide save made from a branch that
            // has its own template writes a row nothing here will ever read —
            // which is indistinguishable from a save that failed.
            <div className={styles.shadowWarning}>
              <p className={styles.shadowWarningText}>
                {`This branch already has its own template, and a branch template outranks the company-wide one.`}
              </p>
              <label className={styles.shadowWarningChoice}>
                <input
                  type="checkbox"
                  checked={clearBranchTemplate}
                  disabled={saving}
                  onChange={(event) => onClearBranchTemplateChange(event.target.checked)}
                />
                <span>
                  {`Remove this branch's own template, so All Branches applies here too.`}
                </span>
              </label>
            </div>
          ) : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.scopeButton} ${styles.scopeButtonSecondary}`}
              onClick={() => onChoose("BRANCH")}
              disabled={saving || !canSaveToBranch}
              title={
                canSaveToBranch
                  ? `Only this branch starts new ${entityLabelPlural} this way.`
                  : "This session is not signed in to a branch."
              }
            >
              This Branch Only
            </button>
            <button
              type="button"
              className={styles.scopeButton}
              onClick={() => onChoose("COMPANY")}
              disabled={saving}
              title={
                hasBranchTemplate && clearBranchTemplate
                  ? "Every branch, including this one — its own template is removed."
                  : "Every branch that has no template of its own."
              }
            >
              All Branches
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
