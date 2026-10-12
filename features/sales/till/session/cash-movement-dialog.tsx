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
 * Keys: F10 posts, Esc closes.
 */
import { useEffect, useMemo, useState } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { cx } from "@/components/design-system/cx";
import { getAuthUserId, getUserInfo } from "@/lib/auth/session";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { EMPTY_COUNT, toDenominations, type Denomination } from "../shared/denom";
import { tillErrorOf } from "../shared/errors";
import { clockOf } from "../shared/format";
import { amountInputPaise, formatMoney, isAmountDraft, paiseOf } from "../shared/money";
import { reasonGridParams, toReasons, type TillReason } from "../shared/reasons";
import { TillDialog, TonePill } from "../shared/till-dialog";
import type { TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import {
  MODE_TITLES,
  MOVEMENT_MODES,
  SIGN_NOTE,
  emptyMovementForm,
  isCounted,
  movementAmount,
  movementBody,
  movementProblem,
  movementWords,
  reasonOptions,
  refVisible,
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
  const idPrefix = "till-move";

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
  const options = useMemo(() => reasonOptions(form.mode, reasons), [form.mode, reasons]);
  const showRef = refVisible(form, reasons);
  const counted = isCounted(form.mode);
  const drop = form.mode === "DROP";
  const paidIn = form.mode === "PAID_IN";
  const pickup = form.mode === "PICKUP";
  const topUp = form.mode === "TOP_UP";
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  const update = (patch: Partial<MovementForm>) => setForm((current) => ({ ...current, ...patch }));

  const setMode = (mode: MovementMode) => {
    // Qt clears the count, the amount and every box on a mode change.
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
      toast.error(tillErrorOf(error, "The movement could not be posted.").text);
      setBusy(false);
    }
  };

  const bagSeal = form.bagNo.trim() || form.sealNo.trim() ? `${form.bagNo.trim()} / ${form.sealNo.trim()}` : "—";

  return (
    <TillDialog
      open
      size="normal"
      busy={busy}
      title={words.title}
      headExtra={<TonePill tone={words.voucherTone}>{words.voucher}</TonePill>}
      onClose={onClose}
      onKey={(event) => {
        if (event.key === "F10" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
          event.preventDefault();
          if (!problem && !busy) void post();
        }
      }}
      footer={
        <>
          <p className={cx(styles.warn, styles.spacer)}>{problem}</p>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>
            Esc
          </button>
          <button
            id="till-move-post"
            type="button"
            className={styles.primaryButton}
            disabled={busy || problem !== ""}
            onClick={() => void post()}
          >
            {busy ? "Posting…" : "F10  Post"}
          </button>
        </>
      }
    >
      <div className={styles.buttonRow} role="tablist" aria-label="Movement">
        {MOVEMENT_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={form.mode === mode}
            className={cx(styles.secondaryButton, form.mode === mode && styles.modeButtonOn)}
            disabled={busy}
            onClick={() => setMode(mode)}
          >
            {MODE_TITLES[mode]}
          </button>
        ))}
      </div>

      <div className={styles.formGrid}>
        {paidIn || pickup ? (
          <>
            <label className={styles.formLabel} htmlFor="till-move-reason">
              Reason *
            </label>
            <select
              id="till-move-reason"
              className={styles.select}
              value={form.reasonId}
              autoFocus
              onChange={(event) => update({ reasonId: event.target.value })}
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
              Ledger
            </label>
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
          </>
        ) : null}
        {!paidIn ? (
          <>
            <span className={styles.formLabel}>{words.safeCaption}</span>
            <span className={styles.muted}>the counter&apos;s safe, else the branch default</span>
          </>
        ) : null}
        {drop ? (
          <>
            <label className={styles.formLabel} htmlFor="till-move-amount">
              Declared amount *
            </label>
            <input
              id="till-move-amount"
              className={cx(styles.input, styles.number)}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={amountText}
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
              onChange={(event) => update({ sealNo: event.target.value })}
            />
          </>
        ) : null}
        {showRef ? (
          <>
            <label className={styles.formLabel} htmlFor="till-move-ref">
              Ref no
            </label>
            <input
              id="till-move-ref"
              className={styles.input}
              data-uppercase="off"
              maxLength={50}
              autoComplete="off"
              value={form.refNo}
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
              className={styles.input}
              maxLength={150}
              autoComplete="off"
              value={form.partyName}
              onChange={(event) => update({ partyName: event.target.value })}
            />
          </>
        ) : null}
        <label className={styles.formLabel} htmlFor="till-move-notes">
          Notes
        </label>
        <input
          id="till-move-notes"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          autoFocus={topUp}
          value={form.notes}
          onChange={(event) => update({ notes: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && counted) {
              event.preventDefault();
              focusFirstQty(idPrefix);
            }
          }}
        />
      </div>

      {counted ? (
        <>
          <DenomCount
            idPrefix={idPrefix}
            denominations={denominations}
            loading={denomsLoading}
            value={form.count}
            onChange={(count) => update({ count })}
            disabled={busy}
            onDone={() => document.getElementById("till-move-post")?.focus()}
          />
          <div className={styles.summary}>
            <div className={styles.fact}>
              <span className={styles.cap}>{words.totalCaption}</span>
              <span className={styles.figure}>{formatMoney(amount)}</span>
            </div>
            <div className={styles.fact}>
              <span className={styles.cap}>TIME</span>
              <span className={styles.val}>{time}</span>
            </div>
            {pickup ? (
              <div className={styles.fact}>
                <span className={styles.cap}>BAG / SEAL</span>
                <span className={styles.val}>{bagSeal}</span>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {pickup || topUp ? (
        <div className={styles.band}>
          <div className={styles.bandRow}>
            <TonePill tone="amber">APPROVAL</TonePill>
            <span className={styles.code}>{words.signRule}</span>
          </div>
          <div className={styles.formGrid}>
            <span className={styles.formLabel}>Supervisor</span>
            <span className={styles.val}>{words.supervisor}</span>
            <span className={styles.formLabel}>Witness</span>
            <span className={styles.val}>{words.witness}</span>
          </div>
          <p className={styles.muted}>{SIGN_NOTE}</p>
        </div>
      ) : null}

      <span className={styles.code}>{words.postHint}</span>
      <p className={styles.muted}>{words.modeNote}</p>
    </TillDialog>
  );
}
