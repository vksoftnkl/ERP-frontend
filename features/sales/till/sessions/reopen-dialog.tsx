"use client";

/**
 * Reopen — Qt `TillReopenDialog` (c77f3f1, notes 117 §5): a CLOSED session
 * back to COUNTING, opened from the Session Cockpit's Reopen. A REOPEN
 * reason, a note when the reason asks for one, the caller's PIN. What it
 * decides is `reopen.ts`; the refusals (day closed, cash already approved,
 * blocked, the approver rules) are said in plain words, the server's sentence
 * grey beneath (Qt ec9d92d).
 *
 * Keys: Ctrl+Enter reopens, Esc cancels.
 */
import { useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { useTillSessionClient } from "../shared/api/till-session-api";
import type { TillReason } from "../shared/reasons";
import { TillDialog } from "../shared/till-dialog";
import type { TillSessionReopenResult } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import type { SessionDialogRequest } from "./force-close-dialog";
import { categoryReasons, noteNeeded, notePlaceholder, sessionFacts } from "./force-close";
import { dialogRefusal } from "./refusal";
import { EMPTY_REOPEN, REOPEN_HINT, reopenBody, reopenProblem, type ReopenForm } from "./reopen";

export type ReopenDialogProps = {
  request: SessionDialogRequest | null;
  /** Grid 134 rows, every category: the dialog keeps the live REOPEN ones. */
  reasons: readonly TillReason[];
  onClose: () => void;
  onReopened: (result: TillSessionReopenResult) => void;
};

export function ReopenDialog({ request, reasons, onClose, onReopened }: ReopenDialogProps) {
  return request ? <ReopenBody request={request} reasons={reasons} onClose={onClose} onReopened={onReopened} /> : null;
}

function ReopenBody({ request, reasons, onClose, onReopened }: ReopenDialogProps & { request: SessionDialogRequest }) {
  const client = useTillSessionClient();
  const [facts] = useState(() => sessionFacts(request.session));
  const [form, setForm] = useState<ReopenForm>(EMPTY_REOPEN);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  const inFlight = useRef(false);
  const pinRef = useRef<HTMLInputElement>(null);

  const needsNote = noteNeeded(reasons, form.reasonId);
  const problem = reopenProblem(form, needsNote);
  const canReopen = !problem && !busy;
  const patch = (next: Partial<ReopenForm>) => setForm((current) => ({ ...current, ...next }));

  const reopen = async () => {
    if (!canReopen || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      onReopened(await client.reopen(reopenBody(request.key, form)));
    } catch (thrown) {
      // TILL_DAY_CLOSED / TILL_CASH_ALREADY_APPROVED / TILL_REOPEN_BLOCKED and
      // the approver refusals: plain words, the server's sentence in grey.
      const refused = dialogRefusal(thrown, "The session could not be reopened.");
      setRefusal(refused.refusal);
      if (refused.pin) {
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
      title="Reopen the session"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void reopen();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button type="button" className={styles.primaryButton} disabled={!canReopen} title={problem} onClick={() => void reopen()}>
            Reopen - Ctrl+Enter
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
        </>
      }
    >
      <div className={styles.facts}>
        {(
          [
            ["Session", facts.sessionNo],
            ["Cashier", facts.cashier],
            ["Z no", facts.z],
          ] as const
        ).map(([caption, value]) => (
          <div key={caption} className={styles.fact}>
            <span className={styles.cap}>{caption}</span>
            <span className={styles.val} title={value}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor="till-reopen-reason">
          Reason
        </label>
        <select
          id="till-reopen-reason"
          className={styles.select}
          autoFocus
          value={form.reasonId}
          onChange={(event) => patch({ reasonId: event.target.value })}
        >
          {categoryReasons(reasons, "REOPEN").map((option) => (
            <option key={option.value || "none"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.formLabel} htmlFor="till-reopen-note">
          Note
        </label>
        <input
          id="till-reopen-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder={notePlaceholder(needsNote)}
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-reopen-pin">
          Your till PIN
        </label>
        <input
          id="till-reopen-pin"
          ref={pinRef}
          type="password"
          className={styles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          value={form.pin}
          onChange={(event) => patch({ pin: event.target.value })}
        />
      </div>

      <p className={styles.muted}>{REOPEN_HINT}</p>
      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
