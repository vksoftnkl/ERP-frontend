"use client";

/**
 * Force close — Qt `TillForceCloseDialog` (c77f3f1, notes 117 §4): a
 * supervisor counts the drawer and closes a session whose cashier has gone
 * (OPEN, SUSPENDED or COUNTING), opened from the Session Cockpit's Force
 * close… and from Open Till's Supervisor: force close… on another cashier's
 * session at this device (Qt 1d3e203). The count is End Shift's (`../session/denom-count.tsx`); what the
 * dialog decides is `force-close.ts`.
 *
 * Keys: Ctrl+Enter force-closes, Esc cancels.
 */
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { EMPTY_COUNT, countLines, countedPaise, toDenominations, type DenomCountValue, type Denomination } from "../shared/denom";
import { formatMoney } from "../shared/money";
import type { TillReason } from "../shared/reasons";
import { TillDialog } from "../shared/till-dialog";
import type { TillForceCloseResult, TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { DenomCount } from "../session/denom-count";
import {
  EMPTY_FORCE_CLOSE,
  FORCE_CLOSE_BLIND_TEXT,
  categoryReasons,
  forceCloseBody,
  forceCloseHint,
  forceCloseProblem,
  noteNeeded,
  notePlaceholder,
  sessionFacts,
  type ForceCloseForm,
  type SessionFactsSource,
} from "./force-close";
import { dialogRefusal } from "./refusal";
import local from "./sessions.module.scss";

export type SessionDialogRequest = { key: TillSessionKey; session: TillSessionPayload };

/** Force close reads only the facts card off the session, so Open Till's open-check session will do. */
export type ForceCloseRequest = { key: TillSessionKey; session: SessionFactsSource };

export type ForceCloseDialogProps = {
  request: ForceCloseRequest | null;
  /** Grid 134 rows, every category: the dialog keeps the live FORCE_CLOSE ones. */
  reasons: readonly TillReason[];
  onClose: () => void;
  onForceClosed: (result: TillForceCloseResult) => void;
};

const ID_PREFIX = "till-force";

export function ForceCloseDialog({ request, reasons, onClose, onForceClosed }: ForceCloseDialogProps) {
  return request ? <ForceCloseBody request={request} reasons={reasons} onClose={onClose} onForceClosed={onForceClosed} /> : null;
}

function ForceCloseBody({ request, reasons, onClose, onForceClosed }: ForceCloseDialogProps & { request: ForceCloseRequest }) {
  const client = useTillSessionClient();
  const [facts] = useState(() => sessionFacts(request.session));
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [denomsLoading, setDenomsLoading] = useState(true);
  const [count, setCount] = useState<DenomCountValue>(EMPTY_COUNT);
  const [form, setForm] = useState<ForceCloseForm>(EMPTY_FORCE_CLOSE);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  const inFlight = useRef(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .denominations(request.key.companyId)
      .then((rows) => {
        if (!cancelled) setDenominations(toDenominations(rows));
      })
      .catch((failure) => {
        if (!cancelled) toast.apiError(failure, { fallback: "The denominations could not be read." });
      })
      .finally(() => {
        if (!cancelled) setDenomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, request.key.companyId]);

  const counted = countedPaise(denominations, count);
  const needsNote = noteNeeded(reasons, form.reasonId);
  const problem = forceCloseProblem(form, needsNote);
  const canClose = !problem && !busy;
  const patch = (next: Partial<ForceCloseForm>) => setForm((current) => ({ ...current, ...next }));

  const forceClose = async () => {
    if (!canClose || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      const result = await client.forceClose(forceCloseBody(request.key, form, countLines(denominations, count)));
      onForceClosed(result);
    } catch (thrown) {
      // Who may (grant, PIN, cashier) is the server's call: its refusal in
      // plain words, its sentence in grey.
      const refused = dialogRefusal(thrown, "The session could not be force-closed.");
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
      busy={busy}
      title="Force close the session"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void forceClose();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button type="button" className={styles.dangerButton} disabled={!canClose} title={problem} onClick={() => void forceClose()}>
            Force close - Ctrl+Enter
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
            ["Counter", facts.counter],
            ["Status", facts.status],
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
      <p className={styles.muted}>{FORCE_CLOSE_BLIND_TEXT}</p>

      <DenomCount
        idPrefix={ID_PREFIX}
        denominations={denominations}
        loading={denomsLoading}
        value={count}
        onChange={setCount}
        disabled={busy}
        autoFocusFirst
        onDone={() => reasonRef.current?.focus()}
      />
      <div className={local.countedRow}>
        <span className={styles.cap}>Counted</span>
        <span className={styles.figure}>{formatMoney(counted)}</span>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor="till-force-reason">
          Reason
        </label>
        <select
          id="till-force-reason"
          ref={reasonRef}
          className={styles.select}
          value={form.reasonId}
          onChange={(event) => patch({ reasonId: event.target.value })}
        >
          {categoryReasons(reasons, "FORCE_CLOSE").map((option) => (
            <option key={option.value || "none"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.formLabel} htmlFor="till-force-note">
          Note
        </label>
        <input
          id="till-force-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder={notePlaceholder(needsNote)}
          value={form.note}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-force-pin">
          Your till PIN
        </label>
        <input
          id="till-force-pin"
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

      <p className={cx(styles.muted, local.hint)}>{forceCloseHint(counted)}</p>
      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
