"use client";

/**
 * Slip check — Qt `TillSlipCheckDialog`: one card terminal of a session whose
 * billing has ended, checked slip by slip because the machine total
 * disagreed. Opened from the Session Cockpit; Till Sessions (273) OVERRIDE,
 * never the session's own cashier before it closes (the server says so).
 * What it decides is `slip-check.ts`.
 */
import { useEffect, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { amountInputPaise, formatMoney, isAmountDraft } from "../shared/money";
import { TillDialog, TonePill } from "../shared/till-dialog";
import type { TillSessionKey, TillSlipCheckPayload } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import type { SlipTender } from "./cockpit";
import {
  SLIP_APPROVAL_NOTE,
  SLIP_RETENDER_TIP,
  SLIP_SUB,
  SLIP_VERB_NOTE,
  initialMarks,
  slipCheckBody,
  slipFacts,
  slipResult,
  type RowMarks,
  type SlipWithoutRow,
} from "./slip-check";

export type SlipCheckDialogProps = {
  sessionKey: TillSessionKey | null;
  tenders: readonly SlipTender[];
  onClose: () => void;
};

export function SlipCheckDialog({ sessionKey, tenders, onClose }: SlipCheckDialogProps) {
  return sessionKey ? <SlipCheckBody sessionKey={sessionKey} tenders={tenders} onClose={onClose} /> : null;
}

function SlipCheckBody({ sessionKey, tenders, onClose }: { sessionKey: TillSessionKey; tenders: readonly SlipTender[]; onClose: () => void }) {
  const client = useTillSessionClient();
  const [tenderId, setTenderId] = useState(tenders[0]?.tenderId ?? "");
  const [data, setData] = useState<TillSlipCheckPayload | null>(null);
  const [marks, setMarks] = useState<RowMarks[]>([]);
  const [slips, setSlips] = useState<SlipWithoutRow[]>([]);
  const [slipAmount, setSlipAmount] = useState("");
  const [slipAuth, setSlipAuth] = useState("");
  const [slipLast4, setSlipLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    if (!tenderId) return;
    let cancelled = false;
    client
      .slipCheckRows(sessionKey, tenderId)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setMarks(initialMarks(payload.rows ?? []));
        setSlips([]);
        setRecorded(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setData(null);
        setMarks([]);
        toast.apiError(error, { fallback: "The slip check could not be read." });
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionKey, tenderId]);

  const tenderName = tenders.find((t) => t.tenderId === tenderId)?.name ?? "";
  const facts = data ? slipFacts(data, tenderName) : null;
  const result = slipResult(data, marks, slips);
  const canRecord = !busy && !recorded && (data?.rows?.length ?? 0) > 0;

  const setMark = (index: number, patch: Partial<RowMarks>) =>
    setMarks((current) => current.map((mark, at) => (at === index ? { ...mark, ...patch } : mark)));

  const addSlip = () => {
    const amountPaise = amountInputPaise(slipAmount);
    if (amountPaise <= 0) return;
    setSlips((current) => [...current, { amountPaise, authCode: slipAuth, cardLast4: slipLast4 }]);
    setSlipAmount("");
    setSlipAuth("");
    setSlipLast4("");
  };

  const record = async () => {
    if (!canRecord) return;
    setBusy(true);
    try {
      const answer = await client.slipCheckRecord(slipCheckBody(sessionKey, tenderId, data, marks, slips));
      // One SLIP_CHECK event per check; reopen to check again.
      setRecorded(true);
      toast.success(
        `Recorded: ${answer.ticked} ticked · ${answer.noSlip} with no slip · ${answer.amountDiffers} amount(s) differ · ` +
          `${answer.slipsWithoutRow} slip(s) with no row.`,
      );
    } catch (error) {
      toast.apiError(error, { fallback: "The slip check could not be recorded." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TillDialog
      open
      size="wide"
      busy={busy}
      title={facts?.title ?? "Slip check"}
      onClose={onClose}
      footer={
        <>
          <p className={cx(styles.muted, styles.spacer)}>{SLIP_VERB_NOTE}</p>
          <button type="button" className={styles.primaryButton} disabled={!canRecord} onClick={() => void record()}>
            {result.recordLabel}
          </button>
          <button type="button" className={styles.secondaryButton} disabled title={SLIP_RETENDER_TIP}>
            Re-tender a bill…
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className={styles.muted}>{SLIP_SUB}</p>
      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.cap}>Terminal</span>
          <select className={styles.select} value={tenderId} autoFocus onChange={(event) => setTenderId(event.target.value)}>
            {tenders.map((t) => (
              <option key={t.tenderId} value={t.tenderId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Batch no</span>
          <span className={styles.val}>{facts?.batch ?? "—"}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Slips</span>
          <span className={styles.val}>{facts?.slips ?? "—"}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Expected</span>
          <span className={styles.val}>{facts?.expected ?? "—"}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Batch total</span>
          <span className={styles.val}>{facts?.batchTotal ?? "—"}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Short</span>
          <span className={cx(styles.val, facts?.shortDanger && styles.toneRed)}>{facts?.short ?? "—"}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Count line</span>
          <span className={styles.code}>{facts?.countLine ?? ""}</span>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Bill</th>
              <th scope="col">Kind</th>
              <th scope="col" className={styles.right}>
                Amount
              </th>
              <th scope="col">Auth · last4 (keyed)</th>
              <th scope="col" className={styles.center}>
                Slip?
              </th>
              <th scope="col" className={styles.center}>
                Amount differs
              </th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => (
              <tr key={row.key} className={cx(row.tinted && styles.tintRow)}>
                <td>{row.time}</td>
                <td>{row.bill}</td>
                <td className={cx(row.kind === "REFUND" && styles.toneAmber)}>{row.kind}</td>
                <td className={styles.right}>{row.amount}</td>
                <td>{row.auth}</td>
                <td className={styles.center}>
                  <input
                    type="checkbox"
                    aria-label="Slip found"
                    checked={marks[index]?.slip ?? true}
                    disabled={busy}
                    onChange={(event) => setMark(index, { slip: event.target.checked })}
                  />
                </td>
                <td className={styles.center}>
                  <input
                    type="checkbox"
                    aria-label="Amount differs"
                    checked={marks[index]?.differs ?? false}
                    disabled={busy || !row.differsEnabled}
                    onChange={(event) => setMark(index, { differs: event.target.checked })}
                  />
                </td>
                <td className={cx(row.tone === "red" && styles.toneRed, row.tone === "amber" && styles.toneAmber, row.tone === "green" && styles.toneGreen)}>
                  {row.result}
                </td>
              </tr>
            ))}
            {result.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyCell}>
                  {data ? "No live row of this terminal in the session." : "Loading…"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={styles.inlineRow} data-uppercase="off">
        <span className={styles.strong}>Slips with no bill:</span>
        <span className={styles.val}>{result.noRowCount}</span>
        <label className={styles.formLabel} htmlFor="till-slip-amount">
          amount
        </label>
        <input
          id="till-slip-amount"
          className={cx(styles.input, styles.number)}
          style={{ width: 110 }}
          inputMode="decimal"
          autoComplete="off"
          value={slipAmount}
          onChange={(event) => {
            const text = event.target.value.trim();
            if (isAmountDraft(text)) setSlipAmount(text);
          }}
        />
        <label className={styles.formLabel} htmlFor="till-slip-auth">
          auth
        </label>
        <input
          id="till-slip-auth"
          className={styles.input}
          style={{ width: 110 }}
          maxLength={20}
          autoComplete="off"
          value={slipAuth}
          onChange={(event) => setSlipAuth(event.target.value)}
        />
        <label className={styles.formLabel} htmlFor="till-slip-last4">
          last 4
        </label>
        <input
          id="till-slip-last4"
          className={styles.input}
          style={{ width: 70 }}
          maxLength={4}
          inputMode="numeric"
          autoComplete="off"
          value={slipLast4}
          onChange={(event) => {
            const text = event.target.value.trim();
            if (/^\d{0,4}$/.test(text)) setSlipLast4(text);
          }}
        />
        <button type="button" className={styles.secondaryButton} disabled={busy || amountInputPaise(slipAmount) <= 0} onClick={addSlip}>
          + add slip
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={busy || slips.length === 0}
          onClick={() => setSlips((current) => current.slice(0, -1))}
        >
          remove last
        </button>
        <span className={styles.muted}>a slip with no row = a bill keyed as another tender → re-tender it to card</span>
      </div>
      {slips.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={styles.right}>
                Slip amount
              </th>
              <th scope="col">Auth</th>
              <th scope="col">Last 4</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((slip, index) => (
              <tr key={index}>
                <td className={styles.right}>{formatMoney(slip.amountPaise)}</td>
                <td>{slip.authCode}</td>
                <td>{slip.cardLast4}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.card}>
          <span className={styles.strong}>Result of the check</span>
          <div className={styles.formGrid}>
            <span className={styles.cap}>Explained by re-tender</span>
            <span className={styles.val}>{result.explained}</span>
            <span className={styles.cap}>Left unexplained</span>
            <span className={cx(styles.val, result.unexplainedDanger && styles.toneRed)}>{result.unexplained}</span>
            <span className={styles.cap}>Treatment</span>
            <span className={styles.muted}>{result.treatment}</span>
            <span className={styles.cap}>Later</span>
            <span className={styles.muted}>{result.later}</span>
          </div>
        </div>
        {result.approval ? (
          <div className={styles.band} style={{ flex: "1 1 0" }}>
            <div className={styles.bandRow}>
              <TonePill tone="amber">APPROVAL</TonePill>
              <span className={styles.code}>NONCASH_VARIANCE</span>
              <span className={styles.spacer}>{result.approval.text}</span>
              <span className={styles.figure}>{result.approval.amount}</span>
            </div>
            <p className={styles.muted}>{SLIP_APPROVAL_NOTE}</p>
          </div>
        ) : null}
      </div>
    </TillDialog>
  );
}
