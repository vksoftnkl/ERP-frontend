"use client";

/**
 * Reopen day — Qt `TillDayReopenDialog` (c77f3f1, notes 117) on a CLOSED day:
 * `POST /till/days/reopen { reasonId (DAY_REOPEN), approverPin, notes }`. The
 * caller approves under the DAY_REOPEN rule (AREA_MANAGER) with their own
 * PIN — never the one who closed the day. Refused while a later business day
 * is closed (TILL_DAY_LATER_CLOSED). The store Z is kept for the re-close.
 *
 * Keys: Ctrl+Enter reopens, Esc cancels.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { TillDialog } from "../../shared/till-dialog";
import tillStyles from "../../shared/till.module.scss";
import { useBusinessDayClient } from "../api/business-day-api";
import {
  dayReasonParams,
  isPinRefusal,
  reasonChoices,
  reopenBody,
  reopenIntro,
  reopenProblem,
  type ReasonChoice,
  type ReopenDraft,
} from "../domain/day-close";
import { firstErrorOf, type DayKey } from "../domain/wire";

const ID = "bd-reopen";

export type DayReopenDialogProps = {
  dayKey: DayKey;
  /** "14-10-2026 · Z 3". */
  dayLabel: string;
  onClose: () => void;
  /** The server reopened the day. */
  onReopened: () => void;
};

const EMPTY_DRAFT: ReopenDraft = { reasonId: "", note: "", pin: "" };

export function DayReopenDialog({ dayKey, dayLabel, onClose, onReopened }: DayReopenDialogProps) {
  const client = useBusinessDayClient();
  const [reasons, setReasons] = useState<ReasonChoice[]>([]);
  const [draft, setDraft] = useState<ReopenDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const { companyId } = dayKey;

  useEffect(() => {
    let cancelled = false;
    // No reasons: the dialog says a reason is needed and Reopen waits (Qt swallows it too).
    client
      .gridRows("tillReasonList", null, dayReasonParams(companyId, "DAY_REOPEN"))
      .then((rows) => {
        if (!cancelled) setReasons(reasonChoices(rows));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, companyId]);

  const problem = reopenProblem(draft, reasons);
  const canReopen = !problem && !busy;
  const patch = (next: Partial<ReopenDraft>) => setDraft((value) => ({ ...value, ...next }));

  const submit = async () => {
    if (!canReopen || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await client.reopenDay(reopenBody(dayKey, draft));
      onReopened();
    } catch (thrown) {
      const refusal = firstErrorOf(thrown, "The business day could not be reopened.");
      setError(refusal.message);
      if (isPinRefusal(refusal)) {
        patch({ pin: "" });
        pinRef.current?.focus();
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
      title="Reopen the business day"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void submit();
        }
      }}
      footer={
        <>
          <span className={tillStyles.spacer} />
          <button
            type="button"
            className={tillStyles.dangerButton}
            disabled={!canReopen}
            title={problem || undefined}
            onClick={() => void submit()}
          >
            {busy ? "Reopening…" : "Reopen - Ctrl+Enter"}
          </button>
          <button type="button" className={tillStyles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
        </>
      }
    >
      <p className={tillStyles.muted}>{reopenIntro(dayLabel)}</p>

      <div className={tillStyles.formGrid}>
        <label className={tillStyles.formLabel} htmlFor={`${ID}-reason`}>
          Reason
        </label>
        <select
          id={`${ID}-reason`}
          className={tillStyles.select}
          value={draft.reasonId}
          autoFocus
          onChange={(event) => patch({ reasonId: event.target.value })}
        >
          <option value="">Pick a reason</option>
          {reasons.map((reason) => (
            <option key={reason.id} value={reason.id}>
              {reason.name}
            </option>
          ))}
        </select>

        <label className={tillStyles.formLabel} htmlFor={`${ID}-note`}>
          Note
        </label>
        <input
          id={`${ID}-note`}
          className={tillStyles.input}
          maxLength={500}
          autoComplete="off"
          placeholder="optional, unless the reason asks for one"
          value={draft.note}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={tillStyles.formLabel} htmlFor={`${ID}-pin`}>
          Your till PIN
        </label>
        <input
          id={`${ID}-pin`}
          ref={pinRef}
          type="password"
          className={tillStyles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          value={draft.pin}
          onChange={(event) => patch({ pin: event.target.value })}
        />
      </div>

      {error ? (
        <p className={cx(tillStyles.warn, tillStyles.warnDanger)} role="alert">
          {error}
        </p>
      ) : null}
    </TillDialog>
  );
}
