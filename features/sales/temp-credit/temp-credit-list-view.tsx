"use client";

/**
 * Temp Credits (menu 257) — who took goods on a promise, and what is still
 * owed. The Qt `TxnDocTypes::tempCredits()` register, on the same
 * `CrudMasterPage` shell every voucher register uses, so it inherits the
 * header, the configured-column table (grid 114, "MAIN LIST - TEMP CREDITS"),
 * the row highlight, the pager and the grid-settings menu.
 *
 * ── What makes this register unlike the others ───────────────────────────
 *  1. **Nothing is made or changed here.** A temp credit is raised by a bill's
 *     TEMP_CR tender and settled by a receipt, so there is no Add, no Edit and
 *     no Delete (`hideWriteActions`). The row's verbs are its own:
 *     **Receive F5** — collect it: the receipt opens on the bill's ledger,
 *     narrowed to the borrower's mobile, with the bill ticked at its balance.
 *     **Follow-up F6** — record the chase: a promise date and a remark.
 *     **Open bill** (Enter / double-click) — the bill behind it, read-only.
 *     **History Ctrl+H** — the credit's own trail (grid 132), not the audit
 *     log of the row.
 *  2. **The balance is the BILL's.** The row carries the bill-balance id and
 *     the ledger the bill was raised on; a row with no balance row behind it
 *     has nothing for a receipt to settle, and Receive says so.
 *  3. **Every grid token is always sent**, "" for "no bound": an unsent token
 *     stays in the SQL as a bare word and the whole query fails.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { ErpActionIcon } from "@/components/design-system/icons/erp-action-icons";
import { useBusinessContext } from "@/components/layout/business-context";
import { toast } from "@/lib/notify";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { addDays, todayIso } from "@/features/sales/quotation/quotation.utils";
import type { SaleBillDocKey } from "@/features/sales/salebill/salebill.types";
import { Chip, type ChipTone } from "@/features/accounts/receipt/components/chip";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { buildReceiptCollectHref } from "@/features/accounts/receipt/domain/collect";
import receiptStyles from "@/features/accounts/receipt/page.module.scss";
import { FollowUpDialog } from "./follow-up-dialog";
import { HistoryDialog } from "./history-dialog";
import {
  billKeyOf,
  collectArgsOf,
  displayDate,
  hasBalance,
  tempCreditOf,
  type TempCreditRow,
} from "./row";

/** The window the register opens on: a year — a promise can be an old one. */
const DEFAULT_WINDOW_DAYS = 365;

