"use client";

/**
 * The warning strip and the Validation popup (§16.4).
 *
 * What the server said about the document, painted — never a verdict
 * recomputed here. The strip is the footer's one-liner: a REFUSED or WARN pill,
 * "N refused · M warning(s)" in the worst colour, and View. The popup lists one
 * row per note: level pill · code (monospace) · "line N — message" or "field —
 * message", the statutory provenance when there is one, and the Override tick
 * or its hint.
 *
 * Four rules (§16.2), all enforced upstream in the reducer and repeated here
 * only in what is drawn:
 *
 *  1. a refusal is never tickable, and `confirmProceed` never passes with one;
 *  2. the Override tick shows only when `overridable && rights.override`; an
 *     overridable note without the right shows a grey "needs override right";
 *  3. the strip hides when empty;
 *  4. ticks reset on every new answer.
 *
 * The same popup serves `confirmProceed(verb)`: Back and the verb, the verb
 * hidden on a refusal, focus on Back.
 */
import { useEffect, useRef } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { notesSummary, refusalCount } from "../salebill.notes";
import type { ValidationNote } from "../salebill.types";
import styles from "../page.module.scss";

export type WarningStripProps = {
  notes: ValidationNote[];
  onView: () => void;
};

export function WarningStrip({ notes, onView }: WarningStripProps) {
  if (notes.length === 0) {
    return null;
  }
  const refused = refusalCount(notes) > 0;
  return (
    <div className={cx(styles.warningStrip, refused ? styles.warningStripRefused : styles.warningStripWarn)}>
      <span className={styles.notePill}>{refused ? "REFUSED" : "WARN"}</span>
      <span className={styles.warningStripText}>{notesSummary(notes)}</span>
      <button type="button" className={quotationStyles.button} onClick={onView}>
        View
      </button>
    </div>
  );
}

function statutoryText(note: ValidationNote): string | null {
  const ref = note.statutory;
  if (!ref) {
    return null;
  }
  const parts = [ref.code];
  if (ref.value !== null && ref.value !== undefined && ref.value !== "") {
    parts.push(typeof ref.value === "number" ? ref.value.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : String(ref.value));
  }
  if (ref.effectiveFrom) {
    parts.push(`from ${ref.effectiveFrom}`);
  }
  return ` · ${parts.join(" · ")}${ref.isCompanyOverride ? " (company override)" : ""}`;
}

/**
 * The server's "no customer" refusal uses the code `SALES_PAN_REQUIRED` with
 * `field: 'sbCustId'` (§16.5): it is shown by the field, not the code.
 */
function whereText(note: ValidationNote): string {
  if (note.line !== null) {
    return `line ${note.line}`;
  }
  if (note.field && note.field !== "document") {
    return note.field;
  }
  return "";
}

export type ValidationPopupProps = {
  isOpen: boolean;
  notes: ValidationNote[];
  overrides: string[];
  canOverride: boolean;
  /** When set, the popup is `confirmProceed`: Back and this verb. */
  proceedVerb: string | null;
  onToggleOverride: (code: string) => void;
  onBack: () => void;
  onProceed: () => void;
};

export function ValidationPopup({
  isOpen,
  notes,
  overrides,
  canOverride,
  proceedVerb,
  onToggleOverride,
  onBack,
  onProceed,
}: ValidationPopupProps) {
  const refused = refusalCount(notes) > 0;
  const backRef = useRef<HTMLButtonElement>(null);
  const ticked = new Set(overrides);

  // Focus goes to Back: the verb is the dangerous answer, and on a refusal it
  // is not offered at all.
  useEffect(() => {
    if (isOpen) {
      backRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <ModalShell
      title="Validation"
      isOpen={isOpen}
      onClose={onBack}
      footer={
        <div className={quotationStyles.buttonBar}>
          <button ref={backRef} type="button" className={quotationStyles.button} onClick={onBack}>
            {proceedVerb ? "Back" : "Close"}
          </button>
          {proceedVerb && !refused ? (
            <button
              type="button"
              className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
              onClick={onProceed}
            >
              {proceedVerb}
            </button>
          ) : null}
        </div>
      }
    >
      <div className={cx(styles.noteBanner, refused ? styles.noteBannerRefused : styles.noteBannerWarn)}>
        {refused
          ? "This document cannot be posted as it stands — a refusal is not something that can be overridden; the document has to change."
          : "The server has something to say about this document. Read it; tick an override where you may and mean to."}
      </div>
      <ul className={styles.noteList}>
        {notes.map((note, index) => {
          const where = whereText(note);
          const statutory = statutoryText(note);
          return (
            <li key={`${note.code}-${index}`} className={styles.noteRow}>
              <span
                className={cx(
                  styles.notePill,
                  note.isRefusal
                    ? styles.notePillRefuse
                    : note.level === "WARN"
                      ? styles.notePillWarn
                      : styles.notePillInfo,
                )}
              >
                {note.level}
              </span>
              <code className={styles.noteCode}>{note.code || "—"}</code>
              <span className={styles.noteMessage}>
                {where ? `${where} — ` : ""}
                {note.message}
                {statutory ? <span className={styles.noteStatutory}>{statutory}</span> : null}
              </span>
              <span className={styles.noteAction}>
                {note.isRefusal ? null : note.overridable && canOverride ? (
                  <label className={styles.noteOverride}>
                    <input
                      type="checkbox"
                      checked={ticked.has(note.code)}
                      onChange={() => onToggleOverride(note.code)}
                    />
                    Override
                  </label>
                ) : note.overridable ? (
                  <span className={styles.noteHint}>needs override right</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {proceedVerb && !refused && notes.some((note) => note.level === "WARN" && note.overridable && !ticked.has(note.code)) ? (
        <p className={styles.noteFootnote}>
          A warning that is not overridden becomes a refusal when the bill is posted.
        </p>
      ) : null}
    </ModalShell>
  );
}
