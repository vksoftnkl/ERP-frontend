"use client";

/**
 * Change between counters — Qt `TillChangeDialog` (bec3f98): a supervisor
 * carries change from one live counter to another, opened from the Session
 * Cockpit's Change…. This till takes or gives; the other is picked from the
 * branch's OPEN / SUSPENDED tills (grid 144); the change is counted note by
 * note (End Shift's count, `../session/denom-count.tsx`); both cashiers type
 * their till PIN. What it decides is `change.ts`; a refusal is said in plain
 * words with the server's sentence grey under it, a refused PIN typed again.
 *
 * Keys: Enter walks the form, Ctrl+Enter posts, Esc cancels.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { EMPTY_COUNT, countLines, countedPaise, toDenominations, type DenomCountValue, type Denomination } from "../shared/denom";
import { tillErrorOf } from "../shared/errors";
import { formatMoney } from "../shared/money";
import type { TillReason } from "../shared/reasons";
import { TillDialog } from "../shared/till-dialog";
import type { GridRow, TillChangeResult } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { DenomCount, focusFirstQty } from "../session/denom-count";
import {
  CHANGE_COUNT_NOTE,
  CHANGE_HINT,
  CHANGE_SESSION_STATUSES,
  DIRECTION_OPTIONS,
  EMPTY_CHANGE,
  changeBody,
  changeGridParams,
  changeParties,
  changeProblem,
  otherTillLabel,
  otherTillPlaceholder,
  otherTillsOf,
  pinCaptions,
  refusedChangePin,
  thisTillOf,
  tillName,
  type ChangeForm,
  type ChangeTill,
} from "./change";
import { categoryReasons, noteNeeded, notePlaceholder } from "./force-close";
import type { SessionDialogRequest } from "./force-close-dialog";
import local from "./sessions.module.scss";

export type ChangeDialogProps = {
  /** The cockpit's key and payload; null = closed. */
  request: SessionDialogRequest | null;
  /** Grid 134 rows, every category: the dialog keeps the live PICKUP ones. */
  reasons: readonly TillReason[];
  /** The signed-in user: the taking cashier carrying it types no PIN of their own. */
  callerId: string;
  onClose: () => void;
  onChanged: (result: TillChangeResult) => void;
};

const ID_PREFIX = "till-change";
const DIRECTION_ID = "till-change-direction";
const OTHER_ID = "till-change-other";
const REASON_ID = "till-change-reason";
const NOTE_ID = "till-change-note";
const FROM_PIN_ID = "till-change-from-pin";
const TO_PIN_ID = "till-change-to-pin";
const POST_ID = "till-change-post";

export function ChangeDialog({ request, reasons, callerId, onClose, onChanged }: ChangeDialogProps) {
  return request ? (
    <ChangeBody request={request} reasons={reasons} callerId={callerId} onClose={onClose} onChanged={onChanged} />
  ) : null;
}

