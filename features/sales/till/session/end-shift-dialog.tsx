"use client";

/**
 * End Shift (S4) — Qt `TillEndShiftDialog`, the cashier's blind close:
 * end billing → count cash → count slips → submit → (accepted) close.
 *
 * Opened from Open Till for this device's own session, and from the Sessions
 * list / cockpit on a COUNTING one (the cash office's count, or a supervisor
 * finishing a counter's). Esc after step 1 does NOT reopen billing: the
 * session stays COUNTING. What it decides is `end-shift.ts`.
 *
 * At the top, the supervisor's pickups / top-ups on the session (Qt
 * 2026-10-12): questioned before the drawer is counted, not after; re-read
 * with every reload.
 *
 * Keys: F10 submits the count, Esc goes back.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { EMPTY_COUNT, countLines, countedPaise, toDenominations, type DenomCountValue, type Denomination } from "../shared/denom";
import { tillErrorOf } from "../shared/errors";
import { formatMoney, isAmountDraft } from "../shared/money";
import { clearTillSession, getTillSession, patchTillSessionStatus } from "../shared/session-store";
import { TillDialog, TonePill } from "../shared/till-dialog";
import type { TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { DenomCount } from "./denom-count";
import { SupervisorMoves } from "./supervisor-moves";
import {
  APPROVAL_TEXT,
  END_BILLING_CONFIRM,
  acceptedText,
  attemptText,
  closeBody,
  closeConfirmText,
  countBody,
  countingOpen,
  endShiftProblem,
  endShiftView,
  floatLeftOf,
  floatLeftProblem,
  recountText,
  slipLineNote,
  slipLinesOf,
  slipsTotalPaise,
  stepStates,
  type EndShiftAnswer,
  type EndShiftView,
  type SlipLine,
} from "./end-shift";

export type EndShiftDialogProps = {
  /** The session; null = closed. */
  sessionKey: TillSessionKey | null;
  onClose: () => void;
  /** Billing ended, a count answered, the session closed — the caller re-reads. */
  onChanged?: () => void;
};

export function EndShiftDialog({ sessionKey, onClose, onChanged }: EndShiftDialogProps) {
  return sessionKey ? <EndShiftBody key={sessionKey.tssId} sessionKey={sessionKey} onClose={onClose} onChanged={onChanged} /> : null;
}

const ID_PREFIX = "till-end";

