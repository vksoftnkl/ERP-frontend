"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cx } from "@/components/design-system/cx";
import { useBusinessContext } from "@/components/layout/business-context";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { getConfirmations } from "@/lib/confirm";
import { useDataRefresh, type DataRefreshReason } from "@/lib/data-freshness";
import { getMessages, toast } from "@/lib/notify";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { useAppSelector } from "@/store/hooks";
import { selectAppSettingText } from "@/store/slices/appSettingsSlice";
import { LiveCashLine } from "../shared/live-cash-line";
import { DayExceptionDialog } from "./components/day-exception-dialog";
import { DayGrid } from "./components/day-grid";
import { Checklist, DayNumbers, FactsStrip, VerdictBand, pillToneClass } from "./components/day-panels";
import { DayReopenDialog } from "./components/day-reopen-dialog";
import { booksChecks } from "./domain/books";
import { DAY_COLUMNS_FALLBACK, SESSION_COLUMNS_FALLBACK } from "./domain/columns";
import {
  dayButtons,
  dayLabelOf,
  dayPrintOf,
  exceptionClosedText,
  exceptionPages,
  reopenedText,
  type DayPrint,
  type ExceptionPage,
} from "./domain/day-close";
import {
  blankHead,
  dayHead,
  noDayHead,
  noDayReading,
  readDay,
  type DayReading,
  type RowsState,
} from "./domain/day-reading";
import {
  checkOfDay,
  cockpitHref,
  dayKeyOf,
  dayPickOf,
  sessionKeysOf,
  text,
  type DayCloseResult,
  type DayKey,
  type GridRow,
  type SessionKeys,
} from "./domain/wire";
import { useBusinessDay, type DayPick } from "./use-business-day";
import styles from "./page.module.scss";

/** The route this screen is governed by (menu 274, under 271 "Till"). */
export const BUSINESS_DAY_HREF = "/sales/till/business-day";

type Tab = "day" | "list";

/** What is up over the Day tab: one of the close's dialogs, or the print. */
type Dialog =
  | { kind: "exception"; key: DayKey; pages: readonly ExceptionPage[] }
  | { kind: "reopen"; key: DayKey; label: string }
  | { kind: "print"; print: DayPrint }
  | null;

const FOOT_NOTE =
  "On close the day is frozen and the store Z is issued: from then no session opens on it, and bills, " +
  "re-tenders, cash cancels and money documents dated it are refused.";

const REVALIDATE_ON: DataRefreshReason[] = ["focus", "visible", "reconnect", "manual"];

/** A dialog, a message or a grid-settings menu is up: the screen's keys belong to it. */
function overlayOpen(): boolean {
  return (
    getConfirmations().length > 0 ||
    getMessages().length > 0 ||
    document.querySelector('[aria-modal="true"]') !== null ||
    document.querySelector('[data-bd-grid-settings-active="true"]') !== null
  );
}

/** The day the URL names — where a cockpit's Back returns to. */
function pickFromUrl(): DayPick {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const tbdId = (params.get("tbdId") ?? "").trim();
  const accYear = (params.get("accYear") ?? "").trim();
  return tbdId && accYear ? { tbdId, accYear } : null;
}

/** The sessions grid never gets fewer rows than this, however long the checklist (Qt 425fa80). */
const SESSIONS_MIN_ROWS = 6;

/** Before a day is read the sessions grid waits; after a failed read it is empty. */
const SESSIONS_WAITING: RowsState = { status: "loading", rows: [] };
const SESSIONS_NOTHING: RowsState = { status: "ready", rows: [] };

function sessionRowKey(row: GridRow, index: number): string {
  return text(row.tss_id) || `session-${index}`;
}

function dayRowKey(row: GridRow, index: number): string {
  return text(row.tbd_id) || `day-${index}`;
}

/**
 * Business Day (menu 274, Sales › Till) — the store manager's day: Day Open,
 * the day's checklist and numbers, its sessions, and every past day on the
 * List tab. Ported from the Qt `TillBusinessDayEntry` (NexERP d5c3637,
 * mockup till_day_close_ui_mockup.png, TILL_DESIGN §8 S8).
 *
 * Built on `GET /till/days/get`, `POST /till/days/open`, three configured
 * grids, the live line (Qt a449b8c: every drawer still out at the branch, any
 * day, `../shared/live-cash.ts`) and, since Qt c77f3f1 (notes 117), the
 * server's close: its close-check drives the checklist and the buttons —
 * Close day (F10), Close with exception (the live drawers counted and
 * force-closed; since Qt bec3f98 also over the safe not counted, with nothing
 * live), Reopen day — all Business Day (274) EDIT. Print day X / store Z is
 * the TILL_DAY_Z print of the day. The safe's count and remittance are the
 * Cash Office's (menu 287): its rows jump there on the right tab.
 *
 * Qt 425fa80 (notes 126): the books against the till — the CASH tender's
 * ledger against the live drawers (today's day only), each safe's ledger
 * against its safe book — as two rows that never block; the green rows fold
 * under one "N checks OK" row, and the sessions grid keeps six rows.
 *
 * Keys (Qt): F5 Refresh checks (always today) · F8 Day ⇄ List · F10 Close day
 * · Enter on a session opens its cockpit, on a day opens that day · Esc closes.
 */
