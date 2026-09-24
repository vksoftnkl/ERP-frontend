"use client";

/**
 * Hosts whichever `ActionSpec` is open — it never knows which.
 *
 * A MODAL over the register, not a panel under it: the inline Qt version took
 * the height of its tallest panel from the register just when the operator
 * wanted to re-read the rows they were about to act on.
 *
 *  - The form is built from `spec.initial` when the dialog MOUNTS, and the
 *    screen mounts a fresh one per opening. Nothing is remembered from last
 *    time — that is how a slip gets back-dated by accident.
 *  - The verb is the title and the OK button ("Deposit 3 cheques").
 *  - `validate` runs live; its reason sits under the fields and OK stays
 *    disabled until it is gone.
 *  - Every targeted row is listed by name, in a scrolling list, however many.
 *  - OK leads to a confirmation naming the money and the effect; only its
 *    button POSTs.
 *  - Esc steps back from the confirmation, and closes from the form.
 *  - A refusal leaves it open with the server's own sentence.
 */
import { useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useRunChequeActionMutation } from "@/store/api/chequesApi";
import { applyPatch, type AnyActionSpec } from "../actions";
import { chequeError } from "../api-errors";
import { describe, formatAmount } from "../domain/chequeRow";
import type { ChequeActionResult, ChequeDetail, ChequeRow } from "../domain/types";
import type { ChequeVocabulary } from "../domain/vocabulary";
import { ACTION_FIELDS } from "./action-fields";
import styles from "../cheques.module.scss";

export type ActionDialogProps = {
  spec: AnyActionSpec;
  rows: readonly ChequeRow[];
  words: ChequeVocabulary;
  today: string;
  detail: ChequeDetail | null;
  bounceReasons: readonly string[];
  onClose: () => void;
  onDone: (result: ChequeActionResult, rows: readonly ChequeRow[], form: unknown) => void;
};

export function ActionDialog(props: ActionDialogProps) {
  const { spec, rows, words, today, detail, bounceReasons, onClose, onDone } = props;
  const [form, setForm] = useState<unknown>(() => spec.initial(rows, today, detail));
  const [stage, setStage] = useState<"form" | "confirm">("form");
  const [serverError, setServerError] = useState<string | null>(null);
  const [run, { isLoading }] = useRunChequeActionMutation();

  const problem = spec.validate(rows, form, today);
  const verb = spec.verb(rows, form, words);
  const note = spec.note?.(rows, form) ?? null;
  const Fields = ACTION_FIELDS[spec.id];
  const summary = spec.summary
    ? spec.summary(rows)
    : rows.length === 1
      ? describe(rows[0])
      : `${rows.length} cheques`;
  const total = useMemo(
    () => rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100,
    [rows],
  );

  const set = (patch: Record<string, unknown>) => {
    setServerError(null);
    setForm((current: unknown) => applyPatch(spec, current, patch));
  };

  const submit = async () => {
    if (problem || isLoading) {
      return;
    }
    setServerError(null);
    try {
      const result = await run({ endpoint: spec.endpoint, body: spec.build(rows, form) }).unwrap();
      onDone(result, rows, form);
    } catch (error) {
      setServerError(chequeError(error));
      setStage("form");
    }
  };

  const targets = (
    <div className={styles.field}>
      <span className={styles.targetCaption}>
        {rows.length === 1 ? "The cheque" : `${rows.length} cheques · ${formatAmount(total)}`}
      </span>
      <ul className={styles.targetList}>
        {rows.map((row) => (
          <li key={row.apdId}>
            <span>{describe(row)}</span>
            <span>{row.instrumentDate ? row.instrumentDate.split("-").reverse().join("-") : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <ModalShell
      title={verb}
      isOpen
      panelClassName={styles.actionDialog}
      onClose={() => {
        if (isLoading) {
          return;
        }
        if (stage === "confirm") {
          setStage("form");
          return;
        }
        onClose();
      }}
      footer={
        <div className={styles.dialogActions}>
          {stage === "confirm" ? (
            <>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isLoading}
                onClick={() => setStage("form")}
              >
                Back
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={isLoading || Boolean(problem)}
                autoFocus
                onClick={() => void submit()}
              >
                {isLoading ? "Working…" : verb}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.secondaryButton} onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                form="cheque-action-form"
                className={styles.primaryButton}
                disabled={Boolean(problem)}
                title={spec.hint}
              >
                {verb}
              </button>
            </>
          )}
        </div>
      }
    >
      {stage === "form" ? (
        <form
          id="cheque-action-form"
          className={styles.formGrid}
          onSubmit={(event) => {
            event.preventDefault();
            if (!problem) {
              setStage("confirm");
            }
          }}
        >
          {serverError ? (
            <p className={styles.errorLine} role="alert">
              {serverError}
            </p>
          ) : null}
          <Fields
            form={form}
            set={set}
            rows={rows}
            detail={detail}
            bounceReasons={bounceReasons}
            today={today}
          />
          <p className={styles.summaryLine}>{summary}</p>
          {note ? <p className={styles.mutedLine}>{note}</p> : null}
          {problem ? <p className={styles.problemLine}>{problem}</p> : null}
          {/* Enter in a box moves on to the confirmation, never straight to the POST. */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      ) : (
        <div className={styles.dialogBody}>
          <p className={styles.dialogConfirm}>{spec.confirm(rows, form, words)}</p>
          {targets}
        </div>
      )}
    </ModalShell>
  );
}
