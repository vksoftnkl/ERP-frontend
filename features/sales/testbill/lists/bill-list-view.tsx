"use client";

/**
 * The screen the menu lands on: the bill register, built on the same
 * `CrudMasterPage` shell every master page (and the quotation and sale-order
 * lists) uses, so it inherits the identical header, icon toolbar,
 * configured-column table, row actions, pagination, audit history, keyboard
 * hints and grid-settings context menu.
 *
 * Like its two siblings, a bill is not editable in a modal form, so Create and
 * Edit hand off to the voucher screen through `onCreateAction` / `onEditAction`
 * and the shell's own form never opens.
 *
 * Which columns appear, in what order and how wide is grid 86's own config, read
 * through `/configured-grid-sql/columns` — a config change moves this list
 * without touching code. Its SQL binds FIVE named tokens and none of them is
 * optional: left unbound they reach Postgres as string literals and the `::uuid`
 * cast fails, so `buildListQuery` always sends all five.
 *
 * **`iacc_year` is the one grid 87 does not have**, and that difference is
 * right rather than an oversight: `sale_bill` is partitioned by `sb_acc_year`,
 * so a list spanning years would scan every partition. The year comes off the
 * business context, not off a filter, because a bill cannot be moved between
 * years anyway.
 *
 * ---
 *
 * **There is no Delete, and that is the most important line in this file.**
 *
 * `POST /bills/delete` does not delete a bill. It cancels the SALE ORDER the
 * bill was raised against — writing off every open line of it — and leaves the
 * bill row, its lines, its charges, its tenders and its voucher posting
 * completely untouched. Wiring the shell's trash icon to that endpoint would
 * mean an operator pressing Delete on a bill silently cancelled somebody's
 * order and saw a "deleted" toast for a document that is still there.
 *
 * So the action is disabled for every row (`isRowDeleteDisabled`), the endpoint
 * is deliberately left EMPTY rather than pointed at that route, and cancelling
 * the source order lives on the voucher screen where it can ask for the reason
 * the server requires. A bill, once posted, is corrected by a sale return.
 *
 * Two things grid 86 does not project, and their consequences:
 *  - `sb_is_deleted` and `sb_cancelled_on`, so a cancelled bill is recognisable
 *    only by the `CANCELLED` status — which is what `isCancelledRow` reads;
 *  - `sb_src_doc_type`, so a bill raised from an order cannot be badged here.
 *    The entry screen shows the chip.
 */
