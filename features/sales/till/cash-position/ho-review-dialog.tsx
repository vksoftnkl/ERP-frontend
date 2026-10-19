"use client";

/**
 * Add HO review — Qt `TillHoReviewDialog` (notes 134, Cash Position 289
 * CREATE): head office's verdict on one store's business day or one of its
 * sessions, written with the store's facts in view. What it decides is
 * `ho-review.ts`; a refusal is said in plain words with the server's
 * sentence grey under it, and nothing is written.
 *
 * Reads on open: grid 150 (the as-on day's sessions, the Reviewing list) and
 * grid 174 (the store's earlier reviews). The journals (grid 117, POSTED Jrl
 * of the store's branch and the user's own) are read once, the first time
 * an outcome that needs one is picked.
 *
 * Keys: Ctrl+Enter saves, Esc cancels.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { getAuthUserId } from "@/lib/auth/session";
import { ReportTable } from "../reports/report-table";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { tillErrorOf } from "../shared/errors";
import { textOf, todayIso } from "../shared/format";
import { TillDialog, TonePill } from "../shared/till-dialog";
import styles from "../shared/till.module.scss";
import type { GridRow, TillReviewOutcome } from "../shared/wire/types";
import {
  NOTE_MAX_LENGTH,
  NOTE_PLACEHOLDER,
  OUTCOME_COLUMNS,
  TARGET_HINT,
  VOUCHER_NONE,
  WRITES_LINE,
  historyHead,
  historyParams,
  historyTable,
  lastReviewChipTone,
  needsVoucher,
  noteCaption,
  reviewBody,
  reviewFacts,
  reviewProblem,
  reviewTargets,
  reviewTitle,
  targetKey,
  targetsParams,
  voucherBranches,
  voucherOptions,
  voucherParams,
  voucherYear,
  type FactTone,
  type ReviewForm,
  type VoucherOption,
} from "./ho-review";
import local from "./cash-position.module.scss";

export type HoReviewDialogProps = {
  /** The store's row of grid 170; null = closed. */
  store: GridRow | null;
  /** The as-on day, `yyyy-MM-dd`. */
  asOn: string;
  /** Grid 171's rows (any branch; today only). */
  live: readonly GridRow[];
  companyId: string;
  /** The header's branch — the user's own, for the journals. */
  ownBranchId: string;
  /** The header's fiscal year, when the store has no open day to name one. */
  headerYear: string;
  onClose: () => void;
  /** The review was written: the parent closes and refreshes. */
  onSaved: () => void;
};

const TONE_CLASS: Record<FactTone, string | undefined> = {
  "": undefined,
  red: styles.toneRed,
  amber: styles.toneAmber,
  green: styles.toneGreen,
};

export function HoReviewDialog(props: HoReviewDialogProps) {
  return props.store ? <HoReviewBody {...props} store={props.store} /> : null;
}

