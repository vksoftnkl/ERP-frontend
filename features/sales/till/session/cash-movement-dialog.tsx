"use client";

/**
 * Cash Movement (S3, rev 2) — Qt `TillCashMovementDialog`: drop · paid in ·
 * pickup · top-up, one `POST /till/movements/create` each.
 *
 * Opened from Open Till's live panel on this device's own session (Drop
 * first). Every kind is entered there, logged in as the session's cashier
 * (notes 110): the dialog refuses anyone else. What it decides is
 * `cash-movement.ts`; this file draws it and talks to the server.
 *
 * The 2026-10-12 layout: the four mode tiles (a name and what it is), the
 * form on the left and a summary card on the right, the count under both.
 * A pickup or top-up is a hand-over (notes 110): under the count, the
 * supervisor standing there picks their name and types their own till PIN,
 * which signs the counted amount. A refusal on either clears the PIN and
 * puts the focus back on the box it names. With no drop safe on the counter
 * the Drop tile is off and the dialog opens on Pickup instead.
 *
 * Keys: Ctrl+Enter (or F10) posts, Ctrl+1..4 pick the mode, Enter walks the
 * form into the count, then the supervisor and their PIN; Esc closes.
 *
 * Post & print (Qt 3b5069d, notes 135): once posted, the dialog asks to print
 * the slip both people sign; yes puts the print dialog (purpose
 * TILL_MOVEMENT) over the posted form, and the dialog closes when that one
 * does — no otherwise, as before. `onPosted` fires before the question.
 */
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import type { ApiRefusal } from "@/lib/api/error-text";
import { getAuthUserId } from "@/lib/auth/session";
import { confirm } from "@/lib/confirm";
import { clock12Of } from "@/lib/time-format";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { getMessages, subscribeToMessages, toast } from "@/lib/notify";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE, type DocumentPrintTarget } from "@/features/printing/domain/documentPrint";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { EMPTY_COUNT, toDenominations, type Denomination } from "../shared/denom";
import { tillErrorOf } from "../shared/errors";
import { amountInputPaise, formatMoney, isAmountDraft } from "../shared/money";
import { reasonGridParams, toReasons, type TillReason } from "../shared/reasons";
import { selectOnFocus } from "../shared/select-on-focus";
import { TillDialog, TonePill } from "../shared/till-dialog";
import type { TillSessionKey, TillSessionPayload, TillSupervisor } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import {
  MODE_LINES,
  MODE_TITLES,
  MOVEMENT_MODES,
  SIGN_HINT,
  dropTileTitle,
  emptyMovementForm,
  hasDropSafe,
  isCounted,
  isHandOver,
  isPostKey,
  ledgerTip,
  modeForKey,
  movementAmount,
  movementBody,
  movementPrintQuestion,
  movementProblem,
  movementSlipTarget,
  movementStars,
  movementWords,
  openingMode,
  pickedSupervisor,
  reasonOptions,
  refVisible,
  slipLabel,
  summaryAccount,
  supervisorLabel,
  type MovementForm,
  type MovementInputs,
  type MovementMode,
} from "./cash-movement";
import { DenomCount, focusFirstQty } from "./denom-count";
import { refusalLine } from "./refusal-line";

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
const SUPERVISOR_ID = "till-move-supervisor";
const PIN_ID = "till-move-pin";
const POST_ID = "till-move-post";
/**
 * The form's Enter order; a field the mode hides is skipped. The supervisor
 * and their PIN are not in it: they come after the count (notes 110 — the
 * PIN signs the counted amount, so it is typed last).
 */
const ENTER_ORDER = [
  "till-move-reason",
  "till-move-ledger",
  "till-move-amount",
  "till-move-bag",
  "till-move-seal",
  "till-move-ref",
  "till-move-party",
  "till-move-notes",
];

/**
 * Focus an element once no message popup is up: the popup takes the focus
 * and gives none back, so a box focused under it would be left behind.
 */
