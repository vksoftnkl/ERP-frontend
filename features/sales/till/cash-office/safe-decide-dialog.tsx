"use client";

/**
 * Decide the safe difference — Qt `TillSafeDecideDialog` (ec9d92d): a safe
 * gap still PENDING (a safe count's, or a CIT remittance the bank credited
 * otherwise), decided from the Cash Office's Decide. Two-person as shipped:
 * the caller's PIN, then a second person picks their name and types theirs.
 * What it decides is `safe-decide.ts`; grant, limit, PIN and the second
 * signature are the server's calls — its refusal in plain words, its
 * sentence grey under them, and the PIN it names typed again from empty.
 *
 * Keys: Enter walks the fields, Ctrl+Enter decides, Esc cancels.
 */
import { useMemo, useRef, useState } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { tillErrorOf } from "../shared/errors";
import type { TillReason } from "../shared/reasons";
import { TillDialog } from "../shared/till-dialog";
import type { TillSafeGapTreatment } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { walkOnEnter } from "./enter-walk";
import {
  EMPTY_SAFE_DECIDE,
  SAFE_DECIDE_HINT,
  SAFE_TREATMENTS,
  gapDifference,
  gapFromText,
  safeDecideBody,
  safeDecideProblem,
  safeDecideReasons,
  safeDecideRefusalTarget,
  type SafeDecideForm,
  type SafeDecideRequest,
} from "./safe-decide";

export type SafeDecideDialogProps = {
  request: SafeDecideRequest | null;
  /** Grid 134 rows, every category: the dialog keeps the live VARIANCE ones. */
  reasons: readonly TillReason[];
  onClose: () => void;
  onDecided: () => void;
};

export function SafeDecideDialog({ request, reasons, onClose, onDecided }: SafeDecideDialogProps) {
  return request ? <SafeDecideBody request={request} reasons={reasons} onClose={onClose} onDecided={onDecided} /> : null;
}

const PIN_ID = "till-safe-decide-pin";
const SECOND_ID = "till-safe-decide-second";
const SECOND_PIN_ID = "till-safe-decide-second-pin";

function SafeDecideBody({ request, reasons, onClose, onDecided }: SafeDecideDialogProps & { request: SafeDecideRequest }) {
  const client = useTillSessionClient();
  const userDropdownId = useDropdownId("tillApproverUser");
  const userParams = useMemo(() => ({ icompany_id: request.scope.companyId }), [request.scope.companyId]);
  const [form, setForm] = useState<SafeDecideForm>(EMPTY_SAFE_DECIDE);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  /** Two Ctrl+Enters inside one render must not send two decisions. */
  const inFlight = useRef(false);

  const problem = safeDecideProblem(form);
  const canDecide = !problem && !busy;
  const difference = gapDifference(request.gap);
  const reasonOptions = safeDecideReasons(reasons);
  const patch = (next: Partial<SafeDecideForm>) => setForm((current) => ({ ...current, ...next }));

  const decide = async () => {
    if (!canDecide || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      await client.safeDecideVariance(safeDecideBody(request, form));
      onDecided();
    } catch (thrown) {
      const read = tillErrorOf(thrown, "The difference could not be decided.");
      setRefusal(read.refusal);
      // The fields stay enabled while the request is out (only the button
      // waits, as in Qt), so the PIN the refusal names takes the focus now.
      const target = safeDecideRefusalTarget(read);
      if (target === "second") {
        patch({ secondPin: "" });
        // No one picked yet (TILL_APPROVER_SECOND): the picker, not its disabled PIN box.
        document.getElementById(form.second?.id ? SECOND_PIN_ID : SECOND_ID)?.focus();
      } else if (target === "pin") {
        patch({ pin: "" });
        document.getElementById(PIN_ID)?.focus();
      }
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
      title="Decide the safe difference"
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
          <button type="button" className={styles.primaryButton} disabled={!canDecide} title={problem} onClick={() => void decide()}>
            Decide - Ctrl+Enter
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
        </>
      }
    >
      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.cap}>Safe</span>
          <span className={styles.val} title={request.safeName}>
            {request.safeName || "—"}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>From</span>
          <span className={styles.val}>{gapFromText(request.gap)}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Difference</span>
          <span className={cx(styles.figure, difference.short ? styles.toneRed : styles.toneAmber)}>{difference.text}</span>
        </div>
      </div>

      <div className={styles.formGrid} onKeyDown={walkOnEnter}>
        <label className={styles.formLabel} htmlFor="till-safe-decide-treatment">
          Book it as
        </label>
        <select
          id="till-safe-decide-treatment"
          className={styles.select}
          autoFocus
          value={form.treatment}
          onChange={(event) => patch({ treatment: event.target.value as TillSafeGapTreatment })}
        >
          {SAFE_TREATMENTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.formLabel} htmlFor="till-safe-decide-reason">
          Reason
        </label>
        <select
          id="till-safe-decide-reason"
          className={styles.select}
          value={form.reasonId}
          onChange={(event) => patch({ reasonId: event.target.value })}
        >
          {reasonOptions.map((option) => (
            <option key={option.value || "none"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.formLabel} htmlFor="till-safe-decide-note">
          Note
        </label>
        <input
          id="till-safe-decide-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder="optional"
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor={PIN_ID}>
          Your till PIN
        </label>
        <input
          id={PIN_ID}
          type="password"
          className={styles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          value={form.pin}
          onChange={(event) => patch({ pin: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor={SECOND_ID}>
          Second person
        </label>
        <NexDropdownSingle
          id={SECOND_ID}
          dropdownId={userDropdownId}
          params={userParams}
          clearOnParamsChange={false}
          value={form.second}
          onChange={(second) => patch({ second, secondPin: second?.id === form.second?.id ? form.secondPin : "" })}
          placeholder="Who signs with you"
          aria-label="Second person"
          className={styles.dropdown}
        />

        <label className={styles.formLabel} htmlFor={SECOND_PIN_ID}>
          Their till PIN
        </label>
        <input
          id={SECOND_PIN_ID}
          type="password"
          className={styles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          disabled={!form.second?.id}
          value={form.secondPin}
          onChange={(event) => patch({ secondPin: event.target.value })}
        />
      </div>

      <p className={styles.muted}>{SAFE_DECIDE_HINT}</p>
      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
