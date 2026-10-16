"use client";

/**
 * Decide variance — Qt `TillVarianceDecideDialog`: the approver's decision on
 * a PENDING_APPROVAL session, opened from the Session Cockpit's Approve.
 * APPROVE with a treatment and a reason, or RECOUNT; a note always, the till
 * PIN when the rule asks for it. What it decides is `variance-decide.ts`; a
 * refusal is said in plain words beside the form, the server's sentence grey
 * beneath (Qt ec9d92d), and the control it is about takes the focus.
 *
 * Bag mode (`request.bag`, notes 113): a received bag's difference — APPROVE
 * only (no Recount), the bag named in the Event fact, its `tcmId` sent.
 *
 * Keys: Ctrl+Enter decides, Esc cancels.
 */
import { useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { tillErrorOf } from "../shared/errors";
import type { TillReason } from "../shared/reasons";
import { TillDialog } from "../shared/till-dialog";
import type { TillVarianceDecision } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import {
  BAG_DECIDE_HINT,
  DECIDE_HINT,
  decideAmount,
  decideBody,
  decideButtonLabel,
  decideEventText,
  decideProblem,
  decideRefusal,
  initialDecideForm,
  reasonOptions,
  treatmentOptions,
  type DecideForm,
  type DecideRequest,
} from "./variance-decide";

export type VarianceDecideDialogProps = {
  /** Open on this session's pending gap; null = closed. */
  request: DecideRequest | null;
  /** Grid 134 rows, every category: the dialog keeps the ones of its gap. */
  reasons: readonly TillReason[];
  onClose: () => void;
  /** The server took it. */
  onDecided: (decision: TillVarianceDecision) => void;
};

export function VarianceDecideDialog({ request, reasons, onClose, onDecided }: VarianceDecideDialogProps) {
  return request ? <DecideBody request={request} reasons={reasons} onClose={onClose} onDecided={onDecided} /> : null;
}

function DecideBody({ request, reasons, onClose, onDecided }: VarianceDecideDialogProps & { request: DecideRequest }) {
  const client = useTillSessionClient();
  const [form, setForm] = useState<DecideForm>(() => initialDecideForm(request.event));
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  /** Two Ctrl+Enters inside one render must not send two decisions. */
  const inFlight = useRef(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const treatmentRef = useRef<HTMLSelectElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);

  const approve = form.decision === "APPROVE";
  const problem = decideProblem(form);
  const canDecide = !problem && !busy;
  const amount = decideAmount(request.variancePaise);
  const treatments = treatmentOptions(request.event);
  const reasonList = reasonOptions(reasons, request.event);

  const patch = (next: Partial<DecideForm>) => setForm((current) => ({ ...current, ...next }));

  const decide = async () => {
    if (!canDecide || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      await client.decideVariance(decideBody(request.key, form, request.bag?.tcmId ?? ""));
      onDecided(form.decision);
    } catch (thrown) {
      const read = tillErrorOf(thrown, "The decision could not be recorded.");
      const refused = decideRefusal(read);
      setRefusal(read.refusal);
      if (refused.clearPin) patch({ pin: "" });
      // The fields stay enabled while the request is out (only the button
      // waits, as in Qt), so the control the refusal is about takes the focus now.
      const target = refused.focus === "pin" ? pinRef : refused.focus === "treatment" ? treatmentRef : refused.focus === "reason" ? reasonRef : null;
      target?.current?.focus();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <TillDialog
      open
      size="narrow"
      busy={busy}
      title="Decide variance"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void decide();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canDecide}
            title={problem}
            onClick={() => void decide()}
          >
            {decideButtonLabel(form.decision)}
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
        </>
      }
    >
      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.cap}>Event</span>
          <span className={styles.code}>{decideEventText(request)}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Variance</span>
          <span className={cx(styles.figure, amount.tone === "danger" ? styles.toneRed : styles.toneAmber)}>{amount.text}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Session</span>
          <span className={styles.val} title={request.sessionNo}>
            {request.sessionNo}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Cashier</span>
          <span className={styles.val} title={request.cashier}>
            {request.cashier}
          </span>
        </div>
      </div>

      <div className={styles.formGrid}>
        <span className={styles.formLabel}>Decision</span>
        <div className={styles.radioRow} role="radiogroup" aria-label="Decision">
          {(
            [
              ["APPROVE", "Approve"],
              ["RECOUNT", "Recount"],
            ] as const
          )
            // A bag's difference: the receiver's count stands — no recount.
            .filter(([value]) => !request.bag || value === "APPROVE")
            .map(([value, label]) => (
              <label key={value} className={styles.radio}>
                <input
                  type="radio"
                  name="till-decide-decision"
                  checked={form.decision === value}
                  autoFocus={value === "APPROVE"}
                  onChange={() => patch({ decision: value })}
                />
                {label}
              </label>
            ))}
        </div>

        <label className={cx(styles.formLabel, !approve && styles.toneMuted)} htmlFor="till-decide-treatment">
          Treatment
        </label>
        <select
          id="till-decide-treatment"
          ref={treatmentRef}
          className={styles.select}
          value={form.treatment}
          disabled={!approve}
          onChange={(event) => patch({ treatment: event.target.value as DecideForm["treatment"] })}
        >
          {treatments.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={cx(styles.formLabel, !approve && styles.toneMuted)} htmlFor="till-decide-reason">
          Reason
        </label>
        <select
          id="till-decide-reason"
          ref={reasonRef}
          className={styles.select}
          value={form.reasonId}
          disabled={!approve}
          onChange={(event) => patch({ reasonId: event.target.value })}
        >
          {reasonList.map((option) => (
            <option key={option.value || "none"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.formLabel} htmlFor="till-decide-note">
          Note
        </label>
        <input
          id="till-decide-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder="what you found — required"
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-decide-pin">
          Your till PIN
        </label>
        <input
          id="till-decide-pin"
          ref={pinRef}
          type="password"
          className={styles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          placeholder="when the rule asks for it at the counter"
          value={form.pin}
          onChange={(event) => patch({ pin: event.target.value })}
        />
      </div>

      <p className={styles.muted}>{request.bag ? BAG_DECIDE_HINT : DECIDE_HINT}</p>
      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
