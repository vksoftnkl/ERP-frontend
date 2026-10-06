"use client";

/**
 * Follow-up (F6) on a temp credit — the Qt `TempCreditFollowupDialog`.
 *
 * One line saying whose credit this is, "Promised for" (the date as stored,
 * which may be left, moved or cleared) and "Remark *". Save → `PUT
 * /temp-credits/follow-up` with the body `buildFollowUpBody` makes: the date
 * key travels only when the date was changed (HANDOVER §7.2). Enter moves on,
 * as every popup here does; the last Enter saves.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DateField, TextField } from "@/features/sales/quotation/components/fields";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { describeServerError } from "@/features/masters/shared/server-error-text";
import { useFollowUpTempCreditMutation } from "@/store/api/saleBillApi";
import { buildFollowUpBody, promiseDateOf, REMARK_MAX_LENGTH } from "./follow-up";
import { describeRow, type TempCreditRow } from "./row";

const REMARKS_ID = "tc-followup-remarks";

export type FollowUpDialogProps = {
  row: TempCreditRow | null;
  onClose: () => void;
  /** Recorded — the list re-reads. */
  onSaved: () => void;
};

export function FollowUpDialog({ row, onClose, onSaved }: FollowUpDialogProps) {
  return row ? (
    // Keyed on the credit: a fresh form per row, starting from that row's own
    // stored promise, with nothing carried over from the last one.
    <FollowUpForm key={row.atc_id} row={row} onClose={onClose} onSaved={onSaved} />
  ) : null;
}

function FollowUpForm({ row, onClose, onSaved }: FollowUpDialogProps & { row: TempCreditRow }) {
  const [followUp, { isLoading: saving }] = useFollowUpTempCreditMutation();
  // The date as loaded is what "unchanged" is measured against on save.
  const [originalPromise] = useState(() => promiseDateOf(row));
  const [promiseDate, setPromiseDate] = useState(originalPromise);
  const [remarks, setRemarks] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const focusRemarks = useCallback(() => {
    bodyRef.current?.querySelector<HTMLInputElement>(`#${REMARKS_ID}`)?.focus();
  }, []);

  // The remark is what the operator came to type.
  useEffect(() => {
    const timer = window.setTimeout(focusRemarks, 0);
    return () => window.clearTimeout(timer);
  }, [focusRemarks]);

  const save = useCallback(async () => {
    if (saving) {
      return;
    }
    const outcome = buildFollowUpBody({ row, originalPromise, promiseDate, remarks });
    if (!outcome.ok) {
      toast.warning(outcome.message);
      focusRemarks();
      return;
    }
    try {
      await followUp(outcome.body).unwrap();
      toast.success("Follow-up recorded.");
      onSaved();
    } catch (error) {
      toast.error(describeServerError(error, "The follow-up could not be recorded."));
    }
  }, [focusRemarks, followUp, onSaved, originalPromise, promiseDate, remarks, row, saving]);

  // The popup rule: Enter moves on, no default button; the last field saves.
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.id === REMARKS_ID) {
        event.preventDefault();
        void save();
        return;
      }
      if (target instanceof HTMLInputElement) {
        event.preventDefault();
        focusRemarks();
      }
    },
    [focusRemarks, save],
  );

  return (
    <ModalShell
      title={`Follow-up — ${row.atc_name || "—"}`}
      isOpen
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div ref={bodyRef} onKeyDown={onKeyDown}>
        <p className={quotationStyles.modalNote}>{describeRow(row)}</p>
        <div className={quotationStyles.fieldGrid}>
          <DateField
            id="tc-followup-promise"
            label="Promised for"
            value={promiseDate}
            disabled={saving}
            onChange={setPromiseDate}
          />
          <TextField
            id={REMARKS_ID}
            label="Remark"
            value={remarks}
            required
            maxLength={REMARK_MAX_LENGTH}
            placeholder="called, will pay Monday"
            disabled={saving}
            onChange={setRemarks}
          />
        </div>
      </div>
    </ModalShell>
  );
}
