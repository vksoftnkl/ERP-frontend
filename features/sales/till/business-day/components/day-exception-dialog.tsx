"use client";

/**
 * Close with exception — Qt `TillDayExceptionDialog` (c77f3f1, notes 117;
 * bec3f98, notes 118): the day closes over the REDs an exception may cover —
 * sessions still live, and the safe not counted. Opened only when the
 * close-check says `canCloseWithException`.
 *
 * One drawer count per live session (the picker switches between them), a
 * DAY_CLOSE reason, and an approver — a store manager other than the caller,
 * typing their own till PIN here; the candidates are the branch's Till
 * Sessions (273) OVERRIDE holders. `POST /till/days/close` with
 * `exception { reasonId, approverId, approverPin, counts: [{ tssId, lines }] }`
 * force-closes each session on its count; a forced count out of tolerance
 * rolls the whole close back, and the server says so here — in plain words,
 * its own sentence grey under them.
 *
 * With NO live session (only the safe not counted) there is nothing to count:
 * the count frame is hidden, the intro says so, and the approvers are the
 * company's active users (dropdown 68 TILL APPROVER USERS, the caller left
 * out); `counts` goes empty.
 *
 * Keys: Enter walks a count (then on to the approver), Ctrl+Enter closes the
 * day, Esc cancels.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { getAuthUserId } from "@/lib/auth/session";
import { DenomCount } from "../../session/denom-count";
import {
  EMPTY_COUNT,
  countLines,
  countedPaise,
  toDenominations,
  type DenomCountValue,
  type Denomination,
} from "../../shared/denom";
import { tillErrorOf } from "../../shared/errors";
import { TillDialog } from "../../shared/till-dialog";
import tillStyles from "../../shared/till.module.scss";
import { useBusinessDayClient } from "../api/business-day-api";
import {
  EXCEPTION_HINT,
  approverChoices,
  approverUsersOf,
  countsDoneLine,
  dayReasonParams,
  exceptionBody,
  exceptionIntro,
  exceptionModeOf,
  exceptionProblem,
  isPinRefusal,
  reasonChoices,
  type ApproverChoice,
  type ExceptionDraft,
  type ExceptionPage,
  type ReasonChoice,
} from "../domain/day-close";
import { formatMoney } from "../domain/decimal";
import { firstErrorOf, type DayCloseResult, type DayKey } from "../domain/wire";
import styles from "../page.module.scss";

const ID = "bd-exception";
const APPROVER_ID = `${ID}-approver`;

export type DayExceptionDialogProps = {
  dayKey: DayKey;
  /** The SESSIONS_LIVE sessions, one count each; none = the exception covers only the safe. */
  pages: readonly ExceptionPage[];
  onClose: () => void;
  /** The server closed the day. */
  onClosed: (result: DayCloseResult) => void;
};

const EMPTY_DRAFT: ExceptionDraft = { reasonId: "", note: "", approverId: "", pin: "" };

/** The red line: a sentence of the dialog's own, or the server's refusal in plain words. */
type ErrorLine = { text: string } | { refusal: ApiRefusal } | null;