/** A castable uuid, so a pre-context request comes back empty instead of 400. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const API_ENDPOINTS = {
  // The shell's own form never opens here; these only satisfy the contract.
  getById: "/temp-credits/open",
  create: "/temp-credits/follow-up",
  delete: "/temp-credits/follow-up",
} as const;

/** Grid 114's own aliases, for the fallback table and the row's label. */
const LOOKUP_KEYS = {
  id: ["atc_id"],
  code: ["atc_bill_refno"],
  name: ["atc_name"],
  short: ["atc_mobile"],
  alias: ["atc_party_name"],
  active: ["atc_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "atcId",
  name: "atc_name",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

/** `istatus`: "" is the default pair, one status, or ALL. */
const STATUS_OPTIONS = [
  { value: "", label: "Open + Partial" },
  { value: "OPEN", label: "Open" },
  { value: "PARTIAL", label: "Partial" },
  { value: "SETTLED", label: "Settled" },
  { value: "WRITTEN_OFF", label: "Written off" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ALL", label: "All" },
] as const;

const PERIOD_OPTIONS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

/** What each status means, in the receipt's chip colours. */
const STATUS_TONES: Record<string, ChipTone> = {
  OPEN: "green",
  PARTIAL: "amber",
  SETTLED: "blue",
  WRITTEN_OFF: "grey",
  CANCELLED: "red",
};

function sourceText(row: MasterTableRow, key: string): string {
  const value = (row.__source ?? {})[key];
  return value === null || value === undefined ? "" : String(value);
}

/** Per-column formatting, keyed by grid 114's own SQL field names. */
const COLUMN_RENDER_OVERRIDES = {
  atc_bill_date: (row: MasterTableRow) => displayDate(sourceText(row, "atc_bill_date")),
  atc_due_date: (row: MasterTableRow) => displayDate(sourceText(row, "atc_due_date")),
  atc_promise_date: (row: MasterTableRow) => displayDate(sourceText(row, "atc_promise_date")),
  atc_credit_amount: (row: MasterTableRow) =>
    formatTotal(tempCreditOf(row)?.atc_credit_amount ?? 0),
  atc_balance_amount: (row: MasterTableRow) =>
    formatTotal(tempCreditOf(row)?.atc_balance_amount ?? 0),
  // Blank at zero: a column of noughts hides the rows that are actually late.
  days_overdue: (row: MasterTableRow) => {
    const days = tempCreditOf(row)?.days_overdue ?? 0;
    return days > 0 ? <Chip value={`${days} d`} tone="red" title="Days past the due date" /> : "";
  },
  atc_status: (row: MasterTableRow) => {
    const status = tempCreditOf(row)?.atc_status ?? "";
    return status ? <Chip value={status} tone={STATUS_TONES[status] ?? "grey"} /> : null;
  },
};

export type TempCreditListViewProps = {
  /** Open the bill behind the credit, read-only. */
  onOpenBill: (key: SaleBillDocKey) => void;
};

export function TempCreditListView({ onOpenBill }: TempCreditListViewProps) {
  const router = useRouter();
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();

  const [status, setStatus] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -DEFAULT_WINDOW_DAYS));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(DEFAULT_WINDOW_DAYS));
  const [followUpRow, setFollowUpRow] = useState<TempCreditRow | null>(null);
  const [historyRow, setHistoryRow] = useState<TempCreditRow | null>(null);
  /** Bumped after a follow-up so the shell re-reads the list. */
  const [refreshNonce, setRefreshNonce] = useState(0);
  /** The highlighted row, as the hint callback last saw it. */
  const selectedRow = useRef<TempCreditRow | null>(null);

  const applyPeriod = useCallback((value: string) => {
    setPeriod(value);
    if (value === "custom") {
      return;
    }
    const days = Number.parseInt(value, 10);
    if (!Number.isFinite(days)) {
      return;
    }
    setToDate(todayIso());
    setFromDate(addDays(todayIso(), -days));
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
      grid_param: JSON.stringify({
        icompany_id: companyId || NO_TENANT_ID,
        ibranch_id: branchId || NO_TENANT_ID,
        iacc_year: accYear,
        ifrom_date: fromDate,
        ito_date: toDate,
        istatus: status,
        ioverdue_only: overdueOnly ? "true" : "",
      }),
    }),
    [accYear, branchId, companyId, fromDate, overdueOnly, status, toDate],
  );

  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}|${status}|${overdueOnly}|${refreshNonce}`;

  // ── The row's verbs ───────────────────────────────────────────────────────
  const receive = useCallback(() => {
    const row = selectedRow.current;
    if (!hasBalance(row)) {
      toast.warn("Highlight a temp credit with a balance first.");
      return;
    }
    const args = collectArgsOf(row);
    if (!args) {
      // No separate collection form: the loan IS the bill's pending amount on
      // the ledger it was raised on, so without that row there is nothing to
      // settle.
      toast.warn(
        `Bill ${row?.atc_bill_refno || "—"} has no open balance row behind it, so there is nothing for a receipt to settle.`,
      );
      return;
    }
    router.push(buildReceiptCollectHref(args));
  }, [router]);

  const openFollowUp = useCallback(() => {
    const row = selectedRow.current;
    if (!hasBalance(row)) {
      toast.warn("Highlight a temp credit with a balance first.");
      return;
    }
    setFollowUpRow(row);
  }, []);

  const openHistory = useCallback(() => {
    const row = selectedRow.current;
    if (!row) {
      toast.warn("Highlight a temp credit first.");
      return;
    }
    setHistoryRow(row);
  }, []);

  const openBill = useCallback(
    (row: MasterTableRow) => {
      const key = billKeyOf(tempCreditOf(row));
      if (!key) {
        toast.warn("This credit names no bill to open.");
        return;
      }
      onOpenBill(key);
    },
    [onOpenBill],
  );

  // F5 receive, F6 follow-up, Ctrl+H history — the Qt keys. Quiet while a
  // dialog is up, so its own keys are not also this screen's.
  const dialogOpen = followUpRow !== null || historyRow !== null;
  useEffect(() => {
    if (dialogOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key === "F5" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        receive();
      } else if (event.key === "F6" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        openFollowUp();
      } else if (event.key.toLowerCase() === "h" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        openHistory();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, openFollowUp, openHistory, receive]);

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="tc-status">
            Status
          </label>
          <select
            id="tc-status"
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
        <div className={masterStyles.filterCheckGroup}>
          <label className={masterStyles.filterCheckLabel}>
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
            Overdue only
          </label>
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="tc-from">
            From
          </label>
          <input
            id="tc-from"
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
          <label className={masterStyles.filterLabel} htmlFor="tc-to">
            To
          </label>
          <input
            id="tc-to"
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
          <label className={masterStyles.filterLabel} htmlFor="tc-period">
            Period
          </label>
          <select
            id="tc-period"
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
    [applyPeriod, fromDate, overdueOnly, period, status, toDate],
  );

  /**
   * The hint bar: the keys, and what the highlighted row allows. The shell
   * hands over its selection here, which is how the verbs above know the row.
   */
  const hintMessage = useCallback((row: MasterTableRow | null) => {
    const credit = tempCreditOf(row);
    selectedRow.current = credit;
    const legend = "F5 receive · F6 follow-up · Enter opens the bill read-only · Ctrl+H history";
    if (!credit) {
      return legend;
    }
    let state: string;
    switch (credit.atc_status) {
      case "SETTLED":
        state = "Settled — nothing is owed. Ctrl+H shows how it was paid.";
        break;
      case "WRITTEN_OFF":
        state = "Written off — the balance was let go on a receipt.";
        break;
      case "CANCELLED":
        state = "Cancelled — the bill was voided or re-tendered.";
        break;
      default:
        state = credit.atc_promise_date
          ? `Promised for ${displayDate(credit.atc_promise_date)}.`
          : "No promise recorded yet — F6 records one.";
    }
    return `${state}  ${legend}`;
  }, []);

  const toolbarActions = (
    <>
      <span className="erp-ms-tsep" aria-hidden="true" />
      <button
        type="button"
        className={`${masterStyles.iconBtn} ${masterStyles.iconBtnEdit} erp-ms-tbtn`}
        title="Collect it: the receipt opens on this bill's party, filtered to the borrower's mobile, with the bill ticked at its balance (F5)"
        onClick={receive}
      >
        <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
          <ErpActionIcon name="import" />
        </span>
        <span>Receive</span>
      </button>
      <button
        type="button"
        className={`${masterStyles.iconBtn} ${masterStyles.iconBtnShipping} erp-ms-tbtn`}
        title="Record the chase: a promise date and a remark (F6)"
        onClick={openFollowUp}
      >
        <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
          <ErpActionIcon name="edit" />
        </span>
        <span>Follow-up</span>
      </button>
      <button
        type="button"
        className={`${masterStyles.iconBtn} ${masterStyles.iconBtnHistory} erp-ms-tbtn`}
        title="The credit's own history: given, followed up, paid (Ctrl+H)"
        onClick={openHistory}
      >
        <span className={`${masterStyles.iconBtnBox} erp-ms-tbtn-icon`}>
          <ErpActionIcon name="history" />
        </span>
        <span>History</span>
      </button>
    </>
  );

  return (
    <>
      <CrudMasterPage
        title="Temp Credits"
        listTitleOverride="Temp Credits"
        listSubtitleOverride="Who took goods on a promise, and what is still owed. The balance is the bill's."
        entityLabel="temp credit"
        entityLabelPlural="temp credits"
        searchPlaceholder="mobile, name or bill no"
        apiEndpoints={API_ENDPOINTS}
        gridKey="tempCreditList"
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        codeColumnHeader="Bill"
        nameColumnHeader="Name"
        listResponseStyleArrayKey=""
        gridTableName="acc_temp_credit"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        toolbarContent={toolbarContent}
        toolbarActions={toolbarActions}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText="No temp credit in this window. Widen the dates or the status."
        listHintMessage={hintMessage}
        // Made by a bill's tender, settled by a receipt: nothing is keyed here.
        hideWriteActions
        rowClassName={(row) =>
          tempCreditOf(row)?.atc_status === "CANCELLED" ? receiptStyles.cancelledRow : undefined
        }
        // Enter, Ctrl+Enter and double-click open the bill behind it, read-only.
        onEditAction={openBill}
        onViewAction={openBill}
      />
      <FollowUpDialog
        row={followUpRow}
        onClose={() => setFollowUpRow(null)}
        onSaved={() => {
          setFollowUpRow(null);
          setRefreshNonce((value) => value + 1);
        }}
      />
      <HistoryDialog row={historyRow} onClose={() => setHistoryRow(null)} />
    </>
  );
}