function ChangeBody({ request, reasons, callerId, onClose, onChanged }: ChangeDialogProps & { request: SessionDialogRequest }) {
  const client = useTillSessionClient();
  const [thisTill] = useState(() => thisTillOf(request.session));
  /** The branch's other live tills; null while grid 144 is read. */
  const [others, setOthers] = useState<ChangeTill[] | null>(null);
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [denomsLoading, setDenomsLoading] = useState(true);
  const [count, setCount] = useState<DenomCountValue>(EMPTY_COUNT);
  const [form, setForm] = useState<ChangeForm>(EMPTY_CHANGE);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<ApiRefusal | null>(null);
  const inFlight = useRef(false);

  const { companyId, branchId, accYear } = request.key;
  const thisTssId = thisTill.tssId;

  useEffect(() => {
    let cancelled = false;
    client
      .denominations(companyId)
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
  }, [client, companyId]);

  // The branch's live tills: grid 144 takes one status, so OPEN and SUSPENDED
  // are read apart; a failed read still lists what the other one found.
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled(
      CHANGE_SESSION_STATUSES.map((status) => client.gridRows("tillSessionList", changeGridParams({ companyId, branchId }, status))),
    ).then((results) => {
      if (cancelled) return;
      const rows: GridRow[] = [];
      let failed: PromiseRejectedResult | null = null;
      for (const result of results) {
        if (result.status === "fulfilled") rows.push(...result.value);
        else failed ??= result;
      }
      setOthers(otherTillsOf(rows, thisTssId, accYear));
      if (failed) toast.apiError(failed.reason, { fallback: "The other tills could not be read." });
    });
    return () => {
      cancelled = true;
    };
  }, [accYear, branchId, client, companyId, thisTssId]);

  const counted = countedPaise(denominations, count);
  const parties = changeParties(thisTill, others, form, callerId);
  const needsNote = noteNeeded(reasons, form.reasonId);
  const problem = changeProblem(parties, form, counted, needsNote);
  const canPost = !problem && !busy;
  const captions = pinCaptions(parties);
  const askToPin = !parties.takerIsCaller;
  const patch = (next: Partial<ChangeForm>) => setForm((current) => ({ ...current, ...next }));

  const post = async () => {
    if (!canPost || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      onChanged(await client.movementChange(changeBody(request.key, parties, form, countLines(denominations, count))));
    } catch (thrown) {
      const read = tillErrorOf(thrown, "The change could not be posted.");
      setRefusal(read.refusal);
      // The cashier whose PIN was refused types it again from empty.
      const pin = refusedChangePin(read.field);
      if (pin) {
        patch(pin === "from" ? { fromPin: "" } : { toPin: "" });
        document.getElementById(pin === "from" ? FROM_PIN_ID : TO_PIN_ID)?.focus();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  /** Enter moves on (Qt `EnterNavigation`); the next box that is there takes the focus. */
  const enterTo = (...ids: string[]) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    for (const id of ids) {
      const next = document.getElementById(id) as HTMLInputElement | null;
      if (next && !next.disabled) {
        next.focus();
        return;
      }
    }
  };

  const toCount = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    if (denominations.length > 0) focusFirstQty(ID_PREFIX);
    else document.getElementById(REASON_ID)?.focus();
  };

  return (
    <TillDialog
      open
      busy={busy}
      title="Change between counters"
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "Enter" && event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          void post();
        }
      }}
      footer={
        <>
          <span className={styles.spacer} />
          <button
            id={POST_ID}
            type="button"
            className={styles.primaryButton}
            disabled={!canPost}
            title={problem}
            onClick={() => void post()}
          >
            Post - Ctrl+Enter
          </button>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc  Cancel
          </button>
        </>
      }
    >
      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.cap}>Gives the change</span>
          <span className={styles.val} title={tillName(parties.giver)}>
            {tillName(parties.giver)}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap} aria-hidden="true">
            &nbsp;
          </span>
          <span className={styles.val} aria-hidden="true">
            →
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.cap}>Takes the change</span>
          <span className={styles.val} title={tillName(parties.taker)}>
            {tillName(parties.taker)}
          </span>
        </div>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor={DIRECTION_ID}>
          This till
        </label>
        <select
          id={DIRECTION_ID}
          className={styles.select}
          autoFocus
          value={form.gives ? "gives" : "takes"}
          onKeyDown={enterTo(OTHER_ID)}
          onChange={(event) => patch({ gives: event.target.value === "gives", fromPin: "", toPin: "" })}
        >
          {DIRECTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.formLabel} htmlFor={OTHER_ID}>
          Other till *
        </label>
        <select
          id={OTHER_ID}
          className={styles.select}
          value={form.otherId}
          onKeyDown={toCount}
          onChange={(event) => patch({ otherId: event.target.value, fromPin: "", toPin: "" })}
        >
          <option value="">{otherTillPlaceholder(others)}</option>
          {(others ?? []).map((till) => (
            <option key={till.tssId} value={till.tssId}>
              {otherTillLabel(till)}
            </option>
          ))}
        </select>
      </div>

      <p className={styles.muted}>{CHANGE_COUNT_NOTE}</p>
      <DenomCount
        idPrefix={ID_PREFIX}
        denominations={denominations}
        loading={denomsLoading}
        value={count}
        onChange={setCount}
        disabled={busy}
        onDone={() => document.getElementById(REASON_ID)?.focus()}
      />
      <div className={local.countedRow}>
        <span className={styles.cap}>Change</span>
        <span className={styles.figure}>{formatMoney(counted)}</span>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor={REASON_ID}>
          Reason *
        </label>
        <select
          id={REASON_ID}
          className={styles.select}
          value={form.reasonId}
          onKeyDown={enterTo(NOTE_ID)}
          onChange={(event) => patch({ reasonId: event.target.value })}
        >
          {categoryReasons(reasons, "PICKUP").map((option) => (
            <option key={option.value || "none"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.formLabel} htmlFor={NOTE_ID}>
          Note
        </label>
        <input
          id={NOTE_ID}
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder={notePlaceholder(needsNote)}
          value={form.note}
          onKeyDown={enterTo(FROM_PIN_ID)}
          onChange={(event) => patch({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor={FROM_PIN_ID}>
          {captions.from}
        </label>
        <input
          id={FROM_PIN_ID}
          type="password"
          className={styles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          value={form.fromPin}
          onKeyDown={enterTo(TO_PIN_ID, POST_ID)}
          onChange={(event) => patch({ fromPin: event.target.value })}
        />

        {askToPin ? (
          <>
            <label className={styles.formLabel} htmlFor={TO_PIN_ID}>
              {captions.to}
            </label>
            <input
              id={TO_PIN_ID}
              type="password"
              className={styles.input}
              maxLength={12}
              autoComplete="off"
              data-uppercase="off"
              value={form.toPin}
              onKeyDown={enterTo(POST_ID)}
              onChange={(event) => patch({ toPin: event.target.value })}
            />
          </>
        ) : null}
      </div>

      <p className={cx(styles.muted, local.hint)}>{CHANGE_HINT}</p>
      {refusal ? (
        <p className={cx(styles.warn, styles.warnDanger)}>
          <RefusalText refusal={refusal} />
        </p>
      ) : null}
    </TillDialog>
  );
}
