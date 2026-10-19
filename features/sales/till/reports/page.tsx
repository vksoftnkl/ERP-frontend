"use client";

/**
 * Till Reports (menu 288, Sales › Till, till notes 133) — Qt `TillReportsEntry`
 * (NexERP 1d3e203, TILL_DESIGN.md §10; mockups share/till/till_report_
 * {variance,exceptions,approvals,safe_book}_ui_mockup.png, approved
 * 2026-10-17; the last three tabs Qt 3b5069d, no mockup). One read-only
 * screen, seven tabs:
 *
 *   Cashier variance   per cashier (grid 159; Cash only / Cash + non-cash),
 *                      the picked cashier's sessions (160)
 *   Exceptions         per person (161), by hour (162 — click an hour), the
 *                      events (163); a click on a count picks that Event
 *   Approver activity  per approver (164), the not-decided band (166), the
 *                      decisions (165)
 *   Safe book          per day (167), the picked day's lines (168), the
 *                      branch's remittances (157)
 *   Cashier performance per cashier (175), the picked cashier's sessions (176)
 *   Ledger check       per session (177; Every session / Only differences),
 *                      the picked session's till cash legs (178)
 *   Tender recon.      per session × non-cash tender (179; Every session /
 *                      Only not settled), the picked tender's rows (180)
 *
 * Filters (Qt hboxFilter): Branch (dropdown 61 — the header's branch until
 * changed; empty = every branch), From / To (a week to today), Counter (133),
 * Cashier / Approver (169), Event (Exceptions only), Safe (136, Safe book
 * only), and a search that narrows the rows already read in both tables of
 * the tab (the totals row stays). What the grids read and how a figure is
 * written, totalled and pilled is `till-reports.ts`; the reads are
 * `use-till-reports.ts`.
 *
 * Enter / double-click on a row that names a session opens its Session
 * Cockpit — a detail row on most tabs, the MAIN row on Ledger check and
 * Tender reconciliation (one row per session there; Qt `currentSessionRow`
 * falls back to the main grid's). The Cockpit is a route here (Qt: a dialog
 * over the report), so the report keeps its tab, filters and picks for the
 * way back. Ctrl+H is the session's journal (grid 145, as Till Sessions'
 * Ctrl+H). Print is the tab's tables on a landscape page through the
 * browser's print dialog; Export a CSV of the same — each behind menu 288's
 * PRINT / EXPORT right.
 *
 * Opened with `?branch=…&branchName=…&from=…&to=…` (Cash Position's drill,
 * Qt `setScope`) the screen starts on that branch and period — over a
 * remembered Back view — and strips the four from the address.
 *
 * Keys (Qt): F5 Refresh · Enter Open cockpit (on a table naming a session) ·
 * Ctrl+H History · Enter walks the filter bar · Esc closes.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle, type DropdownSelection } from "@/components/design-system/dropdown";
import { useBusinessContext } from "@/components/layout/business-context";
import { sendToPrinter } from "@/features/printing/print-delivery";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { toast } from "@/lib/notify";
import { walkOnEnter } from "../cash-office/enter-walk";
import { cockpitHref, textOf, todayIso } from "../shared/format";
import { overlayOpen } from "../shared/till-dialog";
import styles from "../shared/till.module.scss";
import { JournalDialog } from "../sessions/journal-dialog";
import type { SessionRow } from "../sessions/session-list";
import type { GridRow } from "../shared/wire/types";
import { ReportTable } from "./report-table";
import {
  EXCEPTION_CODES,
  HEAT_WHITE_TEXT,
  HOURS_HINT,
  LEDGER_HINT,
  NO_PICKS,
  OPEN_TIP_OFF,
  OPEN_TIP_ON,
  PERF_HINT,
  REMIT_HEAD,
  REPORT_TABS,
  SEARCH_PLACEHOLDER,
  SUBTITLE,
  TENDER_HINT,
  TILL_REPORTS_HREF,
  VARIANCE_HINT,
  approversTable,
  counterOptions,
  csvText,
  dayHead,
  dayLinesTable,
  decisionsHead,
  decisionsTable,
  defaultRange,
  eventsHead,
  eventsTable,
  exceptionsTable,
  exportFileName,
  hourStrip,
  ledgerTable,
  legsHead,
  legsTable,
  listedValue,
  parseReportView,
  peopleOptions,
  perfSessionsHead,
  perfSessionsTable,
  performanceTable,
  pickedSafeId,
  printDocument,
  printTitle,
  remitHint,
  remitsTable,
  reportRange,
  safeBookProblem,
  safeDaysTable,
  safeHint,
  safeOptions,
  scopeFromSearch,
  searchTable,
  sessionTarget,
  sessionsHead,
  sessionsTable,
  tabLabel,
  tenderRowKey,
  tenderRowsHead,
  tenderRowsTable,
  tenderTable,
  undecidedLine,
  varianceTable,
  withoutScopeParams,
  type ReportFilters,
  type ReportPicks,
  type ReportScope,
  type ReportSection,
  type ReportTab,
  type ReportView,
  type RowView,
  type TableView,
} from "./till-reports";
import { useReportPickers, useTillReports, type GridRead } from "./use-till-reports";
import local from "./reports.module.scss";

// ─── back from the Cockpit ───────────────────────────────────────────────────

const RETURN_PREFIX = "till-reports:back:";

/** Read without removing: StrictMode runs a lazy initialiser twice. */
function peekReturn(companyId: string): ReportView | null {
  try {
    const raw = window.sessionStorage.getItem(RETURN_PREFIX + companyId);
    return raw ? parseReportView(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveReturn(companyId: string, view: ReportView) {
  try {
    window.sessionStorage.setItem(RETURN_PREFIX + companyId, JSON.stringify(view));
  } catch {
    // Without storage the report still comes back, as a fresh one.
  }
}

function dropReturn(companyId: string) {
  try {
    window.sessionStorage.removeItem(RETURN_PREFIX + companyId);
  } catch {
    // Nothing kept, nothing to drop.
  }
}

/**
 * The scope's four, off the address once applied (Qt's `setScope` is a call,
 * not a URL): a reload or a Back then lands on the screen as it stands. A
 * null state is what keeps Next's router in step with the address.
 */
function stripScopeFromAddress() {
  try {
    const url = new URL(window.location.href);
    const search = withoutScopeParams(url.search);
    if (search === url.search) return;
    window.history.replaceState(null, "", `${url.pathname}${search}${url.hash}`);
  } catch {
    // Without a history the address keeps the scope; the screen is not the worse.
  }
}

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The company is the header's; the screen proper is keyed by it. */
export default function TillReportsPage() {
  const { activeCompany, activeBranch, branchOptions, companyLoading, branchLoading } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const branchName = activeBranch?.name ?? "";
  const headerBranch = useMemo(() => (branchId ? { id: branchId, text: branchName } : null), [branchId, branchName]);
  // The header's branch is the Branch filter's default: wait for it, or the
  // first reads go out for every branch and again for the branch a moment later.
  // Branches listed but none active = the header is about to pick its first.
  const reading = !branchId && (companyLoading || branchLoading || branchOptions.some((option) => option.value));
  if (!companyId || reading) {
    return (
      <div className={cx(styles.page, local.page)}>
        <header className={styles.titleBar}>
          <h1 className={styles.title}>Till Reports</h1>
        </header>
        <p className={reading ? styles.muted : local.notice}>
          {reading ? "Reading the company and branch…" : "The reports read one company — choose a company in the header first."}
        </p>
      </div>
    );
  }
  return (
    <TillReportsScreen
      key={companyId}
      companyId={companyId}
      headerBranch={headerBranch}
    />
  );
}

type DetailPick = { tab: ReportTab; answerKey: string; rowKey: string };

type ScreenProps = { companyId: string; headerBranch: DropdownSelection | null };

function TillReportsScreen({ companyId, headerBranch }: ScreenProps) {
  const router = useRouter();
  const { permissions } = usePagePermissions({ href: TILL_REPORTS_HREF });
  const canPrint = permissions.canPrint;
  const canExport = permissions.canExport;
  const branchDropdownId = useDropdownId("branchByCompany");
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);

  const [today] = useState(() => todayIso());
  const [restored] = useState(() => peekReturn(companyId));
  useEffect(() => {
    dropReturn(companyId);
  }, [companyId]);

  // ── Opened on a scope (Cash Position's drill, Qt `setScope`) ───────────
  // The router's own reading of the address — not `window.location`, which
  // on a client-side navigation still shows the page left until the commit.
  const searchParams = useSearchParams();
  const addressQuery = searchParams?.toString() ?? "";
  /** The scope the screen opened on: its branch and period over a remembered Back view. */
  const [scope] = useState<ReportScope | null>(() => scopeFromSearch(addressQuery));

  // ── The filter bar ─────────────────────────────────────────────────────
  const [tab, setTab] = useState<ReportTab>(restored?.tab ?? "variance");
  /** The header's branch until the operator picks one (Qt: the login branch). */
  const [branchPicked, setBranchPicked] = useState<{ value: DropdownSelection | null } | null>(
    scope ? { value: scope.branch } : restored ? { value: restored.branch } : null,
  );
  const branch = branchPicked ? branchPicked.value : headerBranch;
  const branchId = branch?.id ?? "";
  const [fromDate, setFromDate] = useState(
    () => (scope ? scope.fromDate : restored?.fromDate) || defaultRange(today).fromDate,
  );
  const [toDate, setToDate] = useState(() => (scope ? scope.toDate : restored?.toDate) || defaultRange(today).toDate);
  // A scope is a branch pick: the Counter back to All, the Safe to the branch's default.
  const [counterId, setCounterId] = useState(scope ? "" : (restored?.counterId ?? ""));
  const [cashierId, setCashierId] = useState(restored?.cashierId ?? "");
  const [approverId, setApproverId] = useState(restored?.approverId ?? "");
  const [event, setEvent] = useState(restored?.event ?? "");
  const [safeId, setSafeId] = useState(scope ? "" : (restored?.safeId ?? ""));

  // A later link to a scoped address while the screen is up (the same route:
  // no remount) applies it the same way; the four then leave the address, so
  // a reload or a Back lands on the screen as it stands.
  const [seenQuery, setSeenQuery] = useState(addressQuery);
  if (seenQuery !== addressQuery) {
    setSeenQuery(addressQuery);
    const next = scopeFromSearch(addressQuery);
    if (next) {
      setBranchPicked({ value: next.branch });
      if (next.fromDate) setFromDate(next.fromDate);
      if (next.toDate) setToDate(next.toDate);
      setCounterId("");
      setSafeId("");
    }
  }
  useEffect(() => {
    if (scopeFromSearch(addressQuery)) stripScopeFromAddress();
  }, [addressQuery]);

  const [withNonCash, setWithNonCash] = useState(restored?.withNonCash ?? false);
  const [ledgerDiffOnly, setLedgerDiffOnly] = useState(restored?.ledgerDiffOnly ?? false);
  const [tenderPendingOnly, setTenderPendingOnly] = useState(restored?.tenderPendingOnly ?? false);
  const [search, setSearch] = useState(restored?.search ?? "");
  const [picks, setPicks] = useState<ReportPicks>(restored?.picks ?? NO_PICKS);
  const [detailPick, setDetailPick] = useState<DetailPick | null>(null);
  const [tick, setTick] = useState(0);
  const [journal, setJournal] = useState<SessionRow | null>(null);

  // ── The pickers' lists, and each filter as read against them ──────────
  const pickers = useReportPickers(companyId, branchId);
  const counters = useMemo(() => counterOptions(pickers.counters.rows), [pickers.counters.rows]);
  const safes = useMemo(() => safeOptions(pickers.safes.rows), [pickers.safes.rows]);
  const cashiers = useMemo(() => peopleOptions(pickers.cashiers.rows), [pickers.cashiers.rows]);
  const approverList = useMemo(() => peopleOptions(pickers.approvers.rows), [pickers.approvers.rows]);
  const settled = (read: GridRead) => read.settled && !read.loading;

  const filters: ReportFilters = {
    companyId,
    branchId,
    fromDate,
    toDate,
    counterId: branchId ? listedValue(counters, counterId, settled(pickers.counters)) : "",
    cashierId: listedValue(cashiers, cashierId, settled(pickers.cashiers)),
    approverId: listedValue(approverList, approverId, settled(pickers.approvers)),
    event,
    safeId: branchId ? pickedSafeId(safes, safeId, settled(pickers.safes)) : "",
    withNonCash,
    ledgerDiffOnly,
    tenderPendingOnly,
  };
  const safeProblem = tab === "safe" ? safeBookProblem(filters, today, !settled(pickers.safes)) : "";

  const model = useTillReports({ tab, filters, today, tick, picks, safeProblem });
  const { cashierRow, personRow, approverRow, dayRow, performerRow, ledgerRow, tenderRow } = model;

  // ── The tables, then what the search leaves of them ────────────────────
  const views = useMemo(
    () => ({
      variance: varianceTable(model.variance.rows),
      sessions: sessionsTable(model.sessions.rows),
      exceptions: exceptionsTable(model.exceptions.rows),
      events: eventsTable(model.events.rows),
      approvers: approversTable(model.approvers.rows),
      decisions: decisionsTable(model.decisions.rows),
      safeDays: safeDaysTable(model.safeDays.rows),
      dayLines: dayLinesTable(model.dayLines.rows),
      remits: remitsTable(model.remits.rows),
      performance: performanceTable(model.performance.rows),
      perfSessions: perfSessionsTable(model.perfSessions.rows),
      ledger: ledgerTable(model.ledger.rows),
      legs: legsTable(model.legs.rows),
      tender: tenderTable(model.tender.rows),
      tenderRows: tenderRowsTable(model.tenderRows.rows),
    }),
    [
      model.variance.rows,
      model.sessions.rows,
      model.exceptions.rows,
      model.events.rows,
      model.approvers.rows,
      model.decisions.rows,
      model.safeDays.rows,
      model.dayLines.rows,
      model.remits.rows,
      model.performance.rows,
      model.perfSessions.rows,
      model.ledger.rows,
      model.legs.rows,
      model.tender.rows,
      model.tenderRows.rows,
    ],
  );

  const tabTables: Record<ReportTab, { main: TableView; detail: TableView; detailRead: GridRead }> = {
    variance: { main: views.variance, detail: views.sessions, detailRead: model.sessions },
    exceptions: { main: views.exceptions, detail: views.events, detailRead: model.events },
    approvers: { main: views.approvers, detail: views.decisions, detailRead: model.decisions },
    safe: { main: views.safeDays, detail: views.dayLines, detailRead: model.dayLines },
    performance: { main: views.performance, detail: views.perfSessions, detailRead: model.perfSessions },
    ledger: { main: views.ledger, detail: views.legs, detailRead: model.legs },
    tender: { main: views.tender, detail: views.tenderRows, detailRead: model.tenderRows },
  };
  const current = tabTables[tab];
  const mainShown = useMemo(() => searchTable(current.main, search), [current.main, search]);
  const detailShown = useMemo(() => searchTable(current.detail, search), [current.detail, search]);

  // ── Heads and hints ────────────────────────────────────────────────────
  const emptyAnswer = (read: GridRead) => read.settled && !read.loading && read.rows.length === 0;
  const varianceEmpty = emptyAnswer(model.variance);
  const sessionsHeadText = sessionsHead(cashierRow ? textOf(cashierRow, "cashier") : null, varianceEmpty);
  const eventsHeadText = eventsHead(personRow ? textOf(personRow, "person") : null, event, picks.hour, model.events.rows.length);
  const decisionsHeadText = decisionsHead(approverRow ? textOf(approverRow, "approver") : null, model.decisions.rows.length);
  const dayHeadText = dayHead(dayRow);
  const perfSessionsHeadText = perfSessionsHead(
    performerRow ? textOf(performerRow, "cashier") : null,
    emptyAnswer(model.performance),
  );
  const legsHeadText = legsHead(ledgerRow ? textOf(ledgerRow, "tss_session_no") : null, emptyAnswer(model.ledger), ledgerDiffOnly);
  const tenderRowsHeadText = tenderRowsHead(tenderRow, emptyAnswer(model.tender), tenderPendingOnly);
  const undecided = model.undecided.settled ? undecidedLine(model.undecided.rows) : null;
  const safeHintText = safeProblem || (model.safeDays.settled ? safeHint(model.safeDays.rows) : "");
  const strip = useMemo(() => hourStrip(model.hours.rows), [model.hours.rows]);
  const detailHead: Record<ReportTab, string> = {
    variance: sessionsHeadText,
    exceptions: eventsHeadText,
    approvers: decisionsHeadText,
    safe: dayHeadText,
    performance: perfSessionsHeadText,
    ledger: legsHeadText,
    tender: tenderRowsHeadText,
  };

  // ── The picked rows, and the session one of them names ─────────────────
  const detailKey =
    detailPick && detailPick.tab === tab && detailPick.answerKey === current.detailRead.answerKey ? detailPick.rowKey : null;
  const detailRow = detailKey === null ? null : (current.detail.rows.find((row) => row.key === detailKey)?.row ?? null);
  /** The main grid's picked row, per tab — the Ledger check's and Tender reconciliation's name a session. */
  const mainRow: Record<ReportTab, GridRow | null> = {
    variance: cashierRow,
    exceptions: personRow,
    approvers: approverRow,
    safe: dayRow,
    performance: performerRow,
    ledger: ledgerRow,
    tender: tenderRow,
  };
  // Qt `currentSessionRow`: the detail row when it names a session, else the main row when it does.
  const target = sessionTarget(detailRow) ?? sessionTarget(mainRow[tab]);

  const pickDetail = (row: RowView) => {
    if (row.total) return;
    setDetailPick({ tab, answerKey: current.detailRead.answerKey, rowKey: row.key });
  };

  const loading =
    [
      model.variance,
      model.sessions,
      model.exceptions,
      model.hours,
      model.events,
      model.approvers,
      model.undecided,
      model.decisions,
      model.safeDays,
      model.dayLines,
      model.remits,
      model.performance,
      model.perfSessions,
      model.ledger,
      model.legs,
      model.tender,
      model.tenderRows,
    ].some((read) => read.loading) || Object.values(pickers).some((read) => read.loading);

  // ── Verbs ──────────────────────────────────────────────────────────────
  const refresh = () => setTick((value) => value + 1);

  const changeTab = (next: ReportTab) => {
    if (next === tab) return;
    setTab(next);
    // Qt `refreshTab` on currentChanged: the tab comes up freshly read.
    refresh();
  };

  /** The combos (Qt `activated`): the hour picked on the strip is dropped. */
  const pickFilter = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPicks((now) => ({ ...now, hour: null }));
  };

  const pickBranch = (selection: DropdownSelection | null) => {
    setBranchPicked({ value: selection });
    // Qt `loadPickers`: the counter goes back to All, the safe to the new branch's default.
    setCounterId("");
    setSafeId("");
  };

  const currentView = (): ReportView => ({
    tab,
    branch,
    fromDate,
    toDate,
    counterId,
    cashierId,
    approverId,
    event,
    safeId,
    withNonCash,
    ledgerDiffOnly,
    tenderPendingOnly,
    search,
    picks: {
      cashier: cashierRow ? textOf(cashierRow, "cashier_id") : picks.cashier,
      person: personRow ? textOf(personRow, "person_id") : "",
      approver: approverRow ? textOf(approverRow, "approver_id") : "",
      day: dayRow ? textOf(dayRow, "day") : picks.day,
      hour: picks.hour,
      performer: performerRow ? textOf(performerRow, "cashier_id") : picks.performer,
      ledgerSession: ledgerRow ? textOf(ledgerRow, "tss_id") : picks.ledgerSession,
      tenderKey: tenderRow ? tenderRowKey(tenderRow) : picks.tenderKey,
    },
  });

  /** Enter (Qt `openCockpit`): the session's Cockpit, on the row's own tenant key. */
  const openCockpit = (row: RowView | null = null) => {
    const session = row ? sessionTarget(row.row) : target;
    if (!session) return;
    saveReturn(companyId, currentView());
    router.push(cockpitHref(session.key));
  };

  /** Ctrl+H (Qt `openHistory`): the session's own journal. */
  const openHistory = () => {
    if (target) setJournal(target);
  };

  const { from, to } = reportRange(fromDate, toDate, today);
  const branchText = branch?.text || "Every branch";

  const sections = (): ReportSection[] => {
    const list: ReportSection[] = [
      { caption: tabLabel(tab), table: mainShown },
      { caption: detailHead[tab], table: detailShown },
    ];
    if (tab === "safe") list.push({ caption: REMIT_HEAD, table: views.remits });
    return list;
  };

  const print = () => {
    if (!canPrint) return;
    const page = printDocument(printTitle(tab, from, to, branchText), sections());
    sendToPrinter(URL.createObjectURL(new Blob([page], { type: "text/html;charset=utf-8" })));
  };

  const exportCsv = () => {
    if (!canExport) return;
    const fileName = exportFileName(tab, to);
    download(csvText(sections().map((section) => section.table)), fileName);
    toast.success(`Saved ${fileName}.`, { title: "Export" });
  };

  const close = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  // ── Keys: F5 refresh · Ctrl+H history · Esc close ──────────────────────
  const keysRef = useRef({ refresh, openHistory, close });
  useLayoutEffect(() => {
    keysRef.current = { refresh, openHistory, close };
  });
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.defaultPrevented || overlayOpen()) return;
      if (keyEvent.altKey || keyEvent.metaKey || keyEvent.shiftKey) return;
      if (keyEvent.ctrlKey) {
        if (keyEvent.key === "h" || keyEvent.key === "H") {
          // Never the browser's history panel.
          keyEvent.preventDefault();
          keysRef.current.openHistory();
        }
        return;
      }
      if (keyEvent.key === "F5") {
        // Never the browser's reload.
        keyEvent.preventDefault();
        keysRef.current.refresh();
      } else if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        keysRef.current.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const emptyAfterSearch = (table: TableView, empty: string) =>
    search.trim() && table.rows.length > 0 ? "Nothing here matches the search." : empty;

  // ── The tabs ───────────────────────────────────────────────────────────
  const detailTable = (emptyText: string, label: string) => (
    <ReportTable
      table={detailShown}
      pickedKey={detailKey}
      onPick={pickDetail}
      onOpen={(row) => openCockpit(row)}
      loading={current.detailRead.loading}
      error={current.detailRead.error}
      emptyText={emptyAfterSearch(current.detail, emptyText)}
      label={label}
    />
  );

  const varianceTab = (
    <>
      <div className={local.topRow}>
        <span className={styles.radioRow} role="radiogroup" aria-label="Variance">
          <label className={styles.radio}>
            <input type="radio" name="till-rpt-noncash" checked={!withNonCash} onChange={() => setWithNonCash(false)} />
            Cash only
          </label>
          <label className={styles.radio}>
            <input type="radio" name="till-rpt-noncash" checked={withNonCash} onChange={() => setWithNonCash(true)} />
            Cash + non-cash
          </label>
        </span>
        <span className={styles.spacer} />
        <span className={local.hint}>{VARIANCE_HINT}</span>
      </div>
      <div className={local.mainPane}>
        <ReportTable
          table={mainShown}
          pickedKey={cashierRow ? textOf(cashierRow, "cashier_id") : null}
          onPick={(row) => {
            // The totals row picks nobody: the sessions keep the last cashier (Qt).
            if (row.total) return;
            setPicks((now) => ({ ...now, cashier: row.key }));
            setDetailPick(null);
          }}
          loading={model.variance.loading}
          error={model.variance.error}
          emptyText={emptyAfterSearch(current.main, "No till session in this range.")}
          label="Cashier variance"
        />
      </div>
      <p className={local.head}>{sessionsHeadText}</p>
      <div className={local.detailPane}>{detailTable("No session.", "The cashier's sessions")}</div>
    </>
  );

  /** A click on a count lists that event only; on the name or the Total, every event (Qt cellClicked). */
  const clickException = (row: RowView, column: number) => {
    const code = column - 1;
    if (code >= 0 && code < EXCEPTION_CODES.length) setEvent(EXCEPTION_CODES[code].code);
    else if (column === 0 || column === EXCEPTION_CODES.length + 1) setEvent("");
    setPicks((now) => ({ ...now, person: row.total ? "" : row.key }));
    setDetailPick(null);
  };

  const exceptionsTab = (
    <>
      <div className={local.mainPane}>
        <ReportTable
          table={mainShown}
          pickedKey={personRow ? textOf(personRow, "person_id") : null}
          onCellClick={clickException}
          onPick={(row) => {
            setPicks((now) => ({ ...now, person: row.total ? "" : row.key }));
            setDetailPick(null);
          }}
          loading={model.exceptions.loading}
          error={model.exceptions.error}
          emptyText={emptyAfterSearch(current.main, "No exception in this range.")}
          label="Exceptions per person"
        />
      </div>
      <p className={local.hint}>{HOURS_HINT}</p>
      <div className={local.hours} role="group" aria-label="Exceptions by hour">
        {model.hours.settled
          ? strip.map((cell) => (
              <button
                key={cell.hour}
                type="button"
                className={cx(local.hour, cell.heat > HEAT_WHITE_TEXT && local.hourDark)}
                style={{
                  background: `color-mix(in srgb, var(--primary) ${Math.round(cell.heat * 100)}%, var(--card-bg, #fff))`,
                }}
                aria-pressed={picks.hour === cell.hour}
                title={cell.tip}
                onClick={() => {
                  setPicks((now) => ({ ...now, hour: now.hour === cell.hour ? null : cell.hour }));
                  setDetailPick(null);
                }}
              >
                {`${cell.count}\n${cell.label}`}
              </button>
            ))
          : null}
      </div>
      <p className={local.head}>{model.exceptions.settled ? eventsHeadText : ""}</p>
      <div className={local.detailPane}>{detailTable("No event.", "The exception events")}</div>
    </>
  );

  const approversTab = (
    <>
      <div className={local.mainPane}>
        <ReportTable
          table={mainShown}
          pickedKey={approverRow ? textOf(approverRow, "approver_id") : null}
          onPick={(row) => {
            setPicks((now) => ({ ...now, approver: row.total ? "" : row.key }));
            setDetailPick(null);
          }}
          loading={model.approvers.loading}
          error={model.approvers.error}
          emptyText={emptyAfterSearch(current.main, "No request was decided in this range.")}
          label="Approver activity"
        />
      </div>
      {undecided ? (
        <p
          className={cx(local.undecided, undecided.tone === "amber" ? local.undecidedAmber : local.undecidedGreen)}
          role="status"
        >
          {undecided.text}
        </p>
      ) : null}
      <p className={local.head}>{model.approvers.settled ? decisionsHeadText : ""}</p>
      <div className={local.detailPane}>{detailTable("No decision.", "The decisions")}</div>
    </>
  );

  const safeTab = (
    <>
      <div className={local.mainPane}>
        <ReportTable
          table={mainShown}
          pickedKey={dayRow ? textOf(dayRow, "day") : null}
          onPick={(row) => {
            // The totals row is no day: the lines keep the last one (Qt).
            if (row.total) return;
            setPicks((now) => ({ ...now, day: row.key }));
            setDetailPick(null);
          }}
          loading={model.safeDays.loading}
          error={model.safeDays.error}
          emptyText={safeProblem || emptyAfterSearch(current.main, "No day in this range.")}
          label="Safe book per day"
        />
      </div>
      <p className={local.hint}>{safeHintText}</p>
      <div className={local.safeLower}>
        <section className={local.safeSide} aria-label="The day's lines">
          <p className={local.head}>{dayHeadText}</p>
          <div className={local.safeSidePane}>{detailTable(dayRow ? "Nothing moved that day." : "—", "The day's lines")}</div>
        </section>
        <section className={local.safeSide} aria-label="Remittances">
          <p className={local.head}>{REMIT_HEAD}</p>
          <div className={local.safeSidePane}>
            <ReportTable
              table={views.remits}
              pickedKey={null}
              loading={model.remits.loading}
              error={model.remits.error}
              emptyText={branchId ? "No remittance in this range." : "Pick a branch to see its remittances."}
              label="Remittances"
            />
          </div>
          {branchId && model.remits.settled ? <p className={local.hint}>{remitHint(model.remits.rows)}</p> : null}
        </section>
      </div>
    </>
  );

  const performanceTab = (
    <>
      <p className={local.hint}>{PERF_HINT}</p>
      <div className={local.mainPane}>
        <ReportTable
          table={mainShown}
          pickedKey={performerRow ? textOf(performerRow, "cashier_id") : null}
          onPick={(row) => {
            // The totals row picks nobody: the sessions keep the last cashier (Qt).
            if (row.total) return;
            setPicks((now) => ({ ...now, performer: row.key }));
            setDetailPick(null);
          }}
          loading={model.performance.loading}
          error={model.performance.error}
          emptyText={emptyAfterSearch(current.main, "No till session in this range.")}
          label="Cashier performance"
        />
      </div>
      <p className={local.head}>{perfSessionsHeadText}</p>
      <div className={local.detailPane}>{detailTable("No session.", "The cashier's sessions by performance")}</div>
    </>
  );

  /** A radio pair over the main table (Qt hboxLedgerTop / hboxTenderTop), the hint beside it. */
  const radioPair = (
    name: string,
    label: string,
    only: string,
    value: boolean,
    set: (value: boolean) => void,
    hint: string,
  ) => (
    <div className={local.topRow}>
      <span className={styles.radioRow} role="radiogroup" aria-label={label}>
        <label className={styles.radio}>
          <input type="radio" name={name} checked={!value} onChange={() => set(false)} />
          Every session
        </label>
        <label className={styles.radio}>
          <input type="radio" name={name} checked={value} onChange={() => set(true)} />
          {only}
        </label>
      </span>
      <span className={styles.spacer} />
      <span className={local.hint}>{hint}</span>
    </div>
  );

  /** Ledger check / Tender reconciliation: the main row names a session — Enter opens it. */
  const sessionMainTable = (
    read: GridRead,
    pickedKey: string | null,
    pick: "ledgerSession" | "tenderKey",
    emptyText: string,
    label: string,
  ) => (
    <ReportTable
      table={mainShown}
      pickedKey={pickedKey}
      onPick={(row) => {
        // The totals row is no session: the detail keeps the last one (Qt).
        if (row.total) return;
        setPicks((now) => ({ ...now, [pick]: row.key }));
        setDetailPick(null);
      }}
      onOpen={(row) => openCockpit(row)}
      loading={read.loading}
      error={read.error}
      emptyText={emptyAfterSearch(current.main, emptyText)}
      label={label}
    />
  );

  const ledgerTab = (
    <>
      {radioPair("till-rpt-ledger", "Ledger check", "Only differences", ledgerDiffOnly, setLedgerDiffOnly, LEDGER_HINT)}
      <div className={local.mainPane}>
        {sessionMainTable(
          model.ledger,
          ledgerRow ? textOf(ledgerRow, "tss_id") : null,
          "ledgerSession",
          ledgerDiffOnly ? "No session is OFF in this range." : "No till session in this range.",
          "Ledger check per session",
        )}
      </div>
      <p className={local.head}>{legsHeadText}</p>
      <div className={local.detailPane}>{detailTable("No leg on the till cash ledger.", "The session's ledger legs")}</div>
    </>
  );

  const tenderTab = (
    <>
      {radioPair("till-rpt-tender", "Tender reconciliation", "Only not settled", tenderPendingOnly, setTenderPendingOnly, TENDER_HINT)}
      <div className={local.mainPane}>
        {sessionMainTable(
          model.tender,
          tenderRow ? tenderRowKey(tenderRow) : null,
          "tenderKey",
          tenderPendingOnly
            ? "Everything in this range is settled."
            : "No card, UPI, wallet, cheque or bank tender in a till session in this range.",
          "Tender reconciliation per session and tender",
        )}
      </div>
      <p className={local.head}>{tenderRowsHeadText}</p>
      <div className={local.detailPane}>{detailTable("No tender row.", "The tender rows")}</div>
    </>
  );

  const tabBody: Record<ReportTab, ReactNode> = {
    variance: varianceTab,
    exceptions: exceptionsTab,
    approvers: approversTab,
    safe: safeTab,
    performance: performanceTab,
    ledger: ledgerTab,
    tender: tenderTab,
  };

  const personSelect = (
    id: string,
    label: string,
    value: string,
    options: readonly { value: string; label: string }[],
    onChange: (value: string) => void,
  ) => (
    <>
      <label className={local.cap} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={cx(styles.select, local.personSelect)}
        value={value}
        onChange={(changeEvent) => onChange(changeEvent.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <div className={cx(styles.page, local.page)}>
      <header className={styles.titleBar}>
        <div>
          <h1 className={styles.title}>Till Reports</h1>
          <p className={styles.subtitle}>{SUBTITLE}</p>
        </div>
      </header>

      <div className={local.filters} onKeyDown={walkOnEnter}>
        <label className={local.cap} htmlFor="till-rpt-branch">
          Branch
        </label>
        <div className={local.branchPick}>
          <NexDropdownSingle
            id="till-rpt-branch"
            dropdownId={branchDropdownId}
            params={branchParams}
            clearOnParamsChange={false}
            value={branch}
            onChange={(selection) => pickBranch(selection)}
            placeholder="Every branch"
            aria-label="Branch"
            className={styles.dropdown}
            advanceFocusOnSelect={false}
          />
        </div>
        <label className={local.cap} htmlFor="till-rpt-from">
          From
        </label>
        <input
          id="till-rpt-from"
          type="date"
          className={cx(styles.input, local.dateInput)}
          value={fromDate}
          onChange={(changeEvent) => setFromDate(changeEvent.target.value)}
        />
        <label className={local.cap} htmlFor="till-rpt-to">
          To
        </label>
        <input
          id="till-rpt-to"
          type="date"
          className={cx(styles.input, local.dateInput)}
          value={toDate}
          onChange={(changeEvent) => setToDate(changeEvent.target.value)}
        />
        <label className={local.cap} htmlFor="till-rpt-counter">
          Counter
        </label>
        <select
          id="till-rpt-counter"
          className={cx(styles.select, local.counterSelect)}
          value={filters.counterId}
          onChange={(changeEvent) => pickFilter(setCounterId)(changeEvent.target.value)}
        >
          <option value="">All</option>
          {counters.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {personSelect("till-rpt-cashier", "Cashier", filters.cashierId, cashiers, pickFilter(setCashierId))}
        {tab === "exceptions" ? (
          <>
            <label className={local.cap} htmlFor="till-rpt-event">
              Event
            </label>
            <select
              id="till-rpt-event"
              className={cx(styles.select, local.personSelect)}
              value={event}
              onChange={(changeEvent) => pickFilter(setEvent)(changeEvent.target.value)}
            >
              <option value="">All</option>
              {EXCEPTION_CODES.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {tab === "approvers"
          ? personSelect("till-rpt-approver", "Approver", filters.approverId, approverList, pickFilter(setApproverId))
          : null}
        {tab === "safe" ? (
          <>
            <label className={local.cap} htmlFor="till-rpt-safe">
              Safe
            </label>
            <select
              id="till-rpt-safe"
              className={cx(styles.select, local.personSelect)}
              value={filters.safeId}
              disabled={safes.length === 0}
              onChange={(changeEvent) => pickFilter(setSafeId)(changeEvent.target.value)}
            >
              {safes.length === 0 ? <option value="">{branchId ? "No safe" : "—"}</option> : null}
              {safes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <input
          type="search"
          className={cx(styles.input, local.search)}
          placeholder={SEARCH_PLACEHOLDER}
          aria-label="Search the rows shown"
          data-uppercase="off"
          value={search}
          onChange={(changeEvent) => setSearch(changeEvent.target.value)}
        />
        <button type="button" className={styles.secondaryButton} onClick={refresh}>
          F5 Refresh
        </button>
      </div>

      <div className={styles.tabs} role="tablist">
        {REPORT_TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            className={cx(styles.tab, tab === entry.value && styles.tabActive)}
            onClick={() => changeTab(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className={local.tabBody} role="tabpanel" aria-label={tabLabel(tab)}>
        {tabBody[tab]}
      </div>

      <footer className={local.foot}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!target}
          title={target ? OPEN_TIP_ON : OPEN_TIP_OFF}
          onClick={() => openCockpit()}
        >
          {tab === "safe" ? "Enter Open" : "Enter Open cockpit"}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!target}
          title={target ? "The session's journal — every event, oldest first" : OPEN_TIP_OFF}
          onClick={openHistory}
        >
          Ctrl+H History
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!canPrint}
          title={canPrint ? "This tab's tables on a landscape page" : "No print right on Till Reports (menu 288)"}
          onClick={print}
        >
          Print
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={!canExport}
          title={canExport ? "This tab's tables as a CSV file" : "No export right on Till Reports (menu 288)"}
          onClick={exportCsv}
        >
          Export
        </button>
        <span className={local.footNote}>{loading ? "Loading…" : ""}</span>
      </footer>

      <JournalDialog session={journal} onClose={() => setJournal(null)} />
    </div>
  );
}
