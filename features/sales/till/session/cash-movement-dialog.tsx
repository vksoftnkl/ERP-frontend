"use client";

/**
 * Cash Movement (S3, rev 2) — Qt `TillCashMovementDialog`: drop · paid in ·
 * pickup · top-up, one `POST /till/movements/create` each.
 *
 * Opened from Open Till's live panel on this device's own session (Drop
 * first), and from the Sessions list / cockpit on any session still taking
 * money (Pickup first — a supervisor's verb). What it decides is
 * `cash-movement.ts`; this file draws it and talks to the server.
 *
 * The 2026-10-12 layout: the four mode tiles (a name and what it is), the
 * form on the left and a summary card on the right, the count under both.
 * A pickup — and a top-up the session's own cashier does not bring — asks
 * the session cashier's till PIN (notes 108); a refusal on it clears the box
 * and puts the focus back there.
 *
 * Keys: Ctrl+Enter (or F10) posts, Ctrl+1..4 pick the mode, Enter walks the
 * form into the count, Esc closes.
 */
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { cx } from "@/components/design-system/cx";
import { getAuthUserId, getUserInfo } from "@/lib/auth/session";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { getMessages, subscribeToMessages, toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { EMPTY_COUNT, toDenominations, type Denomination } from "../shared/denom";
import { tillErrorOf } from "../shared/errors";
import { clockOf } from "../shared/format";
import { amountInputPaise, formatMoney, isAmountDraft, paiseOf } from "../shared/money";
import { reasonGridParams, toReasons, type TillReason } from "../shared/reasons";
import { selectOnFocus } from "../shared/select-on-focus";
import { TillDialog, TonePill } from "../shared/till-dialog";
import type { TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import {
  MODE_LINES,
  MODE_TITLES,
  MOVEMENT_MODES,
  SUPERVISOR_TIP,
  WITNESS_TIP,
  emptyMovementForm,
  isCounted,
  isPostKey,
  ledgerTip,
  modeForKey,
  movementAmount,
  movementBody,
  movementProblem,
  movementStars,
  movementWords,
  needsWitnessPin,
  reasonOptions,
  refVisible,
  summaryAccount,
  type MovementForm,
  type MovementInputs,
  type MovementMode,
} from "./cash-movement";
import { DenomCount, focusFirstQty } from "./denom-count";

export type CashMovementDialogProps = {
  /** The session the cash moves through; null = closed. */
  sessionKey: TillSessionKey | null;
  initialMode: MovementMode;
  onClose: () => void;
  /** A movement posted (before the dialog closes). */
  onPosted?: () => void;
};

export function CashMovementDialog({ sessionKey, initialMode, onClose, onPosted }: CashMovementDialogProps) {
  const open = sessionKey !== null;
  return open ? (
    <CashMovementBody key={`${sessionKey.tssId}|${initialMode}`} sessionKey={sessionKey} initialMode={initialMode} onClose={onClose} onPosted={onPosted} />
  ) : null;
}

const ID_PREFIX = "till-move";
const PIN_ID = "till-move-pin";
const POST_ID = "till-move-post";
/** The form's Enter order; a field the mode hides is skipped. */
const ENTER_ORDER = [
  "till-move-reason",
  "till-move-ledger",
  "till-move-amount",
  "till-move-bag",
  "till-move-seal",
  "till-move-ref",
  "till-move-party",
  "till-move-notes",
  PIN_ID,
];

/**
 * Focus an element once no message popup is up: the popup takes the focus
 * and gives none back, so a box focused under it would be left behind.
 */
function focusAfterMessages(id: string): void {
  const focus = () => {
    const element = document.getElementById(id) as HTMLInputElement | null;
    element?.focus();
  };
  if (getMessages().length === 0) {
    focus();
    return;
  }
  const unsubscribe = subscribeToMessages(() => {
    if (getMessages().length > 0) return;
    unsubscribe();
    window.setTimeout(focus, 0);
  });
}

function CashMovementBody({
  sessionKey,
  initialMode,
  onClose,
  onPosted,
}: {
  sessionKey: TillSessionKey;
  initialMode: MovementMode;
  onClose: () => void;
  onPosted?: () => void;
}) {
  const client = useTillSessionClient();
  const ledgerDropdownId = useDropdownId("tillReasonLedger");
  const [form, setForm] = useState<MovementForm>(() => emptyMovementForm(initialMode, EMPTY_COUNT));
  const [session, setSession] = useState<TillSessionPayload | null>(null);
  const [reasons, setReasons] = useState<TillReason[]>([]);
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [denomsLoading, setDenomsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** The declared amount as typed (a drop): kept as text so "2000." survives a keystroke. */
  const [amountText, setAmountText] = useState("");
  const [time] = useState(() => clockOf(new Date().toISOString()));
  const me = getAuthUserId() ?? "";
  const myName = getUserInfo()?.userName ?? "";
  const companyId = sessionKey.companyId;

  useEffect(() => {
    let cancelled = false;
    client
      .get(sessionKey)
      .then((payload) => {
        if (!cancelled) setSession(payload);
      })
      .catch((error) => {
        if (!cancelled) toast.error(tillErrorOf(error, "The session could not be read.").text);
      });
    client
      .denominations(companyId)
      .then((rows) => {
        if (!cancelled) setDenominations(toDenominations(rows));
      })
      .catch((error) => {
        if (!cancelled) toast.error(tillErrorOf(error, "The denominations could not be read.").text);
      })
      .finally(() => {
        if (!cancelled) setDenomsLoading(false);
      });
    // No reasons: the form says a reason is needed and Post waits.
    client
      .gridRows("tillReasonList", reasonGridParams(companyId, false))
      .then((rows) => {
        if (!cancelled) setReasons(toReasons(rows));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, companyId, sessionKey]);

  const inputs: MovementInputs = { form, session, reasons, denominations, me, myName };
  const problem = movementProblem(inputs);
  const amount = movementAmount(inputs);
  const words = movementWords(form.mode, session, myName);
  const stars = movementStars(inputs);
  const options = useMemo(() => reasonOptions(form.mode, reasons), [form.mode, reasons]);
  const showRef = refVisible(form, reasons);
  const counted = isCounted(form.mode);
  const pinNeeded = needsWitnessPin(form.mode, session, me);
  const drop = form.mode === "DROP";
  const paidIn = form.mode === "PAID_IN";
  const pickup = form.mode === "PICKUP";
  const topUp = form.mode === "TOP_UP";
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  const update = (patch: Partial<MovementForm>) => setForm((current) => ({ ...current, ...patch }));

  const setMode = (mode: MovementMode) => {
    // Qt clears the count, the amount and every box (the PIN too) on a mode change.
    setForm(emptyMovementForm(mode, EMPTY_COUNT));
    setAmountText("");
  };

  const post = async () => {
    if (busy) return;
    const why = movementProblem({ form, session, reasons, denominations, me, myName });
    if (why) {
      toast.warn(why);
      return;
    }
    setBusy(true);
    try {
      const result = await client.createMovement(movementBody({ form, session, reasons, denominations, me, myName }, sessionKey));
      toast.success(`${result.tcmKind} ${result.tcmDocNo} posted — ${formatMoney(paiseOf(result.tcmAmount))}.`);
      onPosted?.();
      onClose();
    } catch (error) {
      const refusal = tillErrorOf(error, "The movement could not be posted.");
      // A PIN refusal (TILL_WITNESS_PIN / _REQUIRED / _NO_PIN): the message
      // names it; the box is cleared for the next try.
      const pinRefused = refusal.field === "witnessPin";
      if (pinRefused) update({ witnessPin: "" });
      toast.error(refusal.text);
      setBusy(false);
      if (pinRefused) focusAfterMessages(PIN_ID);
    }
  };

  /**
   * Enter walks the form; past its last field, into the count (or onto Post).
   * An Enter the ledger dropdown took (a row picked) is its own.
   */
  const walkFrom = (fromId: string) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const at = ENTER_ORDER.indexOf(fromId);
    for (const id of ENTER_ORDER.slice(at + 1)) {
      const next = document.getElementById(id) as HTMLInputElement | null;
      if (next && !next.disabled) {
        next.focus();
        return;
      }
    }
    if (counted) focusFirstQty(ID_PREFIX);
    else document.getElementById(POST_ID)?.focus();
  };

  const bagSeal = form.bagNo.trim() || form.sealNo.trim() ? `${form.bagNo.trim()} / ${form.sealNo.trim()}` : "—";
  const star = (text: string, needed: boolean) => (needed ? `${text} *` : text);

  return (
    <TillDialog
      open
      size="normal"
      busy={busy}
      title={words.title}
      subtitle={words.sub}
      headExtra={
        <>
          <span className={styles.spacer} />
          <TonePill tone={words.flowTone}>{words.flow}</TonePill>
        </>
      }
      onClose={onClose}
      onKey={(event) => {
        const mode = modeForKey(event);
        if (mode) {
          // Never the browser's own Ctrl+digit (a tab switch).
          event.preventDefault();
          if (!busy) setMode(mode);
          return;
        }
        if (isPostKey(event)) {
          event.preventDefault();
          if (!problem && !busy) void post();
        }
      }}
      footer={
        <>
          <p className={cx(styles.warn, styles.spacer)}>{problem}</p>
          <button type="button" className={cx(styles.secondaryButton, styles.verbButton)} disabled={busy} onClick={onClose}>
            Close - Esc
          </button>
          <button
            id={POST_ID}
            type="button"
            className={cx(styles.primaryButton, styles.verbButton)}
            disabled={busy || problem !== ""}
            onClick={() => void post()}
          >
            {busy ? "Posting…" : "Post - Ctrl+Enter"}
          </button>
        </>
      }
    >
      <div className={styles.modeTiles} role="tablist" aria-label="Movement">
        {MOVEMENT_MODES.map((mode, index) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={form.mode === mode}
            title={`Ctrl+${index + 1}`}
            className={cx(styles.secondaryButton, styles.modeTile, form.mode === mode && styles.modeButtonOn)}
            disabled={busy}
            onClick={() => setMode(mode)}
          >
            <span>{MODE_TITLES[mode]}</span>
            <span className={styles.modeTileLine}>{MODE_LINES[mode]}</span>
          </button>
        ))}
      </div>
      <p className={styles.muted}>{words.modeNote}</p>

      <div className={styles.moveBody}>
        <div className={styles.moveForm}>
          {paidIn || pickup ? (
            <>
              <label className={styles.formLabel} htmlFor="till-move-reason">
                Reason *
              </label>
              <select
                id="till-move-reason"
                className={cx(styles.select, styles.moveSpan)}
                value={form.reasonId}
                autoFocus
                onChange={(event) => update({ reasonId: event.target.value })}
                onKeyDown={walkFrom("till-move-reason")}
              >
                <option value="">Pick a reason</option>
                {options.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {paidIn ? (
            <>
              <label className={styles.formLabel} htmlFor="till-move-ledger">
                {star("Ledger", stars.ledger)}
              </label>
              <div className={styles.moveSpan} title={ledgerTip(inputs) || undefined} onKeyDown={walkFrom("till-move-ledger")}>
                <NexDropdownSingle
                  id="till-move-ledger"
                  dropdownId={ledgerDropdownId}
                  params={ledgerParams}
                  clearOnParamsChange={false}
                  value={form.ledger}
                  onChange={(selection) => update({ ledger: selection })}
                  placeholder="The reason's ledger"
                  aria-label="Ledger"
                  className={styles.dropdown}
                  advanceFocusOnSelect={false}
                />
              </div>
            </>
          ) : null}
          {drop ? (
            <>
              <label className={styles.formLabel} htmlFor="till-move-amount">
                Declared amount *
              </label>
              <input
                id="till-move-amount"
                className={cx(styles.input, styles.number, styles.moveSpan)}
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={amountText}
                onFocus={selectOnFocus}
                onKeyDown={walkFrom("till-move-amount")}
                onChange={(event) => {
                  const text = event.target.value.trim();
                  if (!isAmountDraft(text)) return;
                  setAmountText(text);
                  update({ amountPaise: amountInputPaise(text) });
                }}
              />
            </>
          ) : null}
          {drop || pickup ? (
            <>
              <label className={styles.formLabel} htmlFor="till-move-bag">
                {words.bagCaption}
              </label>
              <input
                id="till-move-bag"
                className={styles.input}
                data-uppercase="off"
                maxLength={30}
                autoComplete="off"
                value={form.bagNo}
                onKeyDown={walkFrom("till-move-bag")}
                onChange={(event) => update({ bagNo: event.target.value })}
              />
              <label className={styles.formLabel} htmlFor="till-move-seal">
                {words.sealCaption}
              </label>
              <input
                id="till-move-seal"
                className={styles.input}
                data-uppercase="off"
                maxLength={30}
                autoComplete="off"
                value={form.sealNo}
                onKeyDown={walkFrom("till-move-seal")}
                onChange={(event) => update({ sealNo: event.target.value })}
              />
            </>
          ) : null}
          {showRef ? (
            <>
              <label className={styles.formLabel} htmlFor="till-move-ref">
                {star("Ref no", stars.ref)}
              </label>
              <input
                id="till-move-ref"
                className={cx(styles.input, styles.moveSpan)}
                data-uppercase="off"
                maxLength={50}
                autoComplete="off"
                value={form.refNo}
                onKeyDown={walkFrom("till-move-ref")}
                onChange={(event) => update({ refNo: event.target.value })}
              />
            </>
          ) : null}
          {paidIn ? (
            <>
              <label className={styles.formLabel} htmlFor="till-move-party">
                Received from
              </label>
              <input
                id="till-move-party"
                className={cx(styles.input, styles.moveSpan)}
                maxLength={150}
                autoComplete="off"
                value={form.partyName}
                onKeyDown={walkFrom("till-move-party")}
                onChange={(event) => update({ partyName: event.target.value })}
              />
            </>
          ) : null}
          <label className={styles.formLabel} htmlFor="till-move-notes">
            {star("Notes", stars.notes)}
          </label>
          <input
            id="till-move-notes"
            className={cx(styles.input, styles.moveSpan)}
            maxLength={500}
            autoComplete="off"
            autoFocus={topUp}
            value={form.notes}
            onKeyDown={walkFrom("till-move-notes")}
            onChange={(event) => update({ notes: event.target.value })}
          />
          {pinNeeded ? (
            <>
              <label className={styles.formLabel} htmlFor={PIN_ID}>
                {words.pinCaption}
              </label>
              <input
                id={PIN_ID}
                type="password"
                className={styles.input}
                data-uppercase="off"
                maxLength={12}
                autoComplete="new-password"
                value={form.witnessPin}
                onKeyDown={walkFrom(PIN_ID)}
                onChange={(event) => update({ witnessPin: event.target.value })}
              />
              <p className={styles.moveHint}>{words.pinHint}</p>
            </>
          ) : null}
        </div>

        <div className={styles.moveSummary} aria-label="Summary">
          <span className={cx(styles.sectionCap, styles.moveSummaryWide)}>{words.totalCaption}</span>
          <span className={cx(styles.figure, styles.moveSummaryWide)}>₹ {formatMoney(amount)}</span>
          <span className={styles.moveSummaryRule} aria-hidden="true" />
          <span className={styles.cap}>{words.safeCaption}</span>
          <span className={styles.val} title={words.safeTip || undefined}>
            {summaryAccount(inputs)}
          </span>
          {drop || pickup ? (
            <>
              <span className={styles.cap}>Bag / seal</span>
              <span className={styles.val}>{bagSeal}</span>
            </>
          ) : null}
          {pickup || topUp ? (
            <>
              <span className={styles.cap}>Supervisor</span>
              <span className={styles.val} title={SUPERVISOR_TIP}>
                {words.supervisor || "—"}
              </span>
              <span className={styles.cap}>Witness</span>
              <span className={styles.val} title={WITNESS_TIP}>
                {words.witness || "—"}
              </span>
            </>
          ) : null}
          <span className={styles.cap}>Time</span>
          <span className={styles.val}>{time}</span>
        </div>
      </div>

      {counted ? (
        <>
          <span className={styles.sectionCap}>{star("Count by note", stars.count)}</span>
          <DenomCount
            idPrefix={ID_PREFIX}
            denominations={denominations}
            loading={denomsLoading}
            value={form.count}
            onChange={(count) => update({ count })}
            disabled={busy}
            onDone={() => document.getElementById(POST_ID)?.focus()}
          />
        </>
      ) : null}
    </TillDialog>
  );
}
