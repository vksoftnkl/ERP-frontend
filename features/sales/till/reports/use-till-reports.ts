"use client";

/**
 * The reads behind Till Reports — the Qt `runGrid` calls of `loadVariance /
 * loadSessions / loadExceptions / loadEvents / loadApprovers / loadDecisions /
 * loadSafe / loadDayLines / loadPerformance / loadPerfSessions / loadLedger /
 * loadLegs / loadTender / loadTenderRows / loadPickers` — as one keyed read
 * per grid.
 *
 * Each grid is read when its key moves: what it reads (its tokens, every one
 * sent), the grid id the directory resolved, and a tick that F5 and a tab
 * change bump (Qt `refreshTab` on both). A read for a key since moved is
 * dropped by its effect's cleanup; while the next answer is out the last
 * one stays on screen, as Qt's table does until `fillTable` refills it.
 * Every page is read (the runner stops at 100 a page; `gridRows` goes to 2,000).
 *
 * The tab showing is the only one read. A detail grid follows the picked main
 * row, and waits for the main grid's first answer, so a remembered pick does
 * not read "everyone" first and the picked person a moment later.
 */
import { useEffect, useState } from "react";

import { useGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import { toast } from "@/lib/notify";
import { useTillSessionClient } from "../shared/api/till-session-api";
import { tillErrorOf } from "../shared/errors";
import { textOf } from "../shared/format";
import type { GridRow } from "../shared/wire/types";
import {
  ROW_ORDER,
  approverParams,
  branchPickerParams,
  cashierSessionsParams,
  decisionsParams,
  exceptionEventsParams,
  exceptionHoursParams,
  exceptionsParams,
  baseParams,
  ledgerLegsParams,
  ledgerParams,
  peopleParams,
  pickRowById,
  pickRowOrFirst,
  pickSafeDay,
  pickTenderRow,
  pickVarianceRow,
  remittanceParams,
  safeDayLinesParams,
  safeDaysParams,
  tenderParams,
  tenderRowsParams,
  varianceParams,
  type ReportFilters,
  type ReportPicks,
  type ReportTab,
} from "./till-reports";

/** A grid's rows on screen. `answerKey` names the answer they are (a detail pick is only good for it). */
export type GridRead = {
  rows: readonly GridRow[];
  loading: boolean;
  error: string;
  /** An answer has landed (for any key). */
  settled: boolean;
  answerKey: string;
};

type Answer = { key: string; rows: readonly GridRow[]; error: string };

const NO_ROWS: readonly GridRow[] = [];
const NO_ANSWER: Answer = { key: "", rows: NO_ROWS, error: "" };

/** One popup for a burst: the reads that fail together (the server down) say it once. */
const READ_FAILED_TOAST = "till-reports-read";

type Order = (rows: readonly GridRow[]) => GridRow[];

/**
 * One configured grid, read whenever `params` (null = not now) or `tick`
 * moves. `order` puts a time-ordered grid's rows back in its SQL order; it
 * must be a module-level function (it is an effect dependency).
 */
export function useGridRead(
  grid: ConfiguredGridKey,
  params: Record<string, string> | null,
  tick: number,
  failure: string,
  order?: Order,
): GridRead {
  const client = useTillSessionClient();
  const gridId = useGridId(grid);
  const paramsJson = params ? JSON.stringify(params) : null;
  const key = paramsJson === null ? "" : `${gridId}|${tick}|${paramsJson}`;
  const [answer, setAnswer] = useState<Answer>(NO_ANSWER);

  useEffect(() => {
    if (paramsJson === null) return;
    let cancelled = false;
    const asked = `${gridId}|${tick}|${paramsJson}`;
    client
      .gridRows(grid, JSON.parse(paramsJson) as Record<string, string>)
      .then((rows) => {
        if (!cancelled) setAnswer({ key: asked, rows: order ? order(rows) : rows, error: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        toast.apiError(error, { fallback: failure, toastId: READ_FAILED_TOAST });
        setAnswer({ key: asked, rows: NO_ROWS, error: tillErrorOf(error, failure).text });
      });
    return () => {
      cancelled = true;
    };
  }, [client, failure, grid, gridId, order, paramsJson, tick]);

  if (paramsJson === null) return { rows: NO_ROWS, loading: false, error: "", settled: false, answerKey: "" };
  return {
    rows: answer.rows,
    loading: answer.key !== key,
    error: answer.key === key ? answer.error : "",
    settled: answer.key !== "",
    answerKey: answer.key,
  };
}

// ─── the pickers ─────────────────────────────────────────────────────────────

/**
 * The filter bar's lists (Qt `loadPickers`): the branch's counters and safes
 * (none with every branch) and the people who ran a session / decided a
 * request. Read when the branch moves — never by F5, as Qt.
 */
export function useReportPickers(companyId: string, branchId: string) {
  const branchParams = branchId ? branchPickerParams(companyId, branchId) : null;
  const counters = useGridRead("tillCounterList", branchParams, 0, "The counters could not be read.");
  const safes = useGridRead("tillSafeList", branchParams, 0, "The safes could not be read.");
  const cashiers = useGridRead(
    "tillRptPeople",
    peopleParams(companyId, branchId, "CASHIER"),
    0,
    "The cashiers could not be read.",
  );
  const approvers = useGridRead(
    "tillRptPeople",
    peopleParams(companyId, branchId, "APPROVER"),
    0,
    "The approvers could not be read.",
  );
  return { counters, safes, cashiers, approvers };
}

// ─── the tabs ────────────────────────────────────────────────────────────────

export type TillReportsInput = {
  tab: ReportTab;
  /** As read: every picker's value already settled against its list. */
  filters: ReportFilters;
  today: string;
  tick: number;
  picks: ReportPicks;
  /** Why the safe book cannot be read now, or "". */
  safeProblem: string;
};

/** Every grid of the seven tabs; only the showing tab's are read. */
export function useTillReports({ tab, filters, today, tick, picks, safeProblem }: TillReportsInput) {
  // ── 1 · Cashier variance ───────────────────────────────────────────────
  const variance = useGridRead(
    "tillRptCashierVariance",
    tab === "variance" ? varianceParams(filters, today) : null,
    tick,
    "The cashier variance could not be read.",
  );
  const cashierRow = tab === "variance" ? pickVarianceRow(variance.rows, picks.cashier) : null;
  const sessions = useGridRead(
    "tillRptCashierSessions",
    cashierRow ? cashierSessionsParams(filters, today, textOf(cashierRow, "cashier_id")) : null,
    tick,
    "The cashier's sessions could not be read.",
    ROW_ORDER.sessions,
  );

  // ── 2 · Exceptions ─────────────────────────────────────────────────────
  const onExceptions = tab === "exceptions";
  const exceptions = useGridRead(
    "tillRptExceptions",
    onExceptions ? exceptionsParams(filters, today) : null,
    tick,
    "The exceptions could not be read.",
  );
  const hours = useGridRead(
    "tillRptExceptionHours",
    onExceptions ? exceptionHoursParams(filters, today) : null,
    tick,
    "The exceptions by hour could not be read.",
    ROW_ORDER.hours,
  );
  const personRow = pickRowById(exceptions.rows, "person_id", picks.person);
  const events = useGridRead(
    "tillRptExceptionEvents",
    onExceptions && exceptions.settled
      ? exceptionEventsParams(filters, today, personRow ? textOf(personRow, "person_id") : null, picks.hour)
      : null,
    tick,
    "The exception events could not be read.",
    ROW_ORDER.events,
  );

  // ── 3 · Approver activity ──────────────────────────────────────────────
  const onApprovers = tab === "approvers";
  const approvers = useGridRead(
    "tillRptApprovers",
    onApprovers ? approverParams(filters, today) : null,
    tick,
    "The approver activity could not be read.",
  );
  const undecided = useGridRead(
    "tillRptUndecided",
    onApprovers ? approverParams(filters, today) : null,
    tick,
    "The requests not decided could not be read.",
    ROW_ORDER.undecided,
  );
  const approverRow = pickRowById(approvers.rows, "approver_id", picks.approver);
  const decisions = useGridRead(
    "tillRptApproverDecisions",
    onApprovers && approvers.settled
      ? decisionsParams(filters, today, approverRow ? textOf(approverRow, "approver_id") : null)
      : null,
    tick,
    "The decisions could not be read.",
    ROW_ORDER.decisions,
  );

  // ── 4 · Safe book ──────────────────────────────────────────────────────
  const onSafe = tab === "safe";
  const safeDays = useGridRead(
    "tillRptSafeDays",
    onSafe && !safeProblem ? safeDaysParams(filters, today) : null,
    tick,
    "The safe book could not be read.",
    ROW_ORDER.safeDays,
  );
  const dayRow = onSafe && !safeProblem ? pickSafeDay(safeDays.rows, picks.day) : null;
  const dayLines = useGridRead(
    "tillRptSafeDayLines",
    dayRow ? safeDayLinesParams(filters, textOf(dayRow, "day")) : null,
    tick,
    "The day's lines could not be read.",
    ROW_ORDER.dayLines,
  );
  // Grid 157 needs a branch (its `ibranch_id` is not optional).
  const remits = useGridRead(
    "tillRemittances",
    onSafe && filters.branchId ? remittanceParams(filters, today) : null,
    tick,
    "The remittances could not be read.",
    ROW_ORDER.remits,
  );

  // ── 5 · Cashier performance ────────────────────────────────────────────
  const onPerformance = tab === "performance";
  const performance = useGridRead(
    "tillRptCashierPerformance",
    onPerformance ? baseParams(filters, today) : null,
    tick,
    "The cashier performance could not be read.",
  );
  const performerRow = onPerformance ? pickVarianceRow(performance.rows, picks.performer) : null;
  const perfSessions = useGridRead(
    "tillRptPerformanceSessions",
    performerRow ? cashierSessionsParams(filters, today, textOf(performerRow, "cashier_id")) : null,
    tick,
    "The cashier's sessions could not be read.",
    ROW_ORDER.sessions,
  );

  // ── 6 · Ledger check ───────────────────────────────────────────────────
  const onLedger = tab === "ledger";
  const ledger = useGridRead(
    "tillRptLedgerCheck",
    onLedger ? ledgerParams(filters, today) : null,
    tick,
    "The ledger check could not be read.",
  );
  const ledgerRow = onLedger ? pickRowOrFirst(ledger.rows, "tss_id", picks.ledgerSession) : null;
  const legs = useGridRead(
    "tillRptLedgerLegs",
    ledgerRow ? ledgerLegsParams(filters.companyId, textOf(ledgerRow, "tss_id")) : null,
    tick,
    "The session's ledger legs could not be read.",
    ROW_ORDER.legs,
  );

  // ── 7 · Tender reconciliation ──────────────────────────────────────────
  const onTender = tab === "tender";
  const tender = useGridRead(
    "tillRptTenderRecon",
    onTender ? tenderParams(filters, today) : null,
    tick,
    "The tender reconciliation could not be read.",
  );
  const tenderRow = onTender ? pickTenderRow(tender.rows, picks.tenderKey) : null;
  const tenderRows = useGridRead(
    "tillRptTenderRows",
    tenderRow
      ? tenderRowsParams(filters.companyId, textOf(tenderRow, "tss_id"), textOf(tenderRow, "tender_type_id"))
      : null,
    tick,
    "The tender rows could not be read.",
    ROW_ORDER.tenderRows,
  );

  return {
    variance,
    cashierRow,
    sessions,
    exceptions,
    hours,
    personRow,
    events,
    approvers,
    undecided,
    approverRow,
    decisions,
    safeDays,
    dayRow,
    dayLines,
    remits,
    performance,
    performerRow,
    perfSessions,
    ledger,
    ledgerRow,
    legs,
    tender,
    tenderRow,
    tenderRows,
  };
}

export type TillReportsModel = ReturnType<typeof useTillReports>;