function HoReviewBody({
  store,
  asOn,
  live,
  companyId,
  ownBranchId,
  headerYear,
  onClose,
  onSaved,
}: HoReviewDialogProps & { store: GridRow }) {
  const client = useTillSessionClient();
  const branchId = textOf(store, "branch_id");
  const storeName = textOf(store, "branch_name");
  const lastReview = textOf(store, "last_review");
  const [now] = useState(() => new Date());
  const [today] = useState(() => todayIso());

  const [daySessions, setDaySessions] = useState<readonly GridRow[]>([]);
  /** Null until grid 174 answered. */
  const [history, setHistory] = useState<readonly GridRow[] | null>(null);
  const [vouchers, setVouchers] = useState<VoucherOption[]>([]);
  const vouchersAsked = useRef(false);

  const [targetId, setTargetId] = useState("");
  const [outcome, setOutcome] = useState<TillReviewOutcome | "">("");
  const [note, setNote] = useState("");
  const [voucherId, setVoucherId] = useState("");
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  // ── The targets and the history, on open ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    client
      .gridRows("tillDaySessions", targetsParams(companyId, branchId, asOn))
      .then((rows) => {
        if (!cancelled) setDaySessions(rows);
      })
      .catch((thrown) => {
        if (!cancelled) setRefusal(tillErrorOf(thrown, "The day's sessions could not be read.").refusal);
      });
    client
      .gridRows("tillCashPositionReviews", historyParams(companyId, branchId, asOn))
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch((thrown) => {
        if (!cancelled) setRefusal(tillErrorOf(thrown, "The earlier reviews could not be read.").refusal);
      });
    return () => {
      cancelled = true;
    };
  }, [asOn, branchId, client, companyId]);

  /** Posted journals, once, the first time WRITTEN_OFF / SUSPENSE_CLEARED is picked (Qt `loadVouchers`). */
  const loadVouchers = () => {
    if (vouchersAsked.current) return;
    vouchersAsked.current = true;
    const userId = getAuthUserId() ?? "";
    const year = voucherYear(store, headerYear);
    for (const branch of voucherBranches(branchId, ownBranchId)) {
      client
        .gridRows("voucherRegisterList", voucherParams({ userId, companyId, branchId: branch, year, asOn, today }))
        .then((rows) => setVouchers((current) => [...current, ...voucherOptions(rows)]))
        .catch((thrown) => setRefusal(tillErrorOf(thrown, "The journals could not be read.").refusal));
    }
  };

  // ── The form as it stands ──────────────────────────────────────────────
  const targets = useMemo(() => reviewTargets(store, asOn, live, daySessions), [store, asOn, live, daySessions]);
  const target = targets.find((entry) => targetKey(entry) === targetId) ?? targets[0] ?? null;
  const voucher = needsVoucher(outcome) ? (vouchers.find((entry) => entry.id === voucherId) ?? null) : null;
  const form: ReviewForm = { target, outcome, note, voucher };
  const problem = reviewProblem(form, targets.length);
  const canSave = !busy && problem === "";
  const facts = useMemo(() => reviewFacts(store, live, now), [store, live, now]);
  const historyView = useMemo(() => historyTable(history ?? []), [history]);

  const pickOutcome = (code: TillReviewOutcome) => {
    setOutcome(code);
    if (needsVoucher(code)) loadVouchers();
    else setVoucherId("");
  };

  const save = async () => {
    const body = reviewBody(companyId, branchId, form);
    if (!canSave || !body || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      await client.reviewCreate(body);
      onSaved();
    } catch (thrown) {
      // Not this branch's, note, voucher not posted: the server's calls.
      setRefusal(tillErrorOf(thrown, "The review could not be saved.").refusal);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <TillDialog
      open
      size="wide"
      busy={busy}
      title={reviewTitle(storeName, asOn)}
      subtitle={WRITES_LINE}
      headExtra={lastReview ? <TonePill tone={lastReviewChipTone(lastReview)}>{lastReview}</TonePill> : null}
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void save();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Cancel - Esc
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canSave}
            title={problem}
            onClick={() => void save()}
          >
            Save review - Ctrl+Enter
          </button>
        </>
      }
    >
      <div className={styles.facts}>
        {facts.map((fact) => (
          <div key={fact.key} className={styles.fact}>
            <span className={styles.cap}>{fact.caption}</span>
            <span className={cx(styles.val, TONE_CLASS[fact.tone])} title={fact.value || "—"}>
              {fact.value || "—"}
            </span>
          </div>
        ))}
      </div>

      <div className={local.form}>
        <label className={local.formCap} htmlFor="till-hr-target">
          Reviewing
        </label>
        <div className={local.targetLine}>
          <select
            id="till-hr-target"
            className={cx(styles.select, local.targetSelect)}
            autoFocus
            value={target ? targetKey(target) : ""}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {targets.length === 0 ? <option value="">— nothing on this date</option> : null}
            {targets.map((entry) => (
              <option key={targetKey(entry)} value={targetKey(entry)}>
                {entry.text}
              </option>
            ))}
          </select>
          <span className={styles.muted}>{TARGET_HINT}</span>
        </div>

        <span className={local.formCap} id="till-hr-outcome-cap">
          Outcome *
        </span>
        <div className={local.outcomes} role="radiogroup" aria-labelledby="till-hr-outcome-cap">
          {OUTCOME_COLUMNS.map((column, at) => (
            <div key={at} className={local.outcomeColumn}>
              {column.map((entry) => (
                <label key={entry.code} className={cx(styles.radio, local.outcome)}>
                  <input
                    type="radio"
                    name="till-hr-outcome"
                    value={entry.code}
                    checked={outcome === entry.code}
                    onChange={() => pickOutcome(entry.code)}
                  />
                  {entry.code}
                  <span className={local.outcomeHint}>{entry.hint}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <label className={local.formCap} htmlFor="till-hr-note">
          {noteCaption(outcome)}
        </label>
        <input
          id="till-hr-note"
          className={styles.input}
          maxLength={NOTE_MAX_LENGTH}
          autoComplete="off"
          placeholder={NOTE_PLACEHOLDER}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <label className={local.formCap} htmlFor="till-hr-voucher">
          Voucher
        </label>
        <div className={local.targetLine}>
          <select
            id="till-hr-voucher"
            className={cx(styles.select, local.targetSelect)}
            disabled={!needsVoucher(outcome)}
            value={voucher ? voucher.id : ""}
            onChange={(event) => setVoucherId(event.target.value)}
          >
            <option value="">{VOUCHER_NONE}</option>
            {vouchers.map((entry) => (
              <option key={`${entry.year}:${entry.id}`} value={entry.id}>
                {entry.text}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className={local.head}>{historyHead(storeName, history !== null && history.length === 0)}</p>
      <div className={local.historyPane}>
        <ReportTable
          table={historyView}
          pickedKey={null}
          loading={history === null}
          emptyText="No earlier review of this store on this date."
          label="Earlier reviews"
        />
      </div>

      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)} role="alert">
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
