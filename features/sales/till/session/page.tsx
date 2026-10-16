"use client";

/**
 * Open Till (S1, menu 272) — Qt `TillOpenSessionDialog`, as a screen.
 *
 * One read, `GET /till/sessions/open-check`, says everything (the business
 * day, the counter, a session this device already holds, this cashier's
 * session elsewhere, the carried float). Ctrl+Enter posts `/till/sessions/open`; a
 * session this device already holds is offered for Resume on the right (a
 * SUSPENDED one through `/sessions/resume`). Either way the till session
 * store is set (Qt `AppSession::setTillSession` + `tillSessionChanged`) and the
 * screen closes.
 *
 * The live panel also carries this cashier's End shift (S4), Cash movement
 * (S3) and — the Qt Till menu's line 8, whose strip is placed on no screen —
 * Suspend — and, on this cashier's own session, what a supervisor took out
 * of or put into the drawer (Qt 2026-10-12), so it is questioned before the
 * count.
 *
 * Qt c77f3f1: a session PENDING_APPROVAL holds the drawer until a supervisor
 * decides, so while the panel shows that wait the screen looks again every
 * 15 s (visible, nothing posting, no dialog over it) with the QUIET reads —
 * a polled GET-as-mutation would fire the data-freshness bus on every tick.
 * A live session of an earlier business date is said so, and Resume refuses it.
 *
 * Qt bec3f98: a refusal is said in plain words — "this PC cannot hold a
 * till" (TILL_DEVICE_*) on the screen's warning line, any other in the popup —
 * and while the live panel greys the open form, its first live button holds
 * the cursor.
 *
 * Keys: Enter = next field · Ctrl+Enter = open (from any field; Qt
 * 2026-10-12, was F10) · F5 = reload · Esc = not now. Every figure box
 * selects its text on focus.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/components/design-system/cx";
import RefusalText from "@/components/feedback/refusal-text";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import type { ApiRefusal } from "@/lib/api/error-text";
import { getAuthUserId, getUserInfo } from "@/lib/auth/session";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { EMPTY_COUNT, toDenominations, type Denomination } from "../shared/denom";
import { tillErrorOf } from "../shared/errors";
import { OPEN_TILL_HREF } from "../shared/format";
import { amountInputPaise, formatMoney, isAmountDraft, paiseOf, paiseToInput } from "../shared/money";
import { reasonGridParams, reasonsOf, toReasons, type TillReason } from "../shared/reasons";
import { selectOnFocus } from "../shared/select-on-focus";
import { getTillSession, patchTillSessionStatus, setTillSession } from "../shared/session-store";
import { TonePill, overlayOpen } from "../shared/till-dialog";
import { refFromPayload, revalidateTillSession, useTillSession } from "../shared/use-till-session";
import type { TillOpenCheck, TillSessionKey, TillSessionPayload } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { CashMovementDialog } from "./cash-movement-dialog";
import { DenomCount, focusFirstQty } from "./denom-count";
import { EndShiftDialog } from "./end-shift-dialog";
import { refusalLine } from "./refusal-line";
import { SupervisorMoves } from "./supervisor-moves";
import {
  FORCE_CLOSE_TIP,
  LIVE_DATE_UNKNOWN,
  MISMATCH_NOTE,
  WAIT_POLL_MS,
  businessDateText,
  carriedAvailable,
  carriedFromOf,
  carriedLabel,
  chosenCounter,
  chosenCounterId,
  counterDisplay,
  dayText,
  floatWords,
  isCarried,
  isDeviceRefusal,
  liveDateOf,
  liveFacts,
  livePanelOf,
  openBody,
  openFigures,
  openProblem,
  resumePlan,
  waitPollDue,
  type OpenTillForm,
  type OpenTillInputs,
} from "./open-till";

const ID_PREFIX = "till-open";

/** The page is on screen (not a background browser tab): the wait re-check runs only then. */
function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const pageVisible = () => document.visibilityState !== "hidden";
const pageVisibleOnServer = () => true;

/** A warning popup whose text keeps its paragraph break. */
function warnLines(text: string) {
  toast.warn(<span style={{ whiteSpace: "pre-line" }}>{text}</span>);
}

