"use client";

/**
 * Approve Cash — Qt `TillApproveCashDialog` (c77f3f1, notes 114): a
 * supervisor takes a CLOSED session's hand-over and drops into the safe,
 * opened from the Session Cockpit's Approve Cash. What it decides is
 * `approve-cash.ts`.
 *
 * The amount handed over is shown; Received starts at it, so an exact one is
 * PIN + Ctrl+Enter. Beyond tolerance the treatment picker appears ("Send to
 * another approver" or decide it now), the reason only once a treatment is
 * chosen. A refusal is the server's own sentence under the form.
 *
 * Keys: Ctrl+Enter approves, Esc cancels.
 */
import { useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { formatMoney, isAmountDraft } from "../shared/money";
import type { TillReason } from "../shared/reasons";
import { selectOnFocus } from "../shared/select-on-focus";
import { TillDialog } from "../shared/till-dialog";
import type { TillCashApprovalResult, TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import {
  approveCashBody,
  approveCashFacts,
  approveCashReasons,
  approveCashState,
  approveCashTreatments,
  initialApproveCashForm,
  partsLine,
  type ApproveCashForm,
} from "./approve-cash";
import { dialogRefusal } from "./refusal";
import local from "./sessions.module.scss";

export type ApproveCashRequest = { key: TillSessionKey; session: TillSessionPayload };

export type ApproveCashDialogProps = {
  /** The cockpit's key and payload; null = closed. */
  request: ApproveCashRequest | null;
  /** Grid 134 rows, every category: the dialog keeps the live VARIANCE ones. */
  reasons: readonly TillReason[];
  onClose: () => void;
  /** The server took it: its answer. */
  onApproved: (result: TillCashApprovalResult) => void;
};

export function ApproveCashDialog({ request, reasons, onClose, onApproved }: ApproveCashDialogProps) {
  return request ? <ApproveCashBody request={request} reasons={reasons} onClose={onClose} onApproved={onApproved} /> : null;
}

function ApproveCashBody({ request, reasons, onClose, onApproved }: ApproveCashDialogProps & { request: ApproveCashRequest }) {
  const client = useTillSessionClient();
  const [facts] = useState(() => approveCashFacts(request.session));
  const [form, setForm] = useState<ApproveCashForm>(() => initialApproveCashForm(facts));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Two Ctrl+Enters inside one render must not approve twice. */
  const inFlight = useRef(false);
  const pinRef = useRef<HTMLInputElement>(null);

  const state = approveCashState(facts, form);
  const canApprove = !state.problem && !busy;
  const parts = partsLine(facts);
  const patch = (next: Partial<ApproveCashForm>) => setForm((current) => ({ ...current, ...next }));

  const approve = async () => {
    if (!canApprove || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await client.approveCash(approveCashBody(request.key, facts, form));
      onApproved(result);
    } catch (thrown) {
      // The server's own sentence: who may approve (cashier, PIN, limit) is its call.
      const refusal = dialogRefusal(thrown, "The cash could not be approved.");
      setError(refusal.line);
      if (refusal.pin) {
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
      title="Approve the session's cash"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void approve();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canApprove}
            title={state.problem}
            onClick={() => void approve()}
          >
            Approve - Ctrl+Enter
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
        </>
      }
    >
      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.cap}>Session</span>
          <span className={styles.val} title={facts.sessionNo}>
            {facts.sessionNo}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Cashier</span>
          <span className={styles.val} title={facts.cashier}>
            {facts.cashier}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Handed over</span>
          <span className={styles.figure}>{formatMoney(facts.handedPaise)}</span>
        </div>
      </div>
      {parts ? <p className={styles.muted}>{parts}</p> : null}

      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor="till-approve-cash-received">
          Received
        </label>
        <div className={local.receivedRow}>
          <input
            id="till-approve-cash-received"
            className={cx(styles.input, local.receivedInput)}
            inputMode="decimal"
            autoComplete="off"
            value={form.received}
            onFocus={selectOnFocus}
            onChange={(event) => {
              const text = event.target.value.trim();
              if (isAmountDraft(text)) patch({ received: text });
            }}
          />
          <span
            className={cx(
              styles.strong,
              state.differenceTone === "success" && styles.toneGreen,
              state.differenceTone === "danger" && styles.toneRed,
              state.differenceTone === "warning" && styles.toneAmber,
            )}
          >
            {state.differenceText}
          </span>
        </div>

        {state.showTreatment ? (
          <>
            <label className={styles.formLabel} htmlFor="till-approve-cash-treatment">
              Difference
            </label>
            <select
              id="till-approve-cash-treatment"
              className={styles.select}
              value={form.treatment}
              onChange={(event) => patch({ treatment: event.target.value as ApproveCashForm["treatment"] })}
            >
              {approveCashTreatments().map((option) => (
                <option key={option.value || "send"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        ) : null}

        {state.showReason ? (
          <>
            <label className={styles.formLabel} htmlFor="till-approve-cash-reason">
              Reason
            </label>
            <select
              id="till-approve-cash-reason"
              className={styles.select}
              value={form.reasonId}
              onChange={(event) => patch({ reasonId: event.target.value })}
            >
              {approveCashReasons(reasons).map((option) => (
                <option key={option.value || "none"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className={styles.formLabel} htmlFor="till-approve-cash-note">
          Note
        </label>
        <input
          id="till-approve-cash-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder="optional"
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-approve-cash-pin">
          Your till PIN
        </label>
        <input
          id="till-approve-cash-pin"
          ref={pinRef}
          type="password"
          className={styles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          // Qt puts the focus here: an exact hand-over is PIN + Ctrl+Enter.
          autoFocus
          value={form.pin}
          onChange={(event) => patch({ pin: event.target.value })}
        />
      </div>

      <p className={cx(styles.muted, local.hint)}>{state.hint}</p>
      {error ? <p className={cx(styles.warn, styles.warnDanger)}>{error}</p> : null}
    </TillDialog>
  );
}