function EndShiftBody({ sessionKey, onClose, onChanged }: { sessionKey: TillSessionKey; onClose: () => void; onChanged?: () => void }) {
  const client = useTillSessionClient();
  const [session, setSession] = useState<TillSessionPayload | null>(null);
  const [view, setView] = useState<EndShiftView | null>(null);
  const [status, setStatus] = useState("");
  const [answer, setAnswer] = useState<EndShiftAnswer>("");
  const [answerText, setAnswerText] = useState("");
  const [slipCheck, setSlipCheck] = useState(false);
  const [attemptLabel, setAttemptLabel] = useState("");
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [denomsLoading, setDenomsLoading] = useState(true);
  const [count, setCount] = useState<DenomCountValue>(EMPTY_COUNT);
  const [slips, setSlips] = useState<SlipLine[]>([]);
  const [floatLeftText, setFloatLeftText] = useState("");
  const [busy, setBusy] = useState(false);
  /** Bumped by every reload: the supervisor's movements are re-read with the session (Qt reload). */
  const [movesTick, setMovesTick] = useState(0);
  const answerRef = useRef<EndShiftAnswer>("");

  const showOutcome = useCallback((outcome: EndShiftAnswer, attemptsLeft: number, slipGap: boolean) => {
    answerRef.current = outcome === "RECOUNT_REQUIRED" ? "" : outcome;
    setAnswer(outcome);
    if (outcome === "ACCEPTED") {
      // The close frame mounts with this answer; its Float left box takes the
      // focus (`autoFocus` — a rAF focus races the portal's late mount).
      setAnswerText(acceptedText(slipGap));
    } else if (outcome === "RECOUNT_REQUIRED") {
      // Every attempt is kept on the server; the boxes stay as counted.
      setAnswerText(recountText(attemptsLeft));
    } else if (outcome === "SENT_FOR_APPROVAL") {
      setAnswerText(APPROVAL_TEXT);
    }
  }, []);

  const showSession = useCallback(
    (payload: TillSessionPayload) => {
      const next = endShiftView(payload, answerRef.current);
      setSession(payload);
      setView(next);
      setStatus(next.status);
      setAttemptLabel(next.attemptText);
      // Keep what was typed on a line the session still has.
      setSlips((current) => {
        const typed = new Map(current.map((line) => [line.key, line]));
        return slipLinesOf(payload.tenders ?? []).map((line) => {
          const before = typed.get(line.key);
          return before ? { ...line, slips: before.slips, amount: before.amount, batch: before.batch } : line;
        });
      });
      if (next.answer && next.answer !== answerRef.current) {
        if (next.slipCheck) setSlipCheck(true);
        showOutcome(next.answer, -1, next.slipCheck);
      }
    },
    [showOutcome],
  );

  const reload = useCallback(async () => {
    setMovesTick((tick) => tick + 1);
    try {
      showSession(await client.get(sessionKey));
    } catch (error) {
      toast.error(tillErrorOf(error, "The session could not be read.").text);
    }
  }, [client, sessionKey, showSession]);

  useEffect(() => {
    let cancelled = false;
    client
      .get(sessionKey)
      .then((payload) => {
        if (!cancelled) showSession(payload);
      })
      .catch((error) => {
        if (!cancelled) toast.error(tillErrorOf(error, "The session could not be read.").text);
      });
    client
      .denominations(sessionKey.companyId)
      .then((rows) => {
        if (!cancelled) setDenominations(toDenominations(rows));
      })
      .catch((error) => {
        if (!cancelled) toast.error(tillErrorOf(error, "The denominations could not be read.").text);
      })
      .finally(() => {
        if (!cancelled) setDenomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionKey, showSession]);

  const cashPaise = countedPaise(denominations, count);
  const slipsPaise = slipsTotalPaise(slips);
  const outcome: EndShiftAnswer = answer === "RECOUNT_REQUIRED" ? "" : answer;
  const state = { status, outcome, cashOffice: view?.cashOffice ?? false, cashPaise, slipsPaise };
  const problem = endShiftProblem(state);
  const editable = countingOpen(state) && !busy;
  const steps = stepStates(status, answer);
  const blind = view?.blind ?? true;
  const floatLeft = floatLeftOf(floatLeftText);
  const floatProblem = floatLeftProblem(floatLeft, cashPaise);

  const endBilling = async () => {
    if (busy) return;
    if (!(await confirm({ title: "End billing", message: END_BILLING_CONFIRM, confirmLabel: "End billing", iconVariant: "replace" }))) {
      return;
    }
    setBusy(true);
    try {
      const payload = await client.endBilling(sessionKey);
      patchTillSessionStatus(sessionKey.tssId, "COUNTING");
      showSession(payload);
      onChanged?.();
    } catch (error) {
      toast.error(tillErrorOf(error, "Billing could not be ended.").text);
    } finally {
      setBusy(false);
    }
  };

  const submitCount = async () => {
    if (busy) return;
    if (problem) {
      toast.warn(problem);
      return;
    }
    setBusy(true);
    try {
      const result = await client.count(countBody(sessionKey, countLines(denominations, count), slips));
      if (result.tssStatus) {
        setStatus(result.tssStatus);
        patchTillSessionStatus(sessionKey.tssId, result.tssStatus);
      }
      setAttemptLabel(attemptText(blind, result.attemptNo, "answered"));
      setSlipCheck(Boolean(result.slipCheckRequired));
      showOutcome(result.outcome, result.attemptsLeft, Boolean(result.slipCheckRequired));
      onChanged?.();
    } catch (error) {
      const refusal = tillErrorOf(error, "The count could not be submitted.");
      if (refusal.code === "TILL_RECOUNT_LIMIT") {
        toast.warn(`No recount is left on this session: it needs a supervisor (${refusal.message}).`);
      } else {
        toast.error(refusal.text);
      }
      void reload();
    } finally {
      setBusy(false);
    }
  };

  const closeSession = async () => {
    if (busy) return;
    if (floatProblem) {
      toast.warn(floatProblem);
      return;
    }
    if (!(await confirm({ title: "Close session", message: closeConfirmText(floatLeft), confirmLabel: "Close session", iconVariant: "replace" }))) {
      return;
    }
    setBusy(true);
    try {
      const payload = await client.close(closeBody(sessionKey, floatLeft));
      if (getTillSession()?.id === sessionKey.tssId) clearTillSession(sessionKey.tssId);
      toast.success(`Session ${payload.tssSessionNo} closed — Z ${payload.tssZNo ?? ""}.`);
      onChanged?.();
      onClose();
    } catch (error) {
      toast.error(tillErrorOf(error, "The session could not be closed.").text);
      setBusy(false);
      void reload();
    }
  };

  const updateSlip = (key: string, patch: Partial<SlipLine>) =>
    setSlips((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const stepClass = (tone: "done" | "current" | "todo") =>
    cx(styles.step, tone === "done" && styles.stepDone, tone === "current" && styles.stepCurrent);

  return (
    <TillDialog
      open
      size="wide"
      busy={busy}
      title={view?.title ?? "End Shift"}
      headExtra={
        <>
          <span className={styles.muted}>{attemptLabel}</span>
          {status ? <TonePill tone={view?.statusTone ?? "amber"}>{status}</TonePill> : null}
        </>
      }
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "F10" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
          event.preventDefault();
          if (!problem && !busy) void submitCount();
        }
      }}
      footer={
        <>
          <p className={cx(styles.muted, styles.spacer)}>{view?.footNote ?? ""}</p>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            ←  Back
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy || problem !== ""}
            title={problem}
            onClick={() => void submitCount()}
          >
            F10  Submit count
          </button>
        </>
      }
    >
      <SupervisorMoves tssId={sessionKey.tssId} reloadKey={movesTick} />

      <div className={styles.steps}>
        {steps.labels.map((label, index) => (
          <span key={index} className={stepClass(steps.tones[index])}>
            {label}
          </span>
        ))}
      </div>

      <div className={styles.band}>
        <div className={styles.bandRow}>
          <TonePill tone={view?.step1Tone ?? "amber"}>STEP 1</TonePill>
          <span className={styles.spacer}>{view?.step1Text ?? "Reading the session…"}</span>
          <span className={styles.code}>{view?.countPlaceText ?? ""}</span>
          {view?.billing ? (
            <button type="button" className={styles.primaryButton} disabled={busy} autoFocus onClick={() => void endBilling()}>
              End billing now
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.card}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionCap}>STEP 2 · COUNT CASH</span>
            <span className={styles.code}>by denomination — expected is NOT shown</span>
          </div>
          <DenomCount
            idPrefix={ID_PREFIX}
            denominations={denominations}
            loading={denomsLoading}
            value={count}
            onChange={setCount}
            disabled={!editable}
            autoFocusFirst={status === "COUNTING" && !view?.billing}
          />
          <div className={styles.summary}>
            <div className={styles.fact}>
              <span className={styles.cap}>CASH COUNTED</span>
              <span className={styles.figure}>{formatMoney(cashPaise)}</span>
            </div>
            <div className={styles.fact}>
              <span className={styles.cap}>Expected</span>
              {blind ? <span className={styles.hiddenFigure} aria-label="hidden" /> : <span className={styles.val}>{view?.expectedText}</span>}
            </div>
            <p className={styles.muted}>{view?.expectedNote ?? "hidden from the cashier — the server alone knows the expected figure"}</p>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionCap}>STEP 3 · COUNT SLIPS</span>
            <span className={styles.code}>card · cheque · gift voucher</span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Tender</th>
                <th scope="col">Mode</th>
                <th scope="col" className={styles.right}>
                  Slips
                </th>
                <th scope="col" className={styles.right}>
                  Amount
                </th>
                <th scope="col">Batch / ref</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((line) => (
                <tr key={line.key}>
                  <td>{line.name}</td>
                  <td>{line.mode}</td>
                  {line.countable ? (
                    <>
                      <td className={styles.right}>
                        <input
                          className={styles.qtyInput}
                          inputMode="numeric"
                          autoComplete="off"
                          aria-label={`${line.name} slips`}
                          value={line.slips}
                          disabled={!editable}
                          onChange={(event) => {
                            const text = event.target.value.trim();
                            if (/^\d{0,4}$/.test(text)) updateSlip(line.key, { slips: text });
                          }}
                        />
                      </td>
                      <td className={styles.right}>
                        <input
                          className={styles.qtyInput}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-label={`${line.name} amount`}
                          value={line.amount}
                          disabled={!editable}
                          onChange={(event) => {
                            const text = event.target.value.trim();
                            if (isAmountDraft(text)) updateSlip(line.key, { amount: text });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.input}
                          data-uppercase="off"
                          maxLength={50}
                          autoComplete="off"
                          aria-label={`${line.name} batch`}
                          value={line.batch}
                          disabled={!editable}
                          onChange={(event) => updateSlip(line.key, { batch: event.target.value })}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td />
                      <td className={cx(styles.right, styles.toneMuted)}>{slipLineNote(line)}</td>
                      <td />
                    </>
                  )}
                </tr>
              ))}
              {slips.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyCell}>
                    —
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className={styles.muted}>{view?.slipNote ?? ""}</p>
        </div>
      </div>

      <div className={styles.sectionHead}>
        <span className={styles.sectionCap}>STEP 4 · SUBMIT</span>
        <span className={styles.code}>the answer is one of three, never a figure</span>
      </div>
      <div className={styles.answers}>
        <div className={cx(styles.answer, styles.answerGreen, answer === "ACCEPTED" && styles.answerOn)}>
          <TonePill tone="green">ACCEPTED</TonePill>
          <span className={styles.strong}>Count accepted.</span>
          <span className={styles.muted}>
            {answer === "ACCEPTED" ? answerText || acceptedText(slipCheck) : "Within the tolerance: the shift can be closed."}
          </span>
        </div>
        <div className={cx(styles.answer, styles.answerAmber, answer === "RECOUNT_REQUIRED" && styles.answerOn)}>
          <TonePill tone="amber">RECOUNT_REQUIRED</TonePill>
          <span className={styles.strong}>Please count again.</span>
          <span className={styles.muted}>
            {answer === "RECOUNT_REQUIRED" ? answerText : "Every attempt is kept, never overwritten."}
          </span>
        </div>
        <div className={cx(styles.answer, styles.answerRed, answer === "SENT_FOR_APPROVAL" && styles.answerOn)}>
          <TonePill tone="red">SENT_FOR_APPROVAL</TonePill>
          <span className={styles.strong}>Sent to the supervisor.</span>
          <span className={styles.muted}>
            {answer === "SENT_FOR_APPROVAL" ? answerText || APPROVAL_TEXT : "Out of tolerance after the last recount."}
          </span>
        </div>
      </div>

      {answer === "ACCEPTED" && session ? (
        <div className={styles.band}>
          <p className={styles.muted}>{view?.closeText}</p>
          <div className={styles.bandRow}>
            <label className={styles.formLabel} htmlFor="till-end-float-left">
              Float left
            </label>
            <input
              id="till-end-float-left"
              autoFocus
              className={cx(styles.input, styles.number)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="counter default"
              value={floatLeftText}
              disabled={busy}
              onChange={(event) => {
                const text = event.target.value.trim();
                if (isAmountDraft(text)) setFloatLeftText(text);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void closeSession();
                }
              }}
            />
            <button type="button" className={styles.primaryButton} disabled={busy || floatProblem !== ""} onClick={() => void closeSession()}>
              Close session
            </button>
            {floatProblem ? <span className={cx(styles.warn, styles.warnDanger)}>{floatProblem}</span> : null}
          </div>
        </div>
      ) : null}
    </TillDialog>
  );
}
