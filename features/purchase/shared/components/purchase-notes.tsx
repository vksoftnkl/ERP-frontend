"use client";

/**
 * COM-09 (Qt NexERP 6b81080 `purchase_notes`, mockup "Before you post — 2
 * warnings"): what /validate and /save said about a purchase document, shown
 * the Sale Bill's way — a one-liner in the footer ("2 warnings · View") and a
 * popup at Save / Post, never a strip of rows on the page.
 *
 * - `PurchaseNotesLine` — the footer's count; View opens the popup. Renders
 *   nothing while there is nothing to say.
 * - `PurchaseNotesPopup` — one row per note: REFUSE / WARN pill, the code, "line
 *   4 — message". Asked before a verb (`verb`) it offers Back and the verb; a
 *   refusal hides Post (it stays off until the document changes) but not a
 *   draft save (`verb.key = "save"`: the server keeps a draft it would refuse to
 *   post). A WARN
 *   the Override right can go past carries an Override tick (only with the
 *   right; "needs the Override right" without it); `onProceed` hands the ticked
 *   codes back, and the screen asks the reason before it sends
 *   `overrideWarnings` + `overrideReason` (Qt `confirmPost` / `applyDecision`).
 *   The ticks start clear on every opening. Focus starts on Back.
 *
 * Opt-in: a screen that keeps `PurchaseWarnStrip` is unchanged.
 */
import { useState } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import {
  purchaseNotesCount,
  purchaseNotesOf,
  purchaseNotesTitle,
  type PurchaseIssue,
} from "../purchase-parts";
import styles from "./purchase-parts.module.scss";

export type PurchaseNotesLineProps = {
  warnings: readonly PurchaseIssue[] | null | undefined;
  refusals: readonly PurchaseIssue[] | null | undefined;
  onView: () => void;
  className?: string;
};

export function PurchaseNotesLine({ warnings, refusals, onView, className }: PurchaseNotesLineProps) {
  const notes = purchaseNotesOf(warnings, refusals);
  const count = purchaseNotesCount(notes);
  if (!count) {
    return null;
  }
  return (
    <button
      type="button"
      className={cx(styles.notesLine, notes.refusals > 0 ? styles.notesLineRefused : styles.notesLineWarn, className)}
      tabIndex={-1}
      title="What the server says about this document — View lists it"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onView}
      data-purchase-notes-line=""
    >
      {count} · View
    </button>
  );
}

export type PurchaseNotesPopupProps = {
  open: boolean;
  warnings: readonly PurchaseIssue[] | null | undefined;
  refusals: readonly PurchaseIssue[] | null | undefined;
  /** Asked before a verb: Back and the verb. Null = View (Close only), or the server's refusal. */
  verb: { key: "post" | "save"; label: string } | null;
  /** The server refused this verb (the title says so). */
  refused?: "post" | "save" | null;
  /** The Override right (menu's canOverride) — the ticks show only with it. */
  overrideAllowed: boolean;
  /** No Override ticks at all (a draft save never goes past a warning). */
  noOverride?: boolean;
  onBack: () => void;
  /** The verb, with the codes ticked Override (empty = none). */
  onProceed: (overrides: string[]) => void;
};

export function PurchaseNotesPopup(props: PurchaseNotesPopupProps) {
  // Mounted only while open: the ticks start clear on every opening.
  return props.open ? <OpenNotesPopup {...props} /> : null;
}

function OpenNotesPopup({ warnings, refusals, verb, refused, overrideAllowed, noOverride, onBack, onProceed }: PurchaseNotesPopupProps) {
  const notes = purchaseNotesOf(warnings, refusals);
  const [ticked, setTicked] = useState<string[]>([]);
  // A refusal stops Post; a draft save goes through (the server keeps a draft whatever it refuses for posting)
  const blocked = notes.refusals > 0 && verb?.key !== "save";
  const showTicks = !noOverride && verb !== null && !blocked;
  const title = purchaseNotesTitle(notes, verb ? { verb: verb.key } : refused ? { refused } : null);

  const toggle = (code: string) =>
    setTicked((current) => (current.includes(code) ? current.filter((one) => one !== code) : [...current, code]));

  return (
    <ModalShell
      title={title}
      isOpen
      panelClassName={styles.notesPanel}
      onClose={onBack}
      footer={
        <>
          <button type="button" className={quotationStyles.button} autoFocus onClick={onBack}>
            {verb ? "Back" : "Close"}
          </button>
          {verb && !blocked ? (
            <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={() => onProceed(ticked)}>
              {verb.label}
            </button>
          ) : null}
        </>
      }
    >
      <div className={styles.notesBody} data-purchase-notes="">
        {notes.notes.map((note) => (
          <div key={note.key} className={cx(styles.noteCard, note.refuse ? styles.noteCardRefuse : styles.noteCardWarn)} data-issue-code={note.code}>
            <span className={cx(styles.pill, note.refuse ? styles["tone-danger"] : styles["tone-warning"])}>{note.refuse ? "REFUSE" : "WARN"}</span>
            <div className={styles.noteMain}>
              <code className={styles.warnCode} title={note.code}>
                {note.code || "—"}
              </code>
              <span className={styles.warnText}>
                {note.line !== null ? `line ${note.line} — ` : ""}
                {note.text}
              </span>
            </div>
            {showTicks && note.overridable ? (
              overrideAllowed ? (
                <label className={styles.override}>
                  <input type="checkbox" checked={ticked.includes(note.code)} onChange={() => toggle(note.code)} />
                  Override
                </label>
              ) : (
                <span className={styles.override}>needs the Override right</span>
              )
            ) : null}
          </div>
        ))}
        <p className={styles.notesFoot}>
          {notes.refusals > 0
            ? "A REFUSE row has no tick: Post stays off until the document is changed."
            : verb && !noOverride && notes.overridable > 0
              ? "The tick shows only with the Override right; a ticked row asks for the reason, which is kept on the document's trail."
              : ""}
        </p>
      </div>
    </ModalShell>
  );
}