export default function BusinessDayScreen() {
  const router = useRouter();
  const { permissions } = usePagePermissions({ href: BUSINESS_DAY_HREF });
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const companyName = activeCompany?.name ?? "";
  const cutoff = useAppSelector((state) => selectAppSettingText(state, "till.day_cutoff"));
  const [initialPick] = useState(pickFromUrl);

  const model = useBusinessDay({
    companyId,
    branchId,
    cutoff,
    initialPick,
    canCreate: permissions.canCreate,
    canEdit: permissions.canEdit,
  });
  const {
    dayState,
    pick,
    sessions,
    liveSessions,
    safes,
    days,
    dayBusy,
    opening,
    closing,
    closeCheck,
    books,
    scopeReady,
  } = model;

  const [tab, setTab] = useState<Tab>("day");
  const [dialog, setDialog] = useState<Dialog>(null);
  const sessionsGridRef = useRef<HTMLDivElement | null>(null);
  const daysGridRef = useRef<HTMLDivElement | null>(null);

  // ── What the screen says ───────────────────────────────────────────────
  const headContext = useMemo(() => ({ companyName, cutoff }), [companyName, cutoff]);
  const head = useMemo(() => {
    if (dayState.kind === "day") return dayHead(dayState.day, headContext);
    if (dayState.kind === "none") return noDayHead(dayState.businessDate, headContext);
    return blankHead(headContext);
  }, [dayState, headContext]);
  const shownDay = dayState.kind === "day" ? dayState.day : null;
  // The server's close-check speaks only for the day it was read for.
  const check = checkOfDay(closeCheck.check, shownDay);
  const checkError = shownDay && closeCheck.tbdId === shownDay.tbdId ? closeCheck.error : "";
  const reading = useMemo<DayReading | null>(() => {
    // The live read answering rebuilds the checklist (Qt `updated` → `rebuild`).
    if (dayState.kind === "day") {
      const now = new Date();
      return readDay(sessions, safes, liveSessions, dayState.day.tbdBusinessDate, {
        day: dayState.day,
        check,
        checkError,
        now,
        books: booksChecks({ day: dayState.day, now, cash: books.cash, live: liveSessions, safes: books.safes }),
      });
    }
    if (dayState.kind === "none") return noDayReading();
    return null;
  }, [dayState, sessions, safes, liveSessions, check, checkError, books]);
  const buttons = dayButtons(shownDay, check, permissions.canEdit);
  const canCloseDay = buttons.closeDay.enabled && !closing;

  const canDayOpen = dayState.kind === "none" && permissions.canCreate && !opening;
  let dayOpenTitle: string | undefined;
  if (!permissions.canCreate) dayOpenTitle = "No create right on Business Day (menu 274)";
  else if (dayState.kind === "day") dayOpenTitle = "This business day is already open";

  // ── The URL carries a past day, so a cockpit's Back lands on it ────────
  useEffect(() => {
    if (dayState.kind !== "day" && dayState.kind !== "none") return;
    const url = new URL(window.location.href);
    const next = new URLSearchParams(url.search);
    next.delete("tbdId");
    next.delete("accYear");
    if (dayState.kind === "day" && pick) {
      next.set("tbdId", pick.tbdId);
      next.set("accYear", pick.accYear);
    }
    const search = next.toString();
    if (search === url.search.replace(/^\?/, "")) return;
    // A null state is what keeps Next's router in step with the address.
    window.history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
  }, [dayState, pick]);

  // ── Verbs ──────────────────────────────────────────────────────────────
  const close = useCallback(() => router.back(), [router]);

  const openSession = useCallback(
    (keys: SessionKeys) => {
      router.push(cockpitHref(keys));
    },
    [router],
  );

  const openSessionRow = useCallback(
    (row: GridRow) => {
      const keys = sessionKeysOf(row);
      if (keys) openSession(keys);
    },
    [openSession],
  );

  const openHref = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const { loadDay, refresh, retrySessions, revalidate, openDay, reloadDays, closeDay, reloadShown } = model;
  const openDayRow = useCallback(
    (row: GridRow) => {
      const picked = dayPickOf(row);
      if (!picked) return;
      setTab("day");
      void loadDay(picked);
    },
    [loadDay],
  );

  // The keyboard follows the tab: the grid of the tab now showing.
  const tabChanged = useRef(false);
  useEffect(() => {
    if (!tabChanged.current) {
      tabChanged.current = true;
      return;
    }
    (tab === "day" ? sessionsGridRef.current : daysGridRef.current)?.focus();
  }, [tab]);

  // Coming back to the tab re-reads the same day, quietly. Only the browser's
  // signals: a "mutation" is also every RTK mutation in the app (Day Open's
  // own included), and answering those would re-read on every save anywhere.
  useDataRefresh(revalidate, { enabled: scopeReady, reasons: REVALIDATE_ON });

  // ── Close with exception · Reopen day · Print ─────────────────────────
  const scope = useMemo(() => ({ companyId, branchId }), [companyId, branchId]);

  const openException = () => {
    if (!shownDay || !buttons.closeException.enabled) return;
    // No live session is fine (notes 118): the exception may cover only
    // SAFE_NOT_COUNTED, and the dialog then has nothing to count.
    const pages = exceptionPages(check, sessions.rows);
    setDialog({ kind: "exception", key: dayKeyOf(shownDay, scope), pages });
  };

  const openReopen = () => {
    if (!shownDay || !buttons.reopen.enabled) return;
    setDialog({ kind: "reopen", key: dayKeyOf(shownDay, scope), label: dayLabelOf(shownDay) });
  };

  const openPrint = () => {
    if (!shownDay) return;
    setDialog({ kind: "print", print: dayPrintOf(shownDay, scope) });
  };

  const exceptionClosed = (result: DayCloseResult, pages: readonly ExceptionPage[]) => {
    setDialog(null);
    // Nothing was live: no session to say was force-closed (Qt `live.isEmpty()`).
    const forced = pages.length === 0 ? 0 : (result.forcedCount ?? pages.length);
    toast.success(exceptionClosedText(result.zNo, forced), { autoClose: false });
    reloadShown();
  };

  const reopened = (label: string) => {
    setDialog(null);
    toast.success(reopenedText(label), { autoClose: false });
    reloadShown();
  };

  // ── Keys: F5 refresh · F8 Day ⇄ List · F10 Close day · Esc close ────────
  const keysRef = useRef({ refresh, close, closeDay, canCloseDay });
  useLayoutEffect(() => {
    keysRef.current = { refresh, close, closeDay, canCloseDay };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || overlayOpen()) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (event.key === "F5") {
        // Never the browser's reload.
        event.preventDefault();
        keysRef.current.refresh();
      } else if (event.key === "F8") {
        event.preventDefault();
        setTab((current) => (current === "day" ? "list" : "day"));
      } else if (event.key === "F10") {
        // Never the browser's menu bar; Close day only when its button is on.
        event.preventDefault();
        if (keysRef.current.canCloseDay) void keysRef.current.closeDay();
      } else if (event.key === "Escape") {
        event.preventDefault();
        keysRef.current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  let sessionsState = sessions;
  if (dayState.kind === "loading") sessionsState = SESSIONS_WAITING;
  else if (dayState.kind === "unknown") sessionsState = SESSIONS_NOTHING;
  let sessionsEmpty = "No till session on this day.";
  if (dayState.kind === "none") sessionsEmpty = "No business day yet — so no session either.";
  else if (dayState.kind === "unknown") sessionsEmpty = "The business day could not be read — F5 tries again.";

  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>{head.title}</h1>
          <p className={styles.subtitle}>
            {head.sub}
            {dayBusy ? <span className={styles.busy}> · reading…</span> : null}
          </p>
          {/* Qt a449b8c: the sessions still out, any day — a day's list shows only its own date. */}
          {scopeReady ? <LiveCashLine sessions={liveSessions} className={styles.liveLine} /> : null}
        </div>
        {head.pill ? (
          <span className={cx(styles.pill, styles.statusPill, pillToneClass(head.pillTone))}>{head.pill}</span>
        ) : null}
      </header>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "day"}
          className={cx(styles.tab, tab === "day" && styles.tabActive)}
          onClick={() => setTab("day")}
        >
          Day
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "list"}
          className={cx(styles.tab, tab === "list" && styles.tabActive)}
          onClick={() => setTab("list")}
        >
          List <span className={styles.keyHint}>(F8)</span>
        </button>
      </div>

      {!scopeReady ? (
        <p className={styles.warning}>
          A business day belongs to a branch — choose a company and a branch in the header first.
        </p>
      ) : null}

      <section className={styles.dayTab} hidden={tab !== "day"} role="tabpanel" aria-label="Day">
        <FactsStrip facts={head.facts} />

        <div className={styles.body}>
          <div className={styles.leftPane}>
            <div className={styles.capRow}>
              <span className={styles.sectionCap}>Checklist</span>
              <span className={styles.capHint}>
                red blocks · amber needs a decision · green is done · grey waits for the server
              </span>
            </div>
            <Checklist checks={reading?.checks ?? []} onOpenSession={openSession} onOpenHref={openHref} />

            <div className={styles.capRow}>
              <span className={styles.sectionCap}>Sessions of the day</span>
              <span className={styles.capHint}>
                grid &apos;TILL SESSIONS&apos; filtered to this day · Enter opens the cockpit
              </span>
            </div>
            <DayGrid
              grid="tillDaySessions"
              fallbackColumns={SESSION_COLUMNS_FALLBACK}
              state={sessionsState}
              rowKey={sessionRowKey}
              onOpen={openSessionRow}
              onRetry={retrySessions}
              label="Sessions of the day"
              emptyText={sessionsEmpty}
              gridRef={sessionsGridRef}
              minRows={SESSIONS_MIN_ROWS}
              autoFocus
            />
          </div>

          <div className={styles.rightPane}>
            <div className={styles.capRow}>
              <span className={styles.sectionCap}>The day in numbers</span>
              <span className={styles.capHint}>from the sessions, live</span>
            </div>
            <DayNumbers
              sections={reading?.numbers ?? []}
              emptyText={dayState.kind === "none" ? "No business day yet." : "—"}
            />
          </div>
        </div>

        <VerdictBand verdict={reading?.verdict ?? null} />

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canDayOpen}
            title={dayOpenTitle}
            onClick={() => void openDay()}
          >
            {opening ? "Opening…" : "Day Open"}
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!canCloseDay}
            title={buttons.closeDay.title}
            onClick={() => void closeDay()}
          >
            <span className={styles.keyLead}>F10</span>
            {closing ? "Closing…" : "Close day"}
          </button>
          <button
            type="button"
            className={styles.warnButton}
            disabled={!buttons.closeException.enabled || closing}
            title={buttons.closeException.title}
            onClick={openException}
          >
            Close with exception…
          </button>
          <button type="button" className={styles.secondaryButton} disabled={!scopeReady} onClick={refresh}>
            <span className={styles.keyLead}>F5</span>Refresh checks
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!buttons.print.enabled}
            title={buttons.print.title}
            onClick={openPrint}
          >
            {buttons.print.label}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!buttons.reopen.enabled}
            title={buttons.reopen.title}
            onClick={openReopen}
          >
            Reopen day
          </button>
          <span className={styles.spacer} />
          <button type="button" className={styles.secondaryButton} onClick={close}>
            Close<span className={styles.keyHint}>Esc</span>
          </button>
        </div>
        <p className={styles.footNote}>{FOOT_NOTE}</p>
      </section>

      <section className={styles.listTab} hidden={tab !== "list"} role="tabpanel" aria-label="List">
        <p className={styles.mutedNote}>Every business day of the branch, newest first — Enter opens the day.</p>
        <DayGrid
          grid="tillBusinessDayList"
          fallbackColumns={DAY_COLUMNS_FALLBACK}
          state={days}
          rowKey={dayRowKey}
          onOpen={openDayRow}
          onRetry={() => void reloadDays()}
          label="Business days"
          emptyText="No business day in the last 90 days."
          gridRef={daysGridRef}
        />
      </section>

      {dialog?.kind === "exception" ? (
        <DayExceptionDialog
          dayKey={dialog.key}
          pages={dialog.pages}
          onClose={() => setDialog(null)}
          onClosed={(result) => exceptionClosed(result, dialog.pages)}
        />
      ) : null}
      {dialog?.kind === "reopen" ? (
        <DayReopenDialog
          dayKey={dialog.key}
          dayLabel={dialog.label}
          onClose={() => setDialog(null)}
          onReopened={() => reopened(dialog.label)}
        />
      ) : null}
      {dialog?.kind === "print" ? (
        <PrintOptionsDialog
          open
          onClose={() => setDialog(null)}
          purposeCode={PURPOSE_CODE.TILL_DAY_Z}
          documentLabel={dialog.print.label}
          targets={[dialog.print.target]}
        />
      ) : null}
    </div>
  );
}