const EMPTY_FORM: OpenTillForm = {
  pickedCounterId: "",
  floatChoice: "ISSUED",
  issuedPaise: 0,
  count: EMPTY_COUNT,
  reasonId: "",
};

export default function OpenTillScreen() {
  const router = useRouter();
  const client = useTillSessionClient();
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const { permissions } = usePagePermissions({ href: OPEN_TILL_HREF });
  const held = useTillSession();
  const me = getAuthUserId() ?? "";
  const cashier = getUserInfo()?.userName ?? "—";

  const [check, setCheck] = useState<TillOpenCheck | null>(null);
  const [checkError, setCheckError] = useState("");
  /** A device refusal ("this PC cannot hold a till"): said on the screen, in plain words (Qt bec3f98). */
  const [checkRefusal, setCheckRefusal] = useState<ApiRefusal | null>(null);
  const [form, setForm] = useState<OpenTillForm>(EMPTY_FORM);
  const [issuedText, setIssuedText] = useState("");
  const [denominations, setDenominations] = useState<Denomination[]>([]);
  const [denomsLoading, setDenomsLoading] = useState(true);
  const [reasons, setReasons] = useState<TillReason[]>([]);
  /** The live session's facts (`/sessions/get`), by the session they were read for. */
  const [livePayload, setLivePayload] = useState<{ tssId: string; payload: TillSessionPayload } | null>(null);
  /**
   * The live session's business date, `yyyy-MM-dd` (Qt `m_liveDate`), by
   * session: from the facts read, or Resume's own read ("?" = it came back
   * blank — the server judges). A session's business date never changes.
   */
  const [liveDate, setLiveDate] = useState<{ tssId: string; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [endShiftKey, setEndShiftKey] = useState<TillSessionKey | null>(null);
  const [movementKey, setMovementKey] = useState<TillSessionKey | null>(null);
  /** Bumped on every open-check answer: arms the next wait re-check, and COUNTING focuses Continue count. */
  const [checkTick, setCheckTick] = useState(0);
  /** Bumped by a wait re-check that failed: it looks again, the screen as it was. */
  const [waitTick, setWaitTick] = useState(0);
  /**
   * Bumped on every open-check answer but the quiet re-check: the supervisor's
   * movements re-read with it (Qt showLivePanel). Nothing moves cash while the
   * session waits for its approver, and a grid read is a mutation (it would
   * announce a data change every 15 s).
   */
  const [movesTick, setMovesTick] = useState(0);
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, pageVisibleOnServer);
  /** open-check reads in flight: the wait re-check skips a tick while one is out. */
  const reading = useRef(0);
  /** The picked counter, as the last open-check was asked with. */
  const pickedRef = useRef("");
  const generation = useRef(0);
  const openButton = useRef<HTMLButtonElement | null>(null);
  const reasonSelect = useRef<HTMLSelectElement | null>(null);
  const endShiftButton = useRef<HTMLButtonElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const resumeButton = useRef<HTMLButtonElement | null>(null);
  const movementButton = useRef<HTMLButtonElement | null>(null);

  const inputs: OpenTillInputs = { check, checkError, form, denominations, reasons, me };
  const deviceSessionId = check?.deviceSession?.sessionId ?? "";
  const knownLiveDate = liveDate && liveDate.tssId === deviceSessionId ? liveDate.date : "";
  const live = livePanelOf(check, me, knownLiveDate);
  const carried = isCarried(inputs);
  const figures = openFigures(inputs);
  const problem = openProblem(inputs);
  const words = floatWords(carried);
  const counterView = counterDisplay(check);
  const carriedFrom = carriedFromOf(check, form.pickedCounterId);
  const facts = liveFacts(livePayload && livePayload.tssId === deviceSessionId ? livePayload.payload : null);
  const canOpen = !busy && problem === "" && permissions.canCreate;
  const noScope = !companyId || !branchId;

  // ── Loading ─────────────────────────────────────────────────────────────
  const applyCheck = useCallback(
    (data: TillOpenCheck, quiet: boolean) => {
      const ticket = generation.current;
      setCheck(data);
      setCheckError("");
      setCheckRefusal(null);
      setCheckTick((tick) => tick + 1);
      if (!quiet) setMovesTick((tick) => tick + 1);
      const counter = chosenCounter(data, pickedRef.current);
      setForm((current) => {
        const next = { ...current, pickedCounterId: chosenCounterId(data, pickedRef.current) };
        // Nothing to carry: back to issued.
        if (!carriedFromOf(data, pickedRef.current)) next.floatChoice = "ISSUED";
        // The counter's default float fills the Issued box on every answer (Qt).
        if (counter) next.issuedPaise = paiseOf(counter.defaultFloat);
        return next;
      });
      if (counter) setIssuedText(paiseToInput(paiseOf(counter.defaultFloat)));
      // The live session's facts: bills, float, the cash gauge (a nicety) —
      // and its business date. A read blanks the facts until they land (Qt);
      // the quiet re-check keeps them, so they do not flicker every 15 s.
      if (!quiet) setLivePayload(null);
      const mine = data.deviceSession;
      if (mine) {
        const key = { companyId, branchId, accYear: mine.accYear, tssId: mine.sessionId };
        (quiet ? client.getQuiet(key) : client.get(key))
          .then((payload) => {
            if (ticket !== generation.current) return;
            setLivePayload({ tssId: mine.sessionId, payload });
            setLiveDate({ tssId: mine.sessionId, date: liveDateOf(payload) });
          })
          .catch(() => undefined);
      }
    },
    [branchId, client, companyId],
  );

  /** `quiet` — the wait re-check: the quiet reads, and a failure leaves the screen as it was. */
  const loadCheck = useCallback(
    async (counterId: string, quiet = false) => {
      if (!companyId || !branchId) return;
      const ticket = (generation.current += 1);
      reading.current += 1;
      try {
        const scope = { companyId, branchId, counterId: counterId || undefined };
        const data = await (quiet ? client.openCheckQuiet(scope) : client.openCheck(scope));
        if (ticket === generation.current) applyCheck(data, quiet);
      } catch (error) {
        if (ticket !== generation.current) return;
        if (quiet) {
          // Looks again in 15 s; F5 says what went wrong.
          setWaitTick((tick) => tick + 1);
          return;
        }
        setCheck(null);
        const { refusal } = tillErrorOf(error, "The till could not be checked.");
        setCheckError(refusalLine(refusal, "The till could not be checked."));
        // The answers that mean "this PC cannot hold a till" stay on the
        // screen; any other refusal is a popup (Qt bec3f98).
        if (isDeviceRefusal(refusal.code)) {
          setCheckRefusal(refusal);
        } else {
          setCheckRefusal(null);
          toast.apiError(error, { fallback: "The till could not be checked." });
        }
      } finally {
        reading.current -= 1;
      }
    },
    [applyCheck, branchId, client, companyId],
  );

  const reload = useCallback(() => void loadCheck(pickedRef.current), [loadCheck]);

  // ── Waiting for the approver ────────────────────────────────────────────
  // A count out of tolerance leaves the session PENDING_APPROVAL: it holds the
  // drawer until a supervisor decides in Till Sessions (273). Single-shot,
  // armed again by every answer that still shows the wait (Qt m_waitPoll).
  const pollDue = waitPollDue(live, { visible, busy, dialogOpen: endShiftKey !== null || movementKey !== null });
  useEffect(() => {
    if (!pollDue) return;
    const timer = window.setTimeout(() => {
      // A read already out answers instead — and arms the next look.
      if (reading.current > 0) return;
      void loadCheck(pickedRef.current, true);
    }, WAIT_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [pollDue, checkTick, waitTick, loadCheck]);

  // Billing ended and the drawer waits for its count: Continue count takes the
  // focus on every answer that says so (Qt showLivePanel) — also when the
  // approver's decision lands while the screen is open.
  const counting = live?.counting ?? false;
  useEffect(() => {
    if (!counting || overlayOpen()) return;
    endShiftButton.current?.focus();
  }, [counting, checkTick]);

  // The live panel greys the open form, so the cursor it held is gone: put it
  // on the panel's first live button (Resume, Continue count / End shift,
  // Cash movement), so Enter still reaches the screen (Qt bec3f98). A cursor
  // that is still on a live control stays where it is.
  const liveShown = live !== null;
  useEffect(() => {
    if (!liveShown || overlayOpen()) return;
    const active = document.activeElement;
    const page = pageRef.current;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      page?.contains(active) &&
      !active.matches(":disabled") &&
      active.getClientRects().length > 0
    ) {
      return;
    }
    for (const button of [resumeButton.current, endShiftButton.current, movementButton.current]) {
      if (button && !button.disabled && button.getClientRects().length > 0) {
        button.focus();
        return;
      }
    }
  }, [liveShown, checkTick, busy]);

  useEffect(() => {
    if (!companyId || !branchId) return;
    let cancelled = false;
    void loadCheck(pickedRef.current);
    // The held session, re-read: closed elsewhere means it is gone here too.
    void revalidateTillSession(client);
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
    // FLOAT_MISMATCH reasons. No reasons: the band says a reason is needed and Open waits.
    client
      .gridRows("tillReasonList", reasonGridParams(companyId, false))
      .then((rows) => {
        if (!cancelled) setReasons(reasonsOf(toReasons(rows), "FLOAT_MISMATCH"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [branchId, client, companyId, loadCheck]);

  // ── Verbs ───────────────────────────────────────────────────────────────
  const close = useCallback(() => router.back(), [router]);

  const adopt = useCallback(
    (payload: TillSessionPayload) => {
      setTillSession(refFromPayload(payload, { companyId, branchId }));
      toast.success(`Session ${payload.tssSessionNo} is yours — billing can take money.`);
      close();
    },
    [branchId, close, companyId],
  );

  // The verbs read this render's state; the key handler reaches them through a ref.
  const openSession = async () => {
    if (busy) return;
    if (problem) {
      toast.warn(problem);
      return;
    }
    setBusy(true);
    try {
      adopt(await client.open(openBody(inputs, { companyId, branchId })));
    } catch (error) {
      const refusal = tillErrorOf(error, "The session could not be opened.");
      toast.apiError(error, { fallback: "The session could not be opened." });
      // Someone took the counter (or the cashier opened elsewhere) meanwhile.
      if (["TILL_COUNTER_BUSY", "TILL_OPERATOR_BUSY", "TILL_NO_FREE_COUNTER"].includes(refusal.code)) reload();
    } finally {
      setBusy(false);
    }
  };

  const resumeSession = async () => {
    const s = check?.deviceSession;
    if (!s || busy) return;
    let plan = resumePlan(check, me, knownLiveDate);
    if (plan.kind === "readDate") {
      // The live panel's sessions/get has not answered yet: its business date decides.
      let date: string;
      setBusy(true);
      try {
        const payload = await client.get({ companyId, branchId, accYear: s.accYear, tssId: s.sessionId });
        date = liveDateOf(payload) || LIVE_DATE_UNKNOWN;
      } catch (error) {
        toast.apiError(error, { fallback: "The session could not be read." });
        return;
      } finally {
        setBusy(false);
      }
      setLiveDate({ tssId: s.sessionId, date });
      plan = resumePlan(check, me, date);
    }
    if (plan.kind === "dayEnded") {
      warnLines(plan.text);
      return;
    }
    if (plan.kind === "adopt") {
      // OPEN: nothing to tell the server — the session is simply this app's again.
      setTillSession({
        id: s.sessionId,
        accYear: s.accYear,
        sessionNo: s.sessionNo,
        counterId: s.counterId,
        counterCode: s.counterCode,
        status: s.status,
        companyId,
        branchId,
      });
      toast.success(`Session ${s.sessionNo} is yours — billing can take money.`);
      close();
      return;
    }
    if (plan.kind !== "resume") return;
    setBusy(true);
    try {
      adopt(await client.resume({ companyId, branchId, accYear: s.accYear, tssId: s.sessionId }));
    } catch (error) {
      toast.apiError(error, { fallback: "The session could not be resumed." });
    } finally {
      setBusy(false);
    }
  };

  /** The Till menu's Suspend: a break — nothing is billed until it is resumed. */
  const suspendSession = async () => {
    const s = check?.deviceSession;
    if (!s || busy) return;
    setBusy(true);
    try {
      const payload = await client.suspend({ companyId, branchId, accYear: s.accYear, tssId: s.sessionId });
      if (getTillSession()?.id === s.sessionId) patchTillSessionStatus(s.sessionId, payload.tssStatus);
      toast.success(`Session ${payload.tssSessionNo} suspended — nothing is billed until you resume.`);
      reload();
    } catch (error) {
      toast.apiError(error, { fallback: "The session could not be suspended." });
    } finally {
      setBusy(false);
    }
  };

  const liveKey: TillSessionKey | null = check?.deviceSession
    ? { companyId, branchId, accYear: check.deviceSession.accYear, tssId: check.deviceSession.sessionId }
    : null;

  // ── Keys ────────────────────────────────────────────────────────────────
  const keys = useRef({ canOpen, openSession, reload, close });
  useEffect(() => {
    keys.current = { canOpen, openSession, reload, close };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overlayOpen()) return;
      if (event.altKey || event.metaKey || event.shiftKey) return;
      if (event.ctrlKey) {
        // Ctrl+Enter opens from every field (the boxes' own Enter handlers let it pass).
        if (event.key === "Enter") {
          event.preventDefault();
          if (keys.current.canOpen) void keys.current.openSession();
        }
        return;
      }
      if (event.key === "F5") {
        // Never the browser's reload: it would drop the count on screen.
        event.preventDefault();
        keys.current.reload();
      } else if (event.key === "Escape") {
        event.preventDefault();
        keys.current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const afterCount = () => {
    if (figures.mismatch && reasonSelect.current) reasonSelect.current.focus();
    else openButton.current?.focus();
  };

  const warnText = checkError || problem;

  return (
    <div ref={pageRef} className={styles.page}>
      <div className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Open Till Session</h1>
          <p className={styles.subtitle}>
            {held ? `This tab holds session ${held.sessionNo} (${held.status}).` : "Count the float into the drawer and open the till on this device."}
          </p>
        </div>
        {!live ? <TonePill tone="blue">NEW SESSION</TonePill> : null}
      </div>

      {noScope ? <p className={cx(styles.warn, styles.warnDanger)}>Choose a company and a branch in the header first.</p> : null}

      <div className={styles.scroll}>
        <div className={styles.columns}>
          <section className={styles.card} aria-label="Open Till Session">
            <fieldset disabled={live !== null || busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: "contents" }}>
              <div className={styles.facts} aria-disabled={live !== null}>
                <div className={styles.fact}>
                  <span className={styles.cap}>Counter</span>
                  {counterView.kind === "text" ? (
                    <span className={styles.val}>{counterView.text}</span>
                  ) : (
                    <select
                      className={styles.select}
                      aria-label="Counter"
                      value={form.pickedCounterId}
                      autoFocus={!live}
                      onChange={(event) => {
                        pickedRef.current = event.target.value;
                        setForm((current) => ({ ...current, pickedCounterId: event.target.value }));
                        // Its carried float comes back with it.
                        void loadCheck(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.ctrlKey) {
                          event.preventDefault();
                          document.getElementById(`${ID_PREFIX}-issued`)?.focus();
                        }
                      }}
                    >
                      {counterView.placeholder ? <option value="">{counterView.placeholder}</option> : null}
                      {counterView.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className={styles.fact}>
                  <span className={styles.cap}>Business date</span>
                  <span className={styles.val}>{businessDateText(check)}</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.cap}>Cashier</span>
                  <span className={styles.val}>{cashier}</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.cap}>Session no</span>
                  <span className={styles.val}>given on open</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.cap}>Day</span>
                  <span className={styles.val}>{dayText(check)}</span>
                </div>
              </div>

              <div className={styles.sectionHead}>
                <span className={styles.sectionCap}>OPENING FLOAT</span>
                <span className={styles.code}>{words.mode}</span>
              </div>
              <div className={styles.radioRow}>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name="till-open-float"
                    checked={!carried}
                    onChange={() => setForm((current) => ({ ...current, floatChoice: "ISSUED" }))}
                  />
                  Issued from the safe
                </label>
                <label className={styles.radio} aria-disabled={!carriedAvailable(inputs)}>
                  <input
                    type="radio"
                    name="till-open-float"
                    checked={carried}
                    disabled={!carriedAvailable(inputs)}
                    onChange={() => setForm((current) => ({ ...current, floatChoice: "CARRIED" }))}
                  />
                  {carriedLabel(carriedFrom)}
                </label>
              </div>
              <div className={styles.inlineRow}>
                <label className={styles.formLabel} htmlFor={`${ID_PREFIX}-issued`}>
                  {words.caption}
                </label>
                <input
                  id={`${ID_PREFIX}-issued`}
                  className={cx(styles.input, styles.number)}
                  style={{ width: 140 }}
                  inputMode="decimal"
                  autoComplete="off"
                  readOnly={carried}
                  value={carried ? paiseToInput(figures.issued) || "0" : issuedText}
                  autoFocus={!live && counterView.kind === "text"}
                  onFocus={selectOnFocus}
                  onChange={(event) => {
                    const text = event.target.value.trim();
                    if (!isAmountDraft(text)) return;
                    setIssuedText(text);
                    setForm((current) => ({ ...current, issuedPaise: amountInputPaise(text) }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.ctrlKey) {
                      event.preventDefault();
                      focusFirstQty(ID_PREFIX);
                    }
                  }}
                />
                {!carried ? (
                  <>
                    <span className={styles.formLabel}>From safe</span>
                    <span className={styles.muted}>the counter&apos;s safe, else the branch default</span>
                  </>
                ) : null}
                <span className={styles.code}>{words.postHint}</span>
              </div>

              <div className={styles.sectionHead}>
                <span className={styles.sectionCap}>COUNT THE DRAWER</span>
                <span className={styles.code}>every note and coin — the count is kept</span>
              </div>
              <DenomCount
                idPrefix={ID_PREFIX}
                denominations={denominations}
                loading={denomsLoading}
                value={form.count}
                onChange={(count) => setForm((current) => ({ ...current, count }))}
                disabled={live !== null || busy}
                onDone={afterCount}
              />
              <div className={styles.summary} aria-disabled={live !== null}>
                <div className={styles.fact}>
                  <span className={styles.cap}>ISSUED</span>
                  <span className={styles.figure}>{formatMoney(figures.issued)}</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.cap}>COUNTED</span>
                  <span className={styles.figure}>{formatMoney(figures.counted)}</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.cap}>DIFFERENCE</span>
                  <span
                    className={cx(
                      styles.figure,
                      figures.diffTone === "danger" && styles.toneRed,
                      figures.diffTone === "warning" && styles.toneAmber,
                      figures.diffTone === "success" && styles.toneGreen,
                    )}
                  >
                    {figures.diffText}
                  </span>
                </div>
                <p className={styles.muted}>settled now, owned now — never carried into the close</p>
              </div>

              {figures.mismatch ? (
                <div className={styles.band} aria-disabled={live !== null}>
                  <div className={styles.bandRow}>
                    <TonePill tone="amber">APPROVAL</TonePill>
                    <span className={styles.code}>FLOAT_MISMATCH</span>
                    <span className={styles.spacer}>an opening difference — posted at open under its reason</span>
                    <span className={cx(styles.figure, figures.short ? styles.toneRed : styles.toneAmber)}>
                      {figures.diffText.replace(/ {2}(short|over)$/, "")}
                    </span>
                  </div>
                  <div className={styles.inlineRow}>
                    <label className={styles.formLabel} htmlFor={`${ID_PREFIX}-reason`}>
                      Reason *
                    </label>
                    <select
                      id={`${ID_PREFIX}-reason`}
                      ref={reasonSelect}
                      className={styles.select}
                      value={form.reasonId}
                      onChange={(event) => setForm((current) => ({ ...current, reasonId: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.ctrlKey) {
                          event.preventDefault();
                          openButton.current?.focus();
                        }
                      }}
                    >
                      <option value="">Pick a reason</option>
                      {reasons.map((reason) => (
                        <option key={reason.id} value={reason.id}>
                          {reason.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className={styles.muted}>{MISMATCH_NOTE}</p>
                </div>
              ) : null}
            </fieldset>

            <p className={cx(styles.warn, checkError && styles.warnDanger)}>
              {checkRefusal ? <RefusalText refusal={checkRefusal} /> : warnText}
            </p>
            <div className={styles.buttonRow}>
              <span className={styles.spacer} />
              <button type="button" className={styles.secondaryButton} onClick={close}>
                Esc  Not now
              </button>
              <button
                ref={openButton}
                type="button"
                className={styles.primaryButton}
                disabled={!canOpen}
                title={!permissions.canCreate ? "No create right on Open Till" : problem}
                onClick={() => void openSession()}
              >
                {busy ? "Opening…" : "Open - Ctrl+Enter"}
              </button>
            </div>
          </section>

          {live ? (
            <section className={cx(styles.card, styles.cardLive)} aria-label={live.title}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>{live.title}</h2>
                <span className={styles.spacer} />
                {live.resumable ? <TonePill tone="blue">RESUME</TonePill> : null}
              </div>
              <span className={styles.strong}>{live.head}</span>
              <p
                className={cx(styles.muted, live.textTone === "warning" && styles.toneAmber)}
                style={{ whiteSpace: "pre-line" }}
              >
                {live.text}
              </p>
              <div className={styles.facts}>
                <div className={styles.fact}>
                  <span className={styles.cap}>BILLS</span>
                  <span className={styles.val}>{live.onThisDevice ? facts.bills : "—"}</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.cap}>FLOAT</span>
                  <span className={styles.val}>{live.onThisDevice ? facts.float : "—"}</span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.cap}>CASH GAUGE</span>
                  <span className={cx(styles.val, facts.gaugeWarn && styles.toneAmber)}>{live.onThisDevice ? facts.gauge : "—"}</span>
                </div>
              </div>
              <div className={styles.buttonRow}>
                {live.showForceClose ? (
                  <button type="button" className={styles.dangerButton} disabled title={FORCE_CLOSE_TIP}>
                    Supervisor: force close…
                  </button>
                ) : null}
                {live.showSuspend ? (
                  <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void suspendSession()}>
                    Suspend
                  </button>
                ) : null}
                {live.showCashMovement ? (
                  <button
                    ref={movementButton}
                    type="button"
                    className={styles.secondaryButton}
                    disabled={!live.cashMovementEnabled || busy}
                    onClick={() => setMovementKey(liveKey)}
                  >
                    Cash movement
                  </button>
                ) : null}
                {live.showEndShift ? (
                  <button
                    ref={endShiftButton}
                    type="button"
                    className={styles.secondaryButton}
                    disabled={!live.endShiftEnabled || busy}
                    onClick={() => setEndShiftKey(liveKey)}
                  >
                    {live.endShiftLabel}
                  </button>
                ) : null}
                {live.showResume ? (
                  <button
                    ref={resumeButton}
                    type="button"
                    className={styles.primaryButton}
                    disabled={!live.resumable || busy}
                    autoFocus={live.resumable}
                    onClick={() => void resumeSession()}
                  >
                    Enter  Resume
                  </button>
                ) : null}
              </div>
              <SupervisorMoves tssId={live.supervisorMovesTssId} reloadKey={movesTick} />
              {live.note ? <p className={styles.muted}>{live.note}</p> : null}
            </section>
          ) : null}
        </div>
      </div>

      <CashMovementDialog
        sessionKey={movementKey}
        initialMode="DROP"
        onClose={() => {
          setMovementKey(null);
          reload();
        }}
      />
      <EndShiftDialog
        sessionKey={endShiftKey}
        onClose={() => {
          // When it closes, this screen is the open screen again.
          setEndShiftKey(null);
          reload();
        }}
      />
    </div>
  );
}
