"use client";
/**
 * The Members tab's dialogs — Qt `LoyaltyMemberStatusDialog` (Suspend…),
 * `LoyaltyAdjustDialog` (Adjust points…, Ctrl+J) and the Ctrl+H status
 * trail (`showHistory`). The wording and the enable rules live in
 * `view/actions.ts`; the screen posts.
 */
import { useEffect, useRef, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { confirm } from "@/lib/confirm";
import { dateTime12Of } from "@/lib/time-format";
import styles from "../page.module.scss";
import {
  adjustIntro,
  adjustState,
  cleanPoints,
  needsWriteOff,
  REASON_MAX,
  statusChoices,
  statusIntro,
  statusState,
  writeOffQuestion,
} from "../view/actions";
import type { HistoryStep, SettableStatus } from "../wire/types";

function useFocusOnOpen(id: string) {
  useEffect(() => {
    const timer = window.setTimeout(() => document.getElementById(id)?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [id]);
}

/* ------------------------------------------------------------- status */

export function MemberStatusDialog({
  customer,
  current,
  balance,
  busy,
  onCancel,
  onApply,
}: {
  customer: string;
  current: string;
  balance: number;
  busy: boolean;
  onCancel: () => void;
  onApply: (input: { status: SettableStatus; reason: string; force: boolean }) => void;
}) {
  const choices = statusChoices(current);
  const [status, setStatus] = useState<SettableStatus>(choices[0] ?? "SUSPENDED");
  const [reason, setReason] = useState("");
  const state = statusState(status, reason, balance);
  const asking = useRef(false);
  useFocusOnOpen("ls-status-new");

  const apply = async () => {
    if (!state.canApply || busy || asking.current) return;
    let force = false;
    if (needsWriteOff(status, balance)) {
      // The server refuses this without force; ask here, once, in words.
      asking.current = true;
      const ok = await confirm({
        title: "Write off and close",
        message: writeOffQuestion(balance),
        confirmLabel: "Continue",
        iconVariant: "replace",
      });
      asking.current = false;
      if (!ok) return;
      force = true;
    }
    onApply({ status, reason, force });
  };

  return (
    <ModalShell
      title={`Member status — ${customer}`}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <>
          <span className={styles.footerSpacer} />
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.primaryButton} disabled={!state.canApply || busy} onClick={() => void apply()}>
            Apply
          </button>
        </>
      }
    >
      <form
        className={styles.dialogBody}
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        <p className={styles.dialogMuted}>{statusIntro(current, balance)}</p>
        <div className={styles.statusForm}>
          <label className={styles.fieldLabel} htmlFor="ls-status-new">
            New status
          </label>
          <select
            id="ls-status-new"
            className={styles.select}
            value={status}
            onChange={(e) => setStatus(e.target.value as SettableStatus)}
          >
            {choices.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className={styles.fieldLabel} htmlFor="ls-status-reason">
            Reason
          </label>
          <input
            id="ls-status-reason"
            className={styles.input}
            maxLength={REASON_MAX}
            placeholder="Required to suspend or close"
            autoComplete="off"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <p className={styles.dialogMuted}>{state.note || " "}</p>
      </form>
    </ModalShell>
  );
}

/* ------------------------------------------------------------- adjust */

export function AdjustPointsDialog({
  customer,
  balance,
  redeemable,
  approverName,
  busy,
  onCancel,
  onApply,
}: {
  customer: string;
  balance: number;
  redeemable: number;
  approverName: string;
  busy: boolean;
  onCancel: () => void;
  onApply: (input: { points: number; reason: string }) => void;
}) {
  const [pointsText, setPointsText] = useState("");
  const [reason, setReason] = useState("");
  const state = adjustState(pointsText, reason, balance, redeemable);
  useFocusOnOpen("ls-adjust-points");

  const apply = () => {
    if (!state.canApply || busy) return;
    onApply({ points: state.points, reason });
  };

  return (
    <ModalShell
      title={`Adjust points — ${customer}`}
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <>
          <span className={styles.footerSpacer} />
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.primaryButton} disabled={!state.canApply || busy} onClick={apply}>
            Adjust
          </button>
        </>
      }
    >
      <form
        className={styles.dialogBody}
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <p className={styles.dialogMuted}>{adjustIntro(balance, redeemable)}</p>
        <div className={styles.statusForm}>
          <label className={styles.fieldLabel} htmlFor="ls-adjust-points">
            Points
          </label>
          <input
            id="ls-adjust-points"
            className={styles.input}
            placeholder="+50 or -50"
            inputMode="numeric"
            autoComplete="off"
            value={pointsText}
            onChange={(e) => setPointsText(cleanPoints(e.target.value))}
          />
          <label className={styles.fieldLabel} htmlFor="ls-adjust-reason">
            Reason
          </label>
          <input
            id="ls-adjust-reason"
            className={styles.input}
            maxLength={REASON_MAX}
            placeholder="Why — goodwill, correction, …"
            autoComplete="off"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <span className={styles.fieldLabel}>Approved by</span>
          <span>{approverName}</span>
        </div>
        <p className={styles.dialogMuted}>{state.note}</p>
      </form>
    </ModalShell>
  );
}

/* ------------------------------------------------------------ history */

export function MemberHistoryDialog({
  name,
  steps,
  onClose,
}: {
  name: string;
  steps: readonly HistoryStep[];
  onClose: () => void;
}) {
  return (
    <ModalShell
      title={`Status history — ${name}`}
      isOpen
      onClose={onClose}
      footer={
        <>
          <span className={styles.footerSpacer} />
          <button type="button" className={styles.button} onClick={onClose} autoFocus>
            Close
          </button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <div className={styles.historyScroll}>
          <table className={styles.historyTable}>
            <thead>
              <tr>
                <th>When</th>
                <th>From</th>
                <th>To</th>
                <th>By</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => (
                <tr key={`${s.seqNo}-${i}`}>
                  <td>{dateTime12Of(s.changedOn)}</td>
                  <td>{s.fromStatus ?? ""}</td>
                  <td>{s.toStatus ?? ""}</td>
                  <td>{s.changedByName ?? ""}</td>
                  <td>{s.remarks ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {steps.length === 0 ? <p className={styles.dialogMuted}>No status change recorded for this member.</p> : null}
      </div>
    </ModalShell>
  );
}