export function DayExceptionDialog({ dayKey, pages, onClose, onClosed }: DayExceptionDialogProps) {
  const client = useBusinessDayClient();
  const mode = exceptionModeOf(pages);
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  // Nothing to count with nothing live: the notes and coins are not read.
  const [denomsLoading, setDenomsLoading] = useState(mode === "sessions");
  const [reasons, setReasons] = useState<ReasonChoice[]>([]);
  const [approvers, setApprovers] = useState<ApproverChoice[]>([]);
  const [page, setPage] = useState(0);
  const [counts, setCounts] = useState<Readonly<Record<string, DenomCountValue>>>({});
  const [draft, setDraft] = useState<ExceptionDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorLine>(null);
  /** Two Ctrl+Enters inside one render must not send two closes. */
  const inFlight = useRef(false);
  const pinRef = useRef<HTMLInputElement>(null);

  const { companyId, branchId, accYear } = dayKey;
  const firstTssId = pages[0]?.tssId ?? "";

  useEffect(() => {
    let cancelled = false;
    if (mode === "sessions") {
      client
        .denominations(companyId)
        .then((rows) => {
          if (!cancelled) setDenominations(toDenominations(rows));
        })
        .catch((thrown) => {
          if (!cancelled) {
            setError({ text: `The denominations could not be read: ${firstErrorOf(thrown, "no answer").message}` });
          }
        })
        .finally(() => {
          if (!cancelled) setDenomsLoading(false);
        });
    }
    // No reasons: the dialog says a reason is needed and the close waits (Qt swallows it too).
    client
      .gridRows("tillReasonList", null, dayReasonParams(companyId, "DAY_CLOSE"))
      .then((rows) => {
        if (!cancelled) setReasons(reasonChoices(rows));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, companyId, mode]);

  // Who may sign for the first live session (not its cashier) — the caller
  // left out, as the rule wants someone else. Nothing live: the company's
  // active users (dropdown 68); the server judges the grant.
  useEffect(() => {
    let cancelled = false;
    const me = getAuthUserId() ?? "";
    if (!firstTssId) {
      client
        .approverUsers(companyId)
        .then((rows) => {
          if (!cancelled) setApprovers(approverUsersOf(rows, me));
        })
        .catch((thrown) => {
          if (!cancelled) setError({ refusal: tillErrorOf(thrown, "The approvers could not be listed.").refusal });
        });
    } else {
      client
        .supervisors({ companyId, branchId, accYear, tssId: firstTssId })
        .then((rows) => {
          if (!cancelled) setApprovers(approverChoices(rows, me));
        })
        .catch((thrown) => {
          if (!cancelled) {
            setError({ text: `The approvers could not be listed: ${firstErrorOf(thrown, "no answer").message}` });
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [accYear, branchId, client, companyId, firstTssId]);

  const counted = useMemo(
    () =>
      pages.map((entry) => {
        const value = counts[entry.tssId] ?? EMPTY_COUNT;
        return { ...entry, lines: countLines(denominations, value), paise: countedPaise(denominations, value) };
      }),
    [counts, denominations, pages],
  );
  const at = Math.min(page, Math.max(0, pages.length - 1));
  const current = counted[at] ?? null;
  const problem = exceptionProblem(draft, reasons, counted);
  const canClose = !problem && !busy;

  const patch = (next: Partial<ExceptionDraft>) => setDraft((value) => ({ ...value, ...next }));

  const submit = async () => {
    if (!canClose || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      onClosed(await client.closeDay(exceptionBody(dayKey, draft, counted)));
    } catch (thrown) {
      // Approver, PIN, a missing or out-of-tolerance count are the server's
      // calls: its refusal in plain words, its sentence in grey.
      const refusal = tillErrorOf(thrown, "The business day could not be closed.");
      setError({ refusal: refusal.refusal });
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
      busy={busy}
      title="Close the day with an exception"
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
            disabled={!canClose}
            title={problem || undefined}
            onClick={() => void submit()}
          >
            {busy ? "Closing…" : "Close day - Ctrl+Enter"}
          </button>
          <button type="button" className={tillStyles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
        </>
      }
    >
      <p className={tillStyles.muted}>{exceptionIntro(pages.length)}</p>

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
      </div>

      {mode === "sessions" ? (
        <div className={tillStyles.card}>
          <div className={tillStyles.inlineRow}>
            <label className={tillStyles.formLabel} htmlFor={`${ID}-session`}>
              Drawer of
            </label>
            <select
              id={`${ID}-session`}
              className={cx(tillStyles.select, styles.dialogGrow)}
              value={String(at)}
              onChange={(event) => setPage(Number(event.target.value))}
            >
              {pages.map((entry, index) => (
                <option key={entry.tssId} value={String(index)}>
                  {entry.label}
                </option>
              ))}
            </select>
            <span className={tillStyles.cap}>Counted</span>
            <span className={tillStyles.figure}>{formatMoney(BigInt(current?.paise ?? 0))}</span>
          </div>
          {current ? (
            <DenomCount
              // A page of its own per drawer: the Qt stacked widget.
              key={current.tssId}
              idPrefix={`${ID}-${at}`}
              denominations={denominations}
              loading={denomsLoading}
              value={counts[current.tssId] ?? EMPTY_COUNT}
              onChange={(next) => setCounts((all) => ({ ...all, [current.tssId]: next }))}
              onDone={() => document.getElementById(APPROVER_ID)?.focus()}
            />
          ) : null}
          {pages.length > 1 ? <p className={tillStyles.muted}>{countsDoneLine(counted)}</p> : null}
        </div>
      ) : null}

      <div className={tillStyles.formGrid}>
        <label className={tillStyles.formLabel} htmlFor={APPROVER_ID}>
          Approver
        </label>
        <select
          id={APPROVER_ID}
          className={tillStyles.select}
          value={draft.approverId}
          onChange={(event) => patch({ approverId: event.target.value })}
        >
          <option value="">Pick the approver</option>
          {approvers.map((approver) => (
            <option key={approver.id} value={approver.id}>
              {approver.label}
            </option>
          ))}
        </select>

        <label className={tillStyles.formLabel} htmlFor={`${ID}-pin`}>
          Approver&apos;s till PIN
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

      <p className={tillStyles.muted}>{EXCEPTION_HINT}</p>
      {error ? (
        <p className={cx(tillStyles.warn, tillStyles.warnDanger)} role="alert">
          {"refusal" in error ? <RefusalText refusal={error.refusal} /> : error.text}
        </p>
      ) : null}
    </TillDialog>
  );
}