function focusAfterMessages(id: string): void {
  const focus = () => {
    document.getElementById(id)?.focus();
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
  /** Who may sign a pickup / top-up here (notes 110); null while it is read. */
  const [supervisors, setSupervisors] = useState<TillSupervisor[] | null>(null);
  const [supervisorError, setSupervisorError] = useState("");
  /** Why the supervisor list did not load, in plain words for the footer line. */
  const [supervisorRefusal, setSupervisorRefusal] = useState<ApiRefusal | null>(null);
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [denomsLoading, setDenomsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /**
   * Posted, and the slip's print dialog is up (Qt 3b5069d): the form behind it
   * is done — nothing posts again, and Escape is the print dialog's.
   */
  const [slip, setSlip] = useState<{ docNo: string; target: DocumentPrintTarget } | null>(null);
  const locked = busy || slip !== null;
  /** The declared amount as typed (a drop): kept as text so "2000." survives a keystroke. */
  const [amountText, setAmountText] = useState("");
  /** The time the dialog opened, `hh:mm AM` (Qt c77f3f1 `hh:mm AP`). */
  const [time] = useState(() => clock12Of(new Date()));
  const me = getAuthUserId() ?? "";
  const companyId = sessionKey.companyId;

  useEffect(() => {
    let cancelled = false;
    client
      .get(sessionKey)
      .then((payload) => {
        if (cancelled) return;
        setSession(payload);
        // No drop safe: the Drop tile is off, so a dialog opened on it moves
        // to Pickup (the bag goes to a supervisor). Only Drop shows the typed
        // amount, and it cannot come back, so its text goes with it.
        setForm((current) => {
          const mode = openingMode(current.mode, payload);
          return mode === current.mode ? current : emptyMovementForm(mode, EMPTY_COUNT);
        });
        if (!hasDropSafe(payload)) setAmountText("");
      })
      .catch((error) => {
        if (!cancelled) toast.apiError(error, { fallback: "The session could not be read." });
      });
    // Notes 110: read on open whatever the mode, as Qt does; the server
    // re-checks the pick (and the PIN) on the post.
    client
      .supervisors(sessionKey)
      .then((rows) => {
        if (cancelled) return;
        setSupervisors(rows);
        setSupervisorError("");
        setSupervisorRefusal(null);
      })
      .catch((error) => {
        if (cancelled) return;
        const { refusal } = tillErrorOf(error, "The supervisor list did not load.");
        setSupervisorError(refusalLine(refusal, "The supervisor list did not load."));
        setSupervisorRefusal(refusal);
        setSupervisors([]);
      });
    client
      .denominations(companyId)
      .then((rows) => {
        if (!cancelled) setDenominations(toDenominations(rows));
      })
      .catch((error) => {
        if (!cancelled) toast.apiError(error, { fallback: "The denominations could not be read." });
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

  const inputs: MovementInputs = { form, session, reasons, denominations, me, supervisors, supervisorError };
  const problem = movementProblem(inputs);
  /** The footer line is the supervisor list's refusal: said in plain words (Qt ec9d92d inlineHtml). */
  const signerRefusal = supervisorRefusal && supervisorError && problem === supervisorError ? supervisorRefusal : null;
  const amount = movementAmount(inputs);
  const supervisor = pickedSupervisor(inputs);
  const words = movementWords(form.mode, session, supervisor ? supervisorLabel(supervisor) : "");
  const stars = movementStars(inputs);
  const options = useMemo(() => reasonOptions(form.mode, reasons), [form.mode, reasons]);
  const showRef = refVisible(form, reasons);
  const counted = isCounted(form.mode);
  const handOver = isHandOver(form.mode);
  const dropOk = hasDropSafe(session);
  const drop = form.mode === "DROP";
  const paidIn = form.mode === "PAID_IN";
  const pickup = form.mode === "PICKUP";
  const topUp = form.mode === "TOP_UP";
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  const update = (patch: Partial<MovementForm>) => setForm((current) => ({ ...current, ...patch }));

  const setMode = (mode: MovementMode) => {
    // Qt clears the count, the amount and every box (the supervisor and PIN too) on a mode change.
    setForm(emptyMovementForm(mode, EMPTY_COUNT));
    setAmountText("");
  };

  const post = async () => {
    if (locked) return;
    const why = movementProblem(inputs);
    if (why) {
      toast.warn(why);
      return;
    }
    setBusy(true);
    try {
      const result = await client.createMovement(movementBody(inputs, sessionKey));
      onPosted?.();
      // Post & print (TILL_DESIGN S3): the slip both people sign (notes 135).
      const print = await confirm({ title: "Cash Movement", message: movementPrintQuestion(result), confirmLabel: "Print slip" });
      if (print) {
        setSlip({ docNo: result.tcmDocNo, target: movementSlipTarget(result, sessionKey) });
        setBusy(false);
        return;
      }
      onClose();
    } catch (error) {
      const refusal = tillErrorOf(error, "The movement could not be posted.");
      // A supervisor refusal (TILL_SUPERVISOR_PIN / _REQUIRED / _NO_PIN on
      // supervisorPin; _SELF / _RIGHT on supervisorId): the message names it;
      // the PIN box is cleared for the next try and the focus goes back to
      // the box the server named.
      const signer = refusal.field === "supervisorPin" || refusal.field === "supervisorId";
      if (signer) update({ supervisorPin: "" });
      toast.apiError(error, { fallback: "The movement could not be posted." });
      setBusy(false);
      if (signer) focusAfterMessages(refusal.field === "supervisorId" ? SUPERVISOR_ID : PIN_ID);
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

  /** Enter on the supervisor's boxes: the pick, then the PIN, then Post. */
  const enterTo = (toId: string) => (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key !== "Enter" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    document.getElementById(toId)?.focus();
  };

  const bagSeal = form.bagNo.trim() || form.sealNo.trim() ? `${form.bagNo.trim()} / ${form.sealNo.trim()}` : "—";
  const star = (text: string, needed: boolean) => (needed ? `${text} *` : text);

  return (
    <>
    <TillDialog
      open
      size="normal"
      busy={locked}
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
          // Never the browser's own Ctrl+digit (a tab switch). Ctrl+1 is as
          // dead as the Drop tile when the counter has no drop safe.
          event.preventDefault();
          if (!locked && (mode !== "DROP" || dropOk)) setMode(mode);
          return;
        }
        if (isPostKey(event)) {
          event.preventDefault();
          if (!problem && !locked) void post();
        }
      }}
      footer={
        <>
          <p className={cx(styles.warn, styles.spacer, signerRefusal && styles.warnDanger)}>
            {signerRefusal ? <RefusalText refusal={signerRefusal} /> : problem}
          </p>
          <button type="button" className={cx(styles.secondaryButton, styles.verbButton)} disabled={locked} onClick={onClose}>
            Close - Esc
          </button>
          <button
            id={POST_ID}
            type="button"
            className={cx(styles.primaryButton, styles.verbButton)}
            disabled={locked || problem !== ""}
            onClick={() => void post()}
          >
            {busy ? "Posting…" : slip ? "Posted" : "Post - Ctrl+Enter"}
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
            title={mode === "DROP" ? dropTileTitle(session) : `Ctrl+${index + 1}`}
            className={cx(styles.secondaryButton, styles.modeTile, form.mode === mode && styles.modeButtonOn)}
            disabled={locked || (mode === "DROP" && !dropOk)}
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
          {handOver ? (
            <>
              <span className={styles.cap}>Given by</span>
              <span className={styles.val}>{words.givenBy || "—"}</span>
              <span className={styles.cap}>Received by</span>
              <span className={styles.val}>{words.receivedBy || "—"}</span>
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
            disabled={locked}
            onDone={() => document.getElementById(handOver ? SUPERVISOR_ID : POST_ID)?.focus()}
          />
        </>
      ) : null}

      {handOver ? (
        // After the count in the DOM too, so Tab walks count → supervisor →
        // PIN → Post as Enter does (Qt's tab order).
        <div className={styles.moveForm}>
          <label className={styles.formLabel} htmlFor={SUPERVISOR_ID}>
            Supervisor *
          </label>
          <select
            id={SUPERVISOR_ID}
            className={styles.select}
            value={form.supervisorId}
            onChange={(event) => update({ supervisorId: event.target.value })}
            onKeyDown={enterTo(PIN_ID)}
          >
            <option value="">Pick the supervisor</option>
            {(supervisors ?? []).map((row) => (
              <option key={row.userId} value={row.userId}>
                {supervisorLabel(row)}
              </option>
            ))}
          </select>
          <label className={styles.formLabel} htmlFor={PIN_ID}>
            Supervisor&apos;s PIN *
          </label>
          <input
            id={PIN_ID}
            type="password"
            className={styles.input}
            data-uppercase="off"
            maxLength={12}
            autoComplete="new-password"
            value={form.supervisorPin}
            onKeyDown={enterTo(POST_ID)}
            onChange={(event) => update({ supervisorPin: event.target.value })}
          />
          <p className={styles.moveHint} style={{ gridColumn: "2 / -1" }}>
            {SIGN_HINT}
          </p>
        </div>
      ) : null}
    </TillDialog>
    {slip ? (
      <PrintOptionsDialog
        open
        onClose={onClose}
        purposeCode={PURPOSE_CODE.TILL_MOVEMENT}
        documentLabel={slipLabel(slip.docNo)}
        targets={[slip.target]}
      />
    ) : null}
    </>
  );
}
