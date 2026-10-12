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
 *   F5  Cash movement                   pickup / top-up (supervisor) — S3, on a
 *                                       session still taking money
 *   F6  Count / close                   the cash office's count — S4, on a
 *                                       COUNTING session
 *   Ctrl+H                              the session's journal (grid 145)
 *
 * Filters: Status (`istatus`) and Variance (`ivariance`), and the business
 * dates, seven days back. All six grid tokens are always sent
 * (`session-list.ts`).
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
import { addDaysIso, cockpitHref, textOf, todayIso } from "../shared/format";
import { formatFigure, formatSignedMoney, toPaise } from "../shared/money";
import { TonePill, overlayOpen } from "../shared/till-dialog";
import type { TillSessionKey } from "../shared/wire/types";
import tillStyles from "../shared/till.module.scss";
import { CashMovementDialog } from "../session/cash-movement-dialog";
import { EndShiftDialog } from "../session/end-shift-dialog";
import { JournalDialog } from "./journal-dialog";
import {
  DEFAULT_DAYS_BACK,
  STATUS_OPTIONS,
  VARIANCE_OPTIONS,
  awaitsCount,
  badgeTone,
  rowHint,
  sessionGridParams,
  sessionRowOf,
  takesMoney,
  varianceTone,
  type SessionRow,
} from "./session-list";

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
  status_text: (row: MasterTableRow) => {
    const text = textOf(sourceOf(row), "status_text");
    return text ? <TonePill tone={badgeTone("status_text", text)}>{text}</TonePill> : null;
  },
  treatment: (row: MasterTableRow) => {
    const text = textOf(sourceOf(row), "treatment");
    return text ? <TonePill tone={badgeTone("treatment", text)}>{text}</TonePill> : null;
  },
  net_sales: (row: MasterTableRow) => formatFigure(sourceOf(row)?.net_sales),
  cash_expected: (row: MasterTableRow) => formatFigure(sourceOf(row)?.cash_expected),
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
  const [movementKey, setMovementKey] = useState<TillSessionKey | null>(null);
  const [countKey, setCountKey] = useState<TillSessionKey | null>(null);
  const [journalRow, setJournalRow] = useState<SessionRow | null>(null);
  /** The highlighted row, as the hint callback last saw it. */
  const selected = useRef<SessionRow | null>(null);

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
    }): Record<string, string> => ({
      page: String(currentPage),
      limit: String(pageSize),
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(sortBy ? { sort_by: sortBy } : {}),
      ...(sortBy && sortDir ? { sort_dir: sortDir } : {}),
      grid_param: JSON.stringify(sessionGridParams({ companyId, branchId, fromDate, toDate, status, variance })),
    }),
    [branchId, companyId, fromDate, status, toDate, variance],
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

  const openMovement = useCallback(() => {
    const row = selected.current;
    if (!row || !takesMoney(row.status)) {
      toast.warn("Highlight a session still taking money (OPEN or SUSPENDED) first.");
      return;
    }
    setMovementKey(row.key);
  }, []);

  const openCount = useCallback(() => {
    const row = selected.current;
    if (!row || !awaitsCount(row.status)) {
      toast.warn("Highlight a session whose billing has ended (COUNTING) first.");
      return;
    }
    setCountKey(row.key);
  }, []);

  const dialogOpen = movementKey !== null || countKey !== null || journalRow !== null;

  // F5 cash movement · F6 count / close · Enter the cockpit — the Qt keys.
  // Quiet while a dialog is up, so its own keys are not also this screen's.
  useEffect(() => {
    if (dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
      if (overlayOpen()) return;
      if (event.key === "F5") {
        event.preventDefault();
        openMovement();
      } else if (event.key === "F6") {
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
  }, [dialogOpen, openCockpit, openCount, openMovement]);

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
      </>
    ),
    [applyPeriod, fromDate, period, status, toDate, variance],
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
      const live = row ? takesMoney(row.status) : false;
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
            className={`${masterStyles.iconBtn} ${masterStyles.iconBtnImport} erp-ms-tbtn`}
            title={
              live
                ? "Pickup / top-up (supervisor), drop / paid in — on a session still taking money (F5)"
                : "Only a session still taking money (OPEN / SUSPENDED) moves cash."
            }
            disabled={!live}
            onClick={openMovement}
          >
            <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
              <ErpActionIcon name="import" />
            </span>
            <span>Cash movement</span>
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
        </>
      );
    },
    [openCockpit, openCount, openMovement],
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
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
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
      <CashMovementDialog
        sessionKey={movementKey}
        initialMode="PICKUP"
        onClose={() => {
          setMovementKey(null);
          refresh();
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
    </>
  );
}
