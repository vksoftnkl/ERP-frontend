"use client";

/**
 * Till Sessions (S6, menu 273) — Qt `TxnMainView(TxnDocTypes::tillSessions())`:
 * every session of the branch over a business-date range, for supervisors,
 * findable by its oddities. Grid 144 "MAIN LIST - TILL SESSIONS" on the same
 * `CrudMasterPage` shell every register uses (configured columns, pager, grid
 * settings menu).
 *
 * No Add: a session is opened at a till (S1), never from a list. The row's
 * verbs are Qt's:
 *   Enter / Ctrl+Enter / double-click   the Session Cockpit (S5), on the row's
 *                                       own tenant key
 *   F6  Count / close                   the cash office's count — S4, on a
 *                                       COUNTING session
 *   Ctrl+H                              the session's journal (grid 145)
 * No cash movement from here (Qt a449b8c, notes 110): a pickup / top-up is
 * signed at the counter by the cashier and the supervisor together.
 *
 * Filters: Status (`istatus`) and Variance (`ivariance` — TO_APPROVE since
 * Qt c77f3f1: cash awaiting Approve Cash), and the business dates, seven days
 * back. All six grid tokens are always sent (`session-list.ts`).
 *
 * Pills: Status, Treatment and Cash (`cash_receipt`, notes 114) in the shared
 * session palette (`../shared/session-badges.ts`).
 *
 * The live line (Qt `TillSessionsView`, a449b8c) on the toolbar: every session
 * of the branch still holding a drawer, any date, and the cash in them; and in
 * the list, a live row's "Cash exp." — blank in the grid until the count —
 * carries the server's live figure (`../shared/live-cash.ts`).
 *
 * Waiting for approval (Qt 425fa80, notes 124 §5): a toolbar button whose
 * caption counts what waits for an approver at the branch (re-read with every
 * page of the list, and when the inbox closes; primary while any wait). It
 * opens the approvers' inbox (`approval-inbox-dialog.tsx`); its close reloads
 * the list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { ErpActionIcon } from "@/components/design-system/icons/erp-action-icons";
import { useBusinessContext } from "@/components/layout/business-context";
import { toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import receiptStyles from "@/features/accounts/receipt/page.module.scss";
import { INBOX_BUTTON_TIP } from "../shared/approval-gate";
import { addDaysIso, cockpitHref, textOf, todayIso } from "../shared/format";
import { LiveCashLine } from "../shared/live-cash-line";
import { formatFigure, formatMoney, formatSignedMoney, toPaise } from "../shared/money";
import { overlayOpen } from "../shared/till-dialog";
import type { TillSessionKey } from "../shared/wire/types";
import tillStyles from "../shared/till.module.scss";
import { useLiveCash } from "../shared/use-live-cash";
import { EndShiftDialog } from "../session/end-shift-dialog";
import { inboxButtonState } from "./approval-inbox";
import { ApprovalInboxDialog } from "./approval-inbox-dialog";
import { JournalDialog } from "./journal-dialog";
import { SessionBadge } from "./session-badge";
import {
  DEFAULT_DAYS_BACK,
  STATUS_OPTIONS,
  VARIANCE_OPTIONS,
  awaitsCount,
  rowHint,
  sessionGridParams,
  sessionRowOf,
  varianceTone,
  type SessionRow,
} from "./session-list";
import { useApprovalCount } from "./use-approval-count";

const API_ENDPOINTS = {
  // The shell's own form and delete never run here (no Add, no Edit, no
  // Delete); these only satisfy its contract.
  getById: "/till/sessions/get",
  create: "/till/sessions/open",
  delete: "/till/sessions/close",
} as const;

/** Grid 144's own aliases, for the fallback table and the row's label. */
const LOOKUP_KEYS = {
  id: ["tss_id"],
  code: ["tss_session_no"],
  name: ["cashier"],
  short: ["counter_code"],
  alias: ["business_date"],
  active: ["status_text"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "tssId",
  name: "cashier",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom" },
] as const;

function sourceOf(row: MasterTableRow | null): Record<string, unknown> | null {
  return row?.__source ?? null;
}

/** Per-column formatting, keyed by grid 144's own SQL field names. */
const COLUMN_RENDER_OVERRIDES = {
  status_text: (row: MasterTableRow) => <SessionBadge value={textOf(sourceOf(row), "status_text")} />,
  treatment: (row: MasterTableRow) => <SessionBadge value={textOf(sourceOf(row), "treatment")} />,
  // Notes 114: the hand-over waiting for Approve Cash (TO APPROVE · APPROVED · DIFFERENCE).
  cash_receipt: (row: MasterTableRow) => <SessionBadge value={textOf(sourceOf(row), "cash_receipt")} />,
  net_sales: (row: MasterTableRow) => formatFigure(sourceOf(row)?.net_sales),
  cash_counted: (row: MasterTableRow) => formatFigure(sourceOf(row)?.cash_counted),
  cash_variance: (row: MasterTableRow) => {
    const value = sourceOf(row)?.cash_variance;
    const paise = toPaise(value);
    if (paise === null) return "";
    const tone = varianceTone(value);
    return (
      <span className={tone === "red" ? tillStyles.toneRed : tone === "green" ? tillStyles.toneGreen : undefined}>
        {formatSignedMoney(paise)}
      </span>
    );
  },
};

/**
 * "Cash exp." with the live figure (Qt `TillSessionsView::fillCash`): the grid
 * has a session's expected cash only once it is counted, so a session still
 * holding a drawer shows what the server says it holds now.
 */
function cashExpectedRenderer(liveCash: ReadonlyMap<string, number>) {
  return function renderCashExpected(row: MasterTableRow) {
    const source = sourceOf(row);
    const live = liveCash.get(textOf(source, "tss_id"));
    if (live === undefined) return formatFigure(source?.cash_expected);
    return <span title="Live — the cash this drawer should hold now">{formatMoney(live)}</span>;
  };
}

export default function TillSessionsScreen() {
  const router = useRouter();
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";

  const [status, setStatus] = useState("");
  const [variance, setVariance] = useState("");
  const [fromDate, setFromDate] = useState(() => addDaysIso(todayIso(), -DEFAULT_DAYS_BACK));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(DEFAULT_DAYS_BACK));
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [countKey, setCountKey] = useState<TillSessionKey | null>(null);
  const [journalRow, setJournalRow] = useState<SessionRow | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  /** The highlighted row, as the hint callback last saw it. */
  const selected = useRef<SessionRow | null>(null);

  const {
    sessions: liveSessions,
    cashByTss: liveCash,
    refreshUnlessLoading: refreshLive,
  } = useLiveCash({ companyId, branchId });
  const {
    count: waitingCount,
    refresh: refreshWaiting,
    refreshUnlessLoading: refreshWaitingUnlessLoading,
  } = useApprovalCount({ companyId, branchId });
  const inboxButton = inboxButtonState(waitingCount);
  const columnRenderOverrides = useMemo(
    () => ({ ...COLUMN_RENDER_OVERRIDES, cash_expected: cashExpectedRenderer(liveCash) }),
    [liveCash],
  );

  const applyPeriod = useCallback((value: string) => {
    setPeriod(value);
    if (value === "custom") return;
    const days = Number.parseInt(value, 10);
    if (!Number.isFinite(days)) return;
    setToDate(todayIso());
    setFromDate(addDaysIso(todayIso(), -days));
  }, []);

  const buildListQuery = useCallback(
    ({
      searchTerm,
      currentPage,
      pageSize,
      sortBy,
      sortDir,
    }: {
      searchTerm: string;
      currentPage: number;
      pageSize: number;
      sortBy?: string;
      sortDir?: "asc" | "desc";
    }): Record<string, string> => {
      // A new nonce is a new function, which is what makes the shell re-read
      // (a changed listStateResetKey only moves it back to page 1) — so a
      // count or a Refresh on page 1 still reloads.
      void refreshNonce;
      // Every page load asks the live line again — the figures move with each
      // bill (Qt `TillSessionsView` on `dataLoaded`), unless a read is still on
      // the wire. The shell has no "page loaded" callback; it builds this query
      // once per page request, which is the same moment.
      refreshLive();
      // And the inbox button's count (Qt `refreshInboxCount` on `dataLoaded`).
      refreshWaitingUnlessLoading();
      return {
        page: String(currentPage),
        limit: String(pageSize),
        ...(searchTerm ? { search: searchTerm } : {}),
        ...(sortBy ? { sort_by: sortBy } : {}),
        ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
        grid_param: JSON.stringify(sessionGridParams({ companyId, branchId, fromDate, toDate, status, variance })),
      };
    },
    [branchId, companyId, fromDate, refreshLive, refreshNonce, refreshWaitingUnlessLoading, status, toDate, variance],
  );

  const listStateResetKey = `${companyId}|${branchId}|${fromDate}|${toDate}|${status}|${variance}|${refreshNonce}`;
  const refresh = useCallback(() => setRefreshNonce((value) => value + 1), []);

  // ── The row's verbs ─────────────────────────────────────────────────────
  const openCockpit = useCallback(
    (row: SessionRow | null) => {
      if (!row) {
        toast.warn("Highlight a till session first.");
        return;
      }
      router.push(cockpitHref(row.key));
    },
    [router],
  );

  const openCount = useCallback(() => {
    const row = selected.current;
    if (!row || !awaitsCount(row.status)) {
      toast.warn("Highlight a session whose billing has ended (COUNTING) first.");
      return;
    }
    setCountKey(row.key);
  }, []);

  const dialogOpen = countKey !== null || journalRow !== null || inboxOpen;

  // F6 count / close · Enter the cockpit — the Qt keys. Quiet while a dialog
  // is up, so its own keys are not also this screen's.
  useEffect(() => {
    if (dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (overlayOpen()) return;
      if (event.key === "F6") {
        event.preventDefault();
        openCount();
      } else if (event.key === "Enter") {
        // Only while the operator stands on the list itself (the shell keeps
        // Enter for the search box and the buttons).
        const target = event.target as HTMLElement | null;
        if (!target || target === document.body || target.closest("input, textarea, select, button, a, [contenteditable]")) return;
        if (!target.closest("table") && !target.querySelector("table")) return;
        event.preventDefault();
        openCockpit(selected.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, openCockpit, openCount]);

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="till-sessions-status">
            Status
          </label>
          <select
            id="till-sessions-status"
            className={receiptStyles.select}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="till-sessions-variance">
            Variance
          </label>
          <select
            id="till-sessions-variance"
            className={receiptStyles.select}
            value={variance}
            onChange={(event) => setVariance(event.target.value)}
          >
            {VARIANCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="till-sessions-from">
            From
          </label>
          <input
            id="till-sessions-from"
            type="date"
            className={receiptStyles.input}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="till-sessions-to">
            To
          </label>
          <input
            id="till-sessions-to"
            type="date"
            className={receiptStyles.input}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="till-sessions-period">
            Period
          </label>
          <select
            id="till-sessions-period"
            className={receiptStyles.select}
            value={period}
            onChange={(event) => applyPeriod(event.target.value)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {companyId && branchId ? (
          <div className={masterStyles.filterCheckGroup}>
            <LiveCashLine sessions={liveSessions} />
          </div>
        ) : null}
      </>
    ),
    [applyPeriod, branchId, companyId, fromDate, liveSessions, period, status, toDate, variance],
  );

  /** The hint bar: what the highlighted row allows. The shell hands its selection over here. */
  const hintMessage = useCallback((row: MasterTableRow | null) => {
    const session = sessionRowOf(sourceOf(row));
    selected.current = session;
    return rowHint(session);
  }, []);

  const toolbarActions = useCallback(
    (shellRow: MasterTableRow | null) => {
      const row = sessionRowOf(sourceOf(shellRow));
      const counting = row ? awaitsCount(row.status) : false;
      return (
        <>
          <span className="erp-ms-tsep" aria-hidden="true" />
          <button
            type="button"
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnEdit} erp-ms-tbtn`}
            title={row ? "The Session Cockpit: expected, counted, the documents and the journal (Enter)" : "Highlight a till session first."}
            disabled={!row}
            onClick={() => openCockpit(row)}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <ErpActionIcon name="search" />
            </span>
            <span>Cockpit</span>
          </button>
          <button
            type="button"
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnShipping} erp-ms-tbtn`}
            title={
              counting
                ? "Count the drawer of a session whose billing has ended, then close it — S4 (F6)"
                : "Only a session whose billing has ended (COUNTING) is counted."
            }
            disabled={!counting}
            onClick={openCount}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <ErpActionIcon name="edit" />
            </span>
            <span>Count / close</span>
          </button>
          <span className="erp-ms-tsep" aria-hidden="true" />
          <button
            type="button"
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnHistory} erp-ms-tbtn${inboxButton.primary ? " erp-ms-tbtn--primary" : ""}`}
            title={INBOX_BUTTON_TIP}
            disabled={!companyId || !branchId}
            onClick={() => setInboxOpen(true)}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <ErpActionIcon name="history" />
            </span>
            <span>{inboxButton.text}</span>
          </button>
        </>
      );
    },
    [branchId, companyId, inboxButton.primary, inboxButton.text, openCockpit, openCount],
  );

  return (
    <>
      <CrudMasterPage
        title="Till Sessions"
        listTitleOverride="Till Sessions"
        listSubtitleOverride="Every session of the branch, findable by its oddities — expected, counted and the variance are a supervisor's view, never the cashier's."
        entityLabel="till session"
        entityLabelPlural="till sessions"
        searchPlaceholder="session, counter or cashier"
        apiEndpoints={API_ENDPOINTS}
        gridKey="tillSessionList"
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        codeColumnHeader="Session"
        nameColumnHeader="Cashier"
        listResponseStyleArrayKey=""
        gridTableName="till_session"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={columnRenderOverrides}
        toolbarContent={toolbarContent}
        toolbarActions={toolbarActions}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText="No till session in this window. Widen the dates, the status or the variance."
        listHintMessage={hintMessage}
        // A session is opened at a till (S1), never from a list.
        hideWriteActions
        onViewAction={(row) => openCockpit(sessionRowOf(sourceOf(row)))}
        // Ctrl+H — the session's own journal (till_event), oldest first.
        onHistoryAction={(row) => {
          const session = sessionRowOf(sourceOf(row));
          if (session) setJournalRow(session);
        }}
      />
      <EndShiftDialog
        sessionKey={countKey}
        onClose={() => {
          setCountKey(null);
          refresh();
        }}
      />
      <JournalDialog session={journalRow} onClose={() => setJournalRow(null)} />
      <ApprovalInboxDialog
        open={inboxOpen}
        scope={{ companyId, branchId }}
        onClose={() => {
          setInboxOpen(false);
          refreshWaiting();
          refresh();
        }}
        onOpenCockpit={(key) => {
          setInboxOpen(false);
          router.push(cockpitHref(key));
        }}
      />
    </>
  );
}
