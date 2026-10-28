"use client";

/**
 * Expense Vouchers — the register the menu lands on (Qt `TxnDocTypes::
 * expenseVoucher()`: the receipt's register pointed at grid 137).
 *
 * Grid 137 "MAIN LIST - EXPENSE VOUCHERS" (resolved by name, `expenseVoucherList`)
 * binds six BARE tokens — `iavh_company_id`, `iavh_branch_id`, `iavh_acc_year`,
 * `iavh_status`, `ifrom_date`, `ito_date` — and an unbound bare token fails the
 * whole query, so all six are always sent ("" = no filter).
 *
 * Qt's row policy, kept:
 *  - every row OPENS (Edit / Enter / double-click) — the voucher itself says
 *    what may change: a DRAFT is edited and posted, a POSTED one only
 *    cancelled, a CANCELLED one read;
 *  - nothing is deleted here — the server has no delete route for an expense
 *    draft, and a posted voucher is cancelled from inside (Cancel voucher);
 *  - Print is the EXPENSE_VOUCHER purpose through the five-button dialog —
 *    the highlighted row, or every ticked one as one PDF. A draft has no
 *    number, so it does not print.
 * History (Ctrl+H) is the document's status trail (`txn_status_log`, EXPENSE).
 */
import { DateInput } from "@/components/design-system/ui/date-input";
import { useCallback, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import { TxnHistoryDialog, type TxnHistoryTarget } from "@/components/txn/txn-history-dialog";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { addDays, toDisplayDate, todayIso } from "@/features/sales/quotation/quotation.utils";
import { Chip } from "@/features/accounts/receipt/components/chip";
import type { ExpenseKeys, ExpensePrintTarget } from "../expense.types";
import { formatMoney } from "../domain/money";
import styles from "../expense.module.scss";

const DEFAULT_WINDOW_DAYS = 30;

/** A castable uuid, so a request before the header context lands comes back empty, not 400. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

const API_ENDPOINTS = {
  // The shell's own form never opens here — a voucher is a screen, not a
  // modal — so these exist only to satisfy the contract.
  getById: "/expenses/get",
  create: "/expenses/create",
  delete: "/expenses/get",
} as const;

const LOOKUP_KEYS = {
  id: ["avh_voucher_id"],
  code: ["avh_voucher_refno"],
  name: ["paid_to"],
  short: ["expense_heads"],
  alias: ["avh_voucher_refno"],
  active: ["avh_voucher_status"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

const REQUEST_PAYLOAD_KEYS = {
  id: "voucherId",
  name: "paid_to",
  alias: "",
  short: "",
  description: "",
  sort: "",
} as const;

function sourceValue(row: MasterTableRow, key: string): unknown {
  return (row.__source ?? {})[key];
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function statusOf(row: MasterTableRow): string {
  return asText(sourceValue(row, "avh_voucher_status")).trim().toUpperCase();
}

/** The whole document key: a voucher is addressed by four fields, never an id alone. */
export function expenseKeysOfRow(row: MasterTableRow): ExpenseKeys {
  return {
    voucherId: asText(sourceValue(row, "avh_voucher_id")),
    companyId: asText(sourceValue(row, "avh_company_id")),
    branchId: asText(sourceValue(row, "avh_branch_id")),
    accYear: asText(sourceValue(row, "avh_acc_year")).trim(),
  };
}

function printTargetOfRow(row: MasterTableRow): ExpensePrintTarget {
  return {
    ...expenseKeysOfRow(row),
    voucherNo: asText(sourceValue(row, "avh_voucher_refno")) || null,
  };
}

const COLUMN_RENDER_OVERRIDES = {
  avh_voucher_date: (row: MasterTableRow) =>
    toDisplayDate(asText(sourceValue(row, "avh_voucher_date")).slice(0, 10)),
  gst_bill_date: (row: MasterTableRow) => toDisplayDate(asText(sourceValue(row, "gst_bill_date")).slice(0, 10)),
  avh_doc_amount: (row: MasterTableRow) => formatMoney(sourceValue(row, "avh_doc_amount")),
  // A draft takes its number at post.
  avh_voucher_refno: (row: MasterTableRow) => asText(sourceValue(row, "avh_voucher_refno")) || "— draft —",
  avh_voucher_status: (row: MasterTableRow) => {
    const status = statusOf(row);
    return status ? <Chip value={status} /> : null;
  },
};

const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

export type ExpenseListViewProps = {
  onCreate: () => void;
  onOpen: (keys: ExpenseKeys) => void;
};

export function ExpenseListView({ onCreate, onOpen }: ExpenseListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const companyId = activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  const accYear = (activeFiscalYear?.name ?? "").trim();

  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -DEFAULT_WINDOW_DAYS));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(DEFAULT_WINDOW_DAYS));
  const [historyTarget, setHistoryTarget] = useState<TxnHistoryTarget | null>(null);
  /** What the print dialog is open on — held here, so a moving selection cannot change it. */
  const [printTargets, setPrintTargets] = useState<ExpensePrintTarget[]>([]);

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
        iavh_company_id: companyId || NO_TENANT_ID,
        iavh_branch_id: branchId || NO_TENANT_ID,
        iavh_acc_year: accYear,
        iavh_status: "",
        ifrom_date: fromDate,
        ito_date: toDate,
      }),
    }),
    [accYear, branchId, companyId, fromDate, toDate],
  );

  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="expense-from">
            From
          </label>
          <DateInput
            id="expense-from"
            className={styles.input}
            value={fromDate}
            max={toDate || undefined}
            onChange={(value) => {
              setFromDate(value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="expense-to">
            To
          </label>
          <DateInput
            id="expense-to"
            className={styles.input}
            value={toDate}
            min={fromDate || undefined}
            onChange={(value) => {
              setToDate(value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="expense-period">
            Period
          </label>
          <select
            id="expense-period"
            className={styles.select}
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
    [applyPeriod, fromDate, period, toDate],
  );

  const hintMessage = useCallback((row: MasterTableRow | null) => {
    if (!row) {
      return "";
    }
    switch (statusOf(row)) {
      case "DRAFT":
        return "Draft — no number yet. Open it to finish it and post it.";
      case "POSTED":
        return "Posted — cancel it from the voucher (Cancel voucher).";
      case "CANCELLED":
        return "Cancelled — open it to read it.";
      default:
        return "";
    }
  }, []);

  return (
    <>
      <CrudMasterPage
        title="Expense Vouchers"
        listTitleOverride="Expense Vouchers"
        listSubtitleOverride="Expenses paid by tender — at a till, from its drawer; in the back office, from the safe."
        entityLabel="expense voucher"
        entityLabelPlural="expense vouchers"
        searchPlaceholder="paid to, expense head or voucher no"
        apiEndpoints={API_ENDPOINTS}
        gridKey="expenseVoucherList"
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        createLabel="New Expense"
        codeColumnHeader="Voucher No"
        nameColumnHeader="Paid To"
        listResponseStyleArrayKey=""
        gridTableName="acc_voucher_header"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        toolbarContent={toolbarContent}
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        listEmptyText="No expense voucher in this window. Widen the dates, or make one."
        enableListActionKeys
        listHintMessage={hintMessage}
        rowClassName={(row) => (statusOf(row) === "CANCELLED" ? styles.cancelledRow : undefined)}
        permissionHref="/accounts/expense-voucher"
        onCreateAction={onCreate}
        onEditAction={(row) => onOpen(expenseKeysOfRow(row))}
        onViewAction={(row) => onOpen(expenseKeysOfRow(row))}
        isRowDeleteDisabled={() => true}
        rowDeleteDisabledReason="An expense voucher is not deleted: a draft stays until it is posted, and a posted one is cancelled from inside the voucher"
        onDeleteAction={() => false}
        // A draft took no number and moved no money, so it has no paper. A
        // cancelled voucher still prints — it was issued, and the paper says so.
        onPrintAction={(row) => setPrintTargets([printTargetOfRow(row)])}
        isRowPrintDisabled={(row) => statusOf(row) === "DRAFT"}
        rowPrintDisabledReason="A draft has no number yet — post it to print it"
        // Tick several and Print renders them into ONE pdf.
        enableMultiSelect
        onBulkPrintAction={(rows) => setPrintTargets(rows.map(printTargetOfRow))}
        // One render binds ONE company and ONE year; grid 137 already scopes to
        // both, so this mostly catches the drafts in a ticked set.
        bulkPrintDisabledReason={(rows) => {
          if (rows.some((row) => statusOf(row) === "DRAFT")) {
            return "Untick the drafts — a draft has no number to print.";
          }
          const distinct = (key: string) => new Set(rows.map((row) => asText(sourceValue(row, key)))).size;
          if (distinct("avh_company_id") > 1) {
            return "Select vouchers from one company at a time.";
          }
          if (distinct("avh_acc_year") > 1) {
            return "Select vouchers from one accounting year at a time.";
          }
          return null;
        }}
        onHistoryAction={(row) => {
          const keys = expenseKeysOfRow(row);
          if (!keys.voucherId) {
            return;
          }
          setHistoryTarget({
            docId: keys.voucherId,
            companyId: keys.companyId,
            accYear: keys.accYear,
            refNo: asText(sourceValue(row, "avh_voucher_refno")),
          });
        }}
      />
      <TxnHistoryDialog
        target={historyTarget}
        docLabel="Expense Voucher"
        onClose={() => setHistoryTarget(null)}
      />
      {printTargets.length > 0 ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintTargets([])}
          purposeCode={PURPOSE_CODE.EXPENSE_VOUCHER}
          documentLabel={
            printTargets.length > 1
              ? `${printTargets.length} Expense Vouchers`
              : `Expense ${printTargets[0].voucherNo ?? ""}`.trim()
          }
          // Each row's own company and year — the token's company is the
          // user's home one, and every dataset filters on it.
          targets={printTargets.map((target) => ({
            docId: target.voucherId,
            companyId: target.companyId,
            accYear: target.accYear,
            filename: `expense-${target.voucherNo || target.voucherId}`,
          }))}
        />
      ) : null}
    </>
  );
}