import { useCallback, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { formatCurrency } from "@/domain/pricing";
import { CONFIGURED_GRID_RUN_ENDPOINT } from "@/features/sales/quotation/quotation.constants";
import {
  accountingYearOf,
  addDays,
  toDateInput,
  todayIso,
  toNumber,
} from "@/features/sales/quotation/quotation.utils";
// The date-filter inputs and the status pills are the SALES VOUCHER list's
// styling, which the sale order defined first. Shared rather than duplicated for
// the same reason this screen shares its grids: two registers that look
// different for no reason are two registers to learn.
import orderStyles from "@/features/sales/sale-order/page.module.scss";
import {
  BILL_GET_ENDPOINT,
  BILL_LIST_GRID_KEY,
  BILL_LIST_WINDOW_DAYS,
  BILL_SAVE_ENDPOINT,
} from "@/features/sales/testbill/constants";
import type { SaleBillDocKey } from "@/features/sales/testbill/types";


const API_ENDPOINTS = {
  getById: BILL_GET_ENDPOINT,
  create: BILL_SAVE_ENDPOINT,
  // Empty ON PURPOSE — see the module comment. `isRowDeleteDisabled` below
  // refuses every row, so nothing reaches this; and if that gate ever regressed,
  // a request to "" fails loudly instead of quietly cancelling a sales order.
  delete: "",
} as const;

/** A castable uuid keeps the pre-context request empty rather than failing. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * A bill has no code / short / alias / active column, so these name the closest
 * identifying grid aliases. They drive the row label and the fallback table used
 * when the grid-column config cannot be fetched.
 */
const LOOKUP_KEYS = {
  id: ["sb_id", "sbId"],
  code: ["sb_bill_refno", "sbBillRefno"],
  name: ["cus_name", "sbCustName"],
  short: ["sb_bill_type", "sbBillType"],
  alias: ["cus_addr3", "sbCustPlace"],
  active: ["sb_status", "sbStatus"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

/** Only `id` is used — the shell's form, which owns the rest, never opens here. */
const REQUEST_PAYLOAD_KEYS = {
  id: "sbId",
  name: "sbCustName",
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

/**
 * Grid 86 projects no `sb_is_deleted` and no `sb_cancelled_on`, so the status is
 * the only signal the list has that a bill has been cancelled.
 */
function isCancelledRow(row: MasterTableRow): boolean {
  return (
    asText(sourceValue(row, "sb_status")).trim().toUpperCase() === "CANCELLED"
  );
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: orderStyles.statusPillDraft,
  POSTED: orderStyles.statusPillCompleted,
  CANCELLED: orderStyles.statusPillCancelled,
};

/** Per-column formatting, keyed by grid 86's own SQL field names. */
const COLUMN_RENDER_OVERRIDES = {
  sb_bill_date: (row: MasterTableRow) =>
    toDateInput(asText(sourceValue(row, "sb_bill_date"))),
  sb_bill_amt: (row: MasterTableRow) =>
    formatCurrency(toNumber(asText(sourceValue(row, "sb_bill_amt"))), 2, true),
  sb_status: (row: MasterTableRow) => {
    const status = asText(sourceValue(row, "sb_status")).trim().toUpperCase();
    if (!status) {
      return "";
    }
    return (
      <span
        className={`${orderStyles.statusPill} ${STATUS_CLASS[status] ?? orderStyles.statusPillDraft}`}
      >
        {status}
      </span>
    );
  },
};

/** The whole document key, not just the id: a bill is keyed by four fields. */
function docKeyOf(row: MasterTableRow): SaleBillDocKey {
  return {
    sbId: asText(sourceValue(row, "sb_id")),
    sbCompanyId: asText(sourceValue(row, "sb_company_id")),
    sbBranchId: asText(sourceValue(row, "sb_branch_id")),
    sbAccYear: asText(sourceValue(row, "sb_acc_year")),
  };
}

/**
 * The Period presets, in days back from today. `custom` leaves the dates alone.
 *
 * Shorter than the order's, and deliberately: a counter looks up this morning's
 * bill, not last quarter's. Anything older is a report's job.
 */
const PERIOD_OPTIONS = [
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  {
    value: String(BILL_LIST_WINDOW_DAYS),
    label: `Last ${BILL_LIST_WINDOW_DAYS} days`,
  },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

export type BillListViewProps = {
  onCreate: () => void;
  onOpen: (key: SaleBillDocKey, mode: "browse" | "entry") => void;
};

export function BillListView({ onCreate, onOpen }: BillListViewProps) {
  const { activeCompany, activeBranch, activeFiscalYear } =
    useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";
  // The stored fiscal year, falling back to the one today's date lands in. The
  // two disagree only around 1 April, and `sb_acc_year` is a partition key, so
  // the stored one wins wherever it exists.
  const accYear =
    (activeFiscalYear?.name ?? "").trim() || accountingYearOf(todayIso());

  /*
   * The row the print dialog is about. Held here rather than read back off the
   * shell's selection: the dialog outlives the click that opened it, and a
   * selection that moved underneath it would print a different bill than the one
   * asked for. The F8 picker on the entry screen holds its own row for the same
   * reason.
   */
  /*
   * What the print dialog is open on.
   *
   * A LIST, because the register prints either the highlighted row or every row
   * the operator has ticked, and both end in the same dialog. Empty means the
   * dialog is closed. `printRefno` names a single bill on the popup's heading
   * and is left blank for a batch, which is named by its count instead.
   */
  const [printTargets, setPrintTargets] = useState<SaleBillDocKey[]>([]);
  const [printRefno, setPrintRefno] = useState<string>("");

  const [fromDate, setFromDate] = useState(() =>
    addDays(todayIso(), -BILL_LIST_WINDOW_DAYS),
  );
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(BILL_LIST_WINDOW_DAYS));

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
    // "Today" is a one-day window, not a zero-day one: `from` and `to` both sit
    // on today, and the grid's `>=` / `<=` guards include it.
    setFromDate(days <= 1 ? todayIso() : addDays(todayIso(), -days));
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
      // Grid 86 binds these five and only these five. The dates travel as ""
      // when unbounded, which its `NULLIF('ifrom_date','') IS NULL OR …` guards
      // read as "no bound"; an absent key would leave the token in the SQL.
      grid_param: JSON.stringify({
        icompany_id: companyId || NO_TENANT_ID,
        ibranch_id: branchId || NO_TENANT_ID,
        iacc_year: accYear,
        ifrom_date: fromDate,
        ito_date: toDate,
      }),
    }),
    [accYear, branchId, companyId, fromDate, toDate],
  );

  /**
   * Re-runs the list when the window or the scope moves. The shell keys its own
   * list state off this, so changing a date resets to page 1 rather than leaving
   * the operator on page 4 of a list that just got shorter.
   */
  const listStateResetKey = `${companyId}|${branchId}|${accYear}|${fromDate}|${toDate}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="sale-bill-from">
            From
          </label>
          <input
            id="sale-bill-from"
            type="date"
            className={orderStyles.filterDateInput}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="sale-bill-to">
            To
          </label>
          <input
            id="sale-bill-to"
            type="date"
            className={orderStyles.filterDateInput}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label
            className={masterStyles.filterLabel}
            htmlFor="sale-bill-period"
          >
            Period
          </label>
          <select
            id="sale-bill-period"
            className={orderStyles.filterSelect}
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

  return (
    <>
      <CrudMasterPage
        title="Sales Entry"
        listSubtitleOverride="Bills raised against customers — what was sold, what was taken and what is still owed."
        buildListQuery={buildListQuery}
        listStateResetKey={listStateResetKey}
        entityLabel="bill"
        entityLabelPlural="bills"
        searchPlaceholder="party name, bill no or status"
        apiEndpoints={API_ENDPOINTS}
        gridKey={BILL_LIST_GRID_KEY}
        lookupKeys={LOOKUP_KEYS}
        requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
        styles={masterStyles}
        listTitle="Bill Register"
        createLabel="New Bill"
        codeColumnHeader="Bill No"
        nameColumnHeader="Customer"
        // Without this the shell defaults to the response-driven column mode and a
        // configured grid with no `styles` array renders a serial column only.
        listResponseStyleArrayKey=""
        gridTableName="sale_bill"
        useConfiguredGridColumnsOnly
        enableGridSettingsContextMenu
        columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
        toolbarContent={toolbarContent}
        rowClassName={(row) =>
          isCancelledRow(row) ? orderStyles.cancelledRow : undefined
        }
        onCreateAction={onCreate}
        // A cancelled bill is readable but not writable: Edit greys out rather
        // than opening the voucher on a document the server would refuse.
        isRowEditDisabled={isCancelledRow}
        rowEditDisabledReason="This bill is cancelled and cannot be edited"
        onEditAction={(row) =>
          onOpen(docKeyOf(row), isCancelledRow(row) ? "browse" : "entry")
        }
        // Ctrl+Enter and double-click open the voucher to be READ — a bill has
        // lines, charges, tenders and adjustments, so it does not fit the shell's
        // view modal.
        onViewAction={(row) => onOpen(docKeyOf(row), "browse")}
        // NEVER. A bill is not deleted, and the route named `delete` cancels the
        // source ORDER instead — see the module comment. Cancelling that order is
        // a per-document decision that needs a reason the server requires, so it
        // lives on the voucher screen, not behind a trash icon on a register.
        isRowDeleteDisabled={() => true}
        rowDeleteDisabledReason="A bill is never deleted — correct it with a sale return, or cancel its source order from the bill itself"
        // Print the SELECTED row, through the same `SALE_INVOICE` purpose and the
        // same five-button dialog (Print, Preview, Format, Pdf, Cancel) the entry
        // screen's F8 picker already renders through — only the first of those
        // writes. The document key comes off the ROW rather than the screen's
        // company/branch/year: they agree today (grid 86 scopes on them), but the
        // accounting year decides which partition the renderer reads and it
        // belongs to the bill, not to the register.
        //
        // Deliberately NOT gated on `isCancelledRow`: a cancelled bill is still a
        // document that was issued, the row and its lines are untouched (that
        // route cancels the source ORDER), and the F8 picker prints one too.
        onPrintAction={(row) => {
          setPrintTargets([docKeyOf(row)]);
          setPrintRefno(asText(sourceValue(row, "sb_bill_refno")));
        }}
        // Tick several bills and Print renders them into ONE pdf, through the
        // same purpose, the same dialog and the same five buttons — the server
        // lays each out in turn and merges the pages, so Format and Preview
        // work on a batch exactly as they do on one bill.
        enableMultiSelect
        onBulkPrintAction={(rows) => {
          setPrintTargets(rows.map(docKeyOf));
          // No single refno names five bills; the dialog falls back to the count.
          setPrintRefno("");
        }}
        // One render binds ONE company and ONE accounting year for the whole
        // batch. Grid 86 already scopes the list to the header's company, branch
        // and year, so a mixed selection should be unreachable — this refuses it
        // anyway rather than quietly rendering one company's bills under
        // another's, which is precisely how a bill came out as blank paper
        // before the company was sent at all.
        bulkPrintDisabledReason={(rows) => {
          const distinct = (key: string) =>
            new Set(rows.map((row) => asText(sourceValue(row, key)))).size;
          if (distinct("sb_company_id") > 1) {
            return "Select bills from one company at a time.";
          }
          if (distinct("sb_acc_year") > 1) {
            return "Select bills from one accounting year at a time.";
          }
          return null;
        }}
        auditHistory={{
          // What the server stamps on `sale_bill` audit rows.
          screenName: "Sale Bill",
          getRecordId: (row) => asText(sourceValue(row, "sb_id")) || null,
          getDisplayName: (row) =>
            asText(sourceValue(row, "sb_bill_refno")) ||
            asText(sourceValue(row, "cus_name")) ||
            null,
        }}
      />
      {printTargets.length > 0 ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintTargets([])}
          purposeCode={PURPOSE_CODE.SALE_INVOICE}
          documentLabel={
            printTargets.length > 1
              ? `${printTargets.length} Bills`
              : printRefno
                ? `Bill ${printRefno}`
                : "Bill"
          }
          // Each row's own company and accounting year. Branch and counter are
          // claims on the access token and the server takes them from there;
          // the company is NOT left to the token, which carries the user's home
          // company while the header picker may be on another — the bill's
          // datasets all filter on it, and printed blank until it was sent.
          targets={printTargets.map((target) => ({
            docId: target.sbId,
            companyId: target.sbCompanyId,
            accYear: target.sbAccYear,
            filename: `bill-${printRefno || target.sbId}`,
          }))}
        />
      ) : null}
    </>
  );
}
