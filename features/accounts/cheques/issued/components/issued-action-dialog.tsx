"use client";

/**
 * Hosts whichever issued verb is open — the received `ActionDialog`'s rules
 * (form built fresh on mount, the verb on the OK button, the live reason under
 * the fields, a confirmation naming the money before the POST, the server's
 * own sentence on a refusal), over the issued specs and their fields.
 *
 * The confirmation is kept although the Qt dialog went straight to the POST:
 * every verb here but Presented writes a reversal voucher, and the React
 * register asks before every write.
 */
import { useState, type ReactNode } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useRunChequeActionMutation } from "@/store/api/chequesApi";
import { chequeError } from "../../api-errors";
import { formatDate } from "../../domain/chequeRow";
import { describeIssued } from "../domain/row";
import {
  bookOf,
  nextLeafLine,
  type AnyIssuedActionSpec,
  type IssuedActionContext,
  type PresentedForm,
  type ReplaceForm,
  type ReverseForm,
} from "../actions/specs";
import type { IssuedActionResult, IssuedChequeRow } from "../issued.types";
import styles from "../../cheques.module.scss";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.formRow}>
      <span className={styles.formLabel}>{label}</span>
      {children}
    </label>
  );
}

function DateInput(props: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="date"
      className={styles.input}
      value={props.value}
      min={props.min}
      max={props.max}
      autoFocus={props.autoFocus}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

function ReasonInput(props: {
  id: string;
  value: string;
  reasons: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      {/* A pre-fill, not a whitelist: type any reason. */}
      <input
        className={styles.input}
        list={props.id}
        value={props.value}
        maxLength={200}
        placeholder="why — required"
        onChange={(event) => props.onChange(event.target.value)}
      />
      <datalist id={props.id}>
        {props.reasons.map((reason) => (
          <option key={reason} value={reason} />
        ))}
      </datalist>
    </>
  );
}

type FieldsProps = {
  spec: AnyIssuedActionSpec;
  row: IssuedChequeRow;
  form: unknown;
  set: (patch: Record<string, unknown>) => void;
  context: IssuedActionContext;
};

function VerbFields({ spec, row, form, set, context }: FieldsProps) {
  const { today, books } = context;
  switch (spec.id) {
    case "presented": {
      const f = form as PresentedForm;
      return (
        <>
          <Field label="Bank date">
            <DateInput
              autoFocus
              value={f.date}
              min={row.chequeDate ?? undefined}
              max={today}
              onChange={(date) => set({ date })}
            />
          </Field>
          <Field label="Remarks">
            <input
              className={styles.input}
              value={f.remarks}
              maxLength={250}
              onChange={(event) => set({ remarks: event.target.value })}
            />
          </Field>
        </>
      );
    }
    case "returned":
    case "stop": {
      const f = form as ReverseForm;
      return (
        <>
          <Field label="Date">
            <DateInput autoFocus value={f.date} max={today} onChange={(date) => set({ date })} />
          </Field>
          <Field label="Reason">
            <ReasonInput
              id={`issued-${spec.id}-reasons`}
              value={f.reason}
              reasons={spec.reasons ?? []}
              onChange={(reason) => set({ reason })}
            />
          </Field>
          <Field label={spec.id === "stop" ? "Stop fee" : "Bank charges"}>
            <input
              className={styles.input}
              value={f.charges}
              inputMode="decimal"
              placeholder="0.00"
              title="What our bank charged for it — posted to bank charges on the same voucher"
              onChange={(event) => set({ charges: event.target.value })}
            />
          </Field>
        </>
      );
    }
    case "void": {
      const f = form as { date: string; reason: string };
      return (
        <>
          <Field label="Date">
            <DateInput autoFocus value={f.date} max={today} onChange={(date) => set({ date })} />
          </Field>
          <Field label="Reason">
            <ReasonInput
              id="issued-void-reasons"
              value={f.reason}
              reasons={spec.reasons ?? []}
              onChange={(reason) => set({ reason })}
            />
          </Field>
        </>
      );
    }
    case "replace": {
      const f = form as ReplaceForm;
      const book = bookOf(books, f.chequeBookId);
      return (
        <>
          <Field label="Voucher date">
            <DateInput autoFocus value={f.date} max={today} onChange={(date) => set({ date })} />
          </Field>
          <Field label="Cheque book">
            <select
              className={styles.select}
              value={f.chequeBookId}
              onChange={(event) => set({ chequeBookId: event.target.value })}
            >
              <option value="">— choose the book —</option>
              {books.map((candidate) => (
                <option key={candidate.chequeBookId} value={candidate.chequeBookId}>
                  {candidate.bankName} · Book {candidate.bookNo} · {candidate.leafFrom}–{candidate.leafTo} ·{" "}
                  {candidate.left} left
                </option>
              ))}
            </select>
          </Field>
          <Field label="New leaf">
            <span className={styles.mutedLine}>{nextLeafLine(book, books)}</span>
          </Field>
          <Field label="Cheque date">
            <DateInput
              value={f.chequeDate}
              min={f.date || undefined}
              onChange={(chequeDate) => set({ chequeDate })}
            />
          </Field>
          <Field label="Favouring">
            <input
              className={styles.input}
              value={f.favouring}
              maxLength={150}
              onChange={(event) => set({ favouring: event.target.value })}
            />
          </Field>
          <Field label="A/c payee (crossed)">
            <input
              type="checkbox"
              checked={f.acPayee}
              onChange={(event) => set({ acPayee: event.target.checked })}
            />
          </Field>
          <Field label="Reason">
            <ReasonInput
              id="issued-replace-reasons"
              value={f.reason}
              reasons={spec.reasons ?? []}
              onChange={(reason) => set({ reason })}
            />
          </Field>
        </>
      );
    }
    default:
      return null;
  }
}

export type IssuedActionDialogProps = {
  spec: AnyIssuedActionSpec;
  row: IssuedChequeRow;
  context: IssuedActionContext;
  onClose: () => void;
  onDone: (result: IssuedActionResult) => void;
};

export function IssuedActionDialog({ spec, row, context, onClose, onDone }: IssuedActionDialogProps) {
  const [form, setForm] = useState<unknown>(() => spec.initial(row, context));
  const [stage, setStage] = useState<"form" | "confirm">("form");
  const [serverError, setServerError] = useState<string | null>(null);
  const [run, { isLoading }] = useRunChequeActionMutation();

  const problem = spec.validate(row, form, context);
  const note = spec.note(row, form, context);

  const set = (patch: Record<string, unknown>) => {
    setServerError(null);
    setForm((current: unknown) => ({ ...(current as Record<string, unknown>), ...patch }));
  };

  const submit = async () => {
    if (problem || isLoading) {
      return;
    }
    setServerError(null);
    try {
      const result = await run({ endpoint: spec.endpoint, body: spec.build(row, form, context) }).unwrap();
      onDone(result as unknown as IssuedActionResult);
    } catch (error) {
      setServerError(chequeError(error));
      setStage("form");
    }
  };

  const head = [
    row.bankName,
    row.bookNo ? `book ${row.bookNo}` : "",
    row.voucherRefno,
    row.chequeDate ? `dated ${formatDate(row.chequeDate)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ModalShell
      title={spec.title}
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
                {isLoading ? "Working…" : spec.okLabel}
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.secondaryButton} onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                form="issued-action-form"
                className={styles.primaryButton}
                disabled={Boolean(problem)}
              >
                {spec.okLabel}
              </button>
            </>
          )}
        </div>
      }
    >
      {stage === "form" ? (
        <form
          id="issued-action-form"
          className={styles.formGrid}
          onSubmit={(event) => {
            event.preventDefault();
            if (!problem) {
              setStage("confirm");
            }
          }}
        >
          <p className={styles.summaryLine}>
            <b>{describeIssued(row)}</b>
            {head ? <span className={styles.mutedLine}> {head}</span> : null}
          </p>
          {serverError ? (
            <p className={styles.errorLine} role="alert">
              {serverError}
            </p>
          ) : null}
          <VerbFields spec={spec} row={row} form={form} set={set} context={context} />
          <p className={styles.mutedLine}>{note}</p>
          {problem ? <p className={styles.problemLine}>{problem}</p> : null}
          {/* Enter in a box moves on to the confirmation, never straight to the POST. */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      ) : (
        <div className={styles.dialogBody}>
          <p className={styles.dialogConfirm}>{spec.confirm(row, form, context)}</p>
          <p className={styles.mutedLine}>{note}</p>
        </div>
      )}
    </ModalShell>
  );
}
