"use client";

/**
 * The screen the menu lands on: the sale-order list, built on the same
 * `CrudMasterPage` shell every master page (and the quotation list) uses, so it
 * inherits the identical header, icon toolbar, configured-column table, row
 * actions, delete confirmation, pagination, audit history, keyboard hints and
 * grid-settings context menu.
 *
 * Like the quotation's, an order is not editable in a modal form, so Create and
 * Edit hand off to the voucher screen through `onCreateAction` / `onEditAction`
 * and the shell's own form never opens.
 *
 * Which columns appear, in what order and how wide is grid 87's own config, read
 * through `/configured-grid-sql/columns` — a config change moves this list
 * without touching code. Its SQL binds four named tokens (`icompany_id`,
 * `ibranch_id`, `ifrom_date`, `ito_date`) and none of them is optional: left
 * unbound they reach Postgres as string literals and the `::uuid` cast fails, so
 * `buildListQuery` always sends all four. There is NO year token — the date
 * window is the scope, which is why this screen owns a From / To / Period
 * filter where the quotation list has none.
 *
 * Two things grid 87 does not project, and their consequences:
 *  - `so_src_doc_type`, so a converted-from-quotation order cannot be badged
 *    here (the entry screen shows the chip);
 *  - `so_is_deleted`, so a deleted order is recognisable only by the
 *    `CANCELLED` status the delete stamps on it. That is what
 *    `isCancelledRow` reads, and it is why the gate below is worded as
 *    "cancelled" rather than "deleted".
 */
import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import CrudMasterPage from "@/components/master/crud-master-page";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import { useBusinessContext } from "@/components/layout/business-context";
import masterStyles from "@/app/master/state-master/page.module.scss";
import { formatCurrency } from "@/domain/pricing";
import { CONFIGURED_GRID_RUN_ENDPOINT } from "@/features/sales/quotation/quotation.constants";
import { addDays, toDateInput, todayIso, toNumber } from "@/features/sales/quotation/quotation.utils";
import {
  SALE_ORDER_DELETE_ENDPOINT,
  SALE_ORDER_GET_ENDPOINT,
  SALE_ORDER_LIST_GRID_ID,
  SALE_ORDER_LIST_WINDOW_DAYS,
  SALE_ORDER_SAVE_ENDPOINT,
} from "../sale-order.constants";
import type { SaleOrderDocKey } from "../sale-order.types";
import styles from "../page.module.scss";

const GRID_DETAIL_ID = Number(SALE_ORDER_LIST_GRID_ID);

const API_ENDPOINTS = {
  list: `${CONFIGURED_GRID_RUN_ENDPOINT}?grid_id=${SALE_ORDER_LIST_GRID_ID}`,
  getById: SALE_ORDER_GET_ENDPOINT,
  create: SALE_ORDER_SAVE_ENDPOINT,
  delete: SALE_ORDER_DELETE_ENDPOINT,
} as const;

/** See the quotation list: a castable uuid keeps the pre-context request empty rather than failing. */
const NO_TENANT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * An order has no code / short / alias / active column, so these name the
 * closest identifying grid aliases. They drive the delete-confirmation label
 * and the fallback table used when the grid-column config cannot be fetched.
 */
const LOOKUP_KEYS = {
  id: ["so_id", "soId"],
  code: ["so_order_refno", "soOrderRefno"],
  name: ["cus_name", "soCustName"],
  short: ["so_order_type", "soOrderType"],
  alias: ["cus_addr3", "soCustPlace"],
  active: ["so_status", "soStatus"],
  array: ["items", "data", "rows", "results", "list"],
} as const;

/** Only `id` is used — the shell's form, which owns the rest, never opens here. */
const REQUEST_PAYLOAD_KEYS = {
  id: "soId",
  name: "soCustName",
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
 * A deleted order IS a cancelled one — the soft delete stamps
 * `so_status = 'CANCELLED'` in the same write — and grid 87 projects no
 * `so_is_deleted`, so the status is the only signal the list has.
 */
function isCancelledRow(row: MasterTableRow): boolean {
  return asText(sourceValue(row, "so_status")).trim().toUpperCase() === "CANCELLED";
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: styles.statusPillDraft,
  CONFIRMED: styles.statusPillConfirmed,
  PARTIAL: styles.statusPillPartial,
  COMPLETED: styles.statusPillCompleted,
  CLOSED: styles.statusPillCompleted,
  CANCELLED: styles.statusPillCancelled,
  EXPIRED: styles.statusPillCancelled,
};

/** Per-column formatting, keyed by grid 87's own SQL field names. */
const COLUMN_RENDER_OVERRIDES = {
  so_order_date: (row: MasterTableRow) => toDateInput(asText(sourceValue(row, "so_order_date"))),
  so_order_amt: (row: MasterTableRow) =>
    formatCurrency(toNumber(asText(sourceValue(row, "so_order_amt"))), 2, true),
  so_status: (row: MasterTableRow) => {
    const status = asText(sourceValue(row, "so_status")).trim().toUpperCase();
    if (!status) {
      return "";
    }
    return (
      <span className={`${styles.statusPill} ${STATUS_CLASS[status] ?? styles.statusPillDraft}`}>
        {status}
      </span>
    );
  },
};

/** The whole document key, not just the id: an order is keyed by four fields. */
function docKeyOf(row: MasterTableRow): SaleOrderDocKey {
  return {
    soId: asText(sourceValue(row, "so_id")),
    soCompanyId: asText(sourceValue(row, "so_company_id")),
    soBranchId: asText(sourceValue(row, "so_branch_id")),
    soAccYear: asText(sourceValue(row, "so_acc_year")),
  };
}

/** The Period presets, in days back from today. `custom` leaves the dates alone. */
const PERIOD_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: String(SALE_ORDER_LIST_WINDOW_DAYS), label: `Last ${SALE_ORDER_LIST_WINDOW_DAYS} days` },
  { value: "180", label: "Last 180 days" },
  { value: "365", label: "Last 365 days" },
  { value: "custom", label: "Custom" },
] as const;

export type SaleOrderListViewProps = {
  onCreate: () => void;
  onOpen: (key: SaleOrderDocKey, mode: "browse" | "entry") => void;
};

export function SaleOrderListView({ onCreate, onOpen }: SaleOrderListViewProps) {
  const { activeCompany, activeBranch } = useBusinessContext();
  const companyId = activeCompany?.compId ?? activeCompany?.id ?? "";
  const branchId = activeBranch?.id ?? "";

  // Orders outlive bills, so the window opens at 90 days rather than at the
  // grid's unbounded default (a shop with three years of orders would otherwise
  // page through all of them to reach this morning's).
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -SALE_ORDER_LIST_WINDOW_DAYS));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<string>(String(SALE_ORDER_LIST_WINDOW_DAYS));

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
      // Grid 87 binds these four and only these four. The dates travel as ""
      // when unbounded, which its `NULLIF('ifrom_date','') IS NULL OR …` guards
      // read as "no bound"; an absent key would leave the token in the SQL.
      grid_param: JSON.stringify({
        icompany_id: companyId || NO_TENANT_ID,
        ibranch_id: branchId || NO_TENANT_ID,
        ifrom_date: fromDate,
        ito_date: toDate,
      }),
    }),
    [branchId, companyId, fromDate, toDate],
  );

  /**
   * Re-runs the list when the window moves. The shell keys its own list state
   * off this, so changing a date resets to page 1 rather than leaving the
   * operator on page 4 of a list that just got shorter.
   */
  const listStateResetKey = `${companyId}|${branchId}|${fromDate}|${toDate}`;

  const toolbarContent = useMemo(
    () => (
      <>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="sale-order-from">
            From
          </label>
          <input
            id="sale-order-from"
            type="date"
            className={styles.filterDateInput}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="sale-order-to">
            To
          </label>
          <input
            id="sale-order-to"
            type="date"
            className={styles.filterDateInput}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
            }}
          />
        </div>
        <div className={masterStyles.filterGroup}>
          <label className={masterStyles.filterLabel} htmlFor="sale-order-period">
            Period
          </label>
          <select
            id="sale-order-period"
            className={styles.filterSelect}
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
    <CrudMasterPage
      title="Sales Orders"
      listSubtitleOverride="Orders taken from customers, and what is still pending on them."
      buildListQuery={buildListQuery}
      listStateResetKey={listStateResetKey}
      entityLabel="sale order"
      entityLabelPlural="sale orders"
      searchPlaceholder="party name, order no or amount"
      apiEndpoints={API_ENDPOINTS}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={masterStyles}
      listTitle="Sale Order List"
      createLabel="New Order"
      codeColumnHeader="Order No"
      nameColumnHeader="Customer"
      gridDetailId={GRID_DETAIL_ID}
      // Without this the shell defaults to the response-driven column mode and a
      // configured grid with no `styles` array renders a serial column only.
      listResponseStyleArrayKey=""
      gridTableName="sale_order"
      useConfiguredGridColumnsOnly
      enableGridSettingsContextMenu
      columnRenderOverrides={COLUMN_RENDER_OVERRIDES}
      toolbarContent={toolbarContent}
      rowClassName={(row) => (isCancelledRow(row) ? styles.cancelledRow : undefined)}
      // An order lives in a year partition and the server looks it up by all
      // four scope fields — the id alone answers 404.
      buildDeleteRequest={({ rowSource }) => ({
        query: {
          soCompanyId: asText(rowSource?.so_company_id),
          soBranchId: asText(rowSource?.so_branch_id),
          soAccYear: asText(rowSource?.so_acc_year),
        },
      })}
      onCreateAction={onCreate}
      // A cancelled order is readable but not writable: the toolbar's Edit
      // button greys out rather than opening the voucher on a document the
      // server would refuse to update.
      isRowEditDisabled={isCancelledRow}
      rowEditDisabledReason="This order is cancelled and cannot be edited"
      onEditAction={(row) => onOpen(docKeyOf(row), isCancelledRow(row) ? "browse" : "entry")}
      // Ctrl+Enter and double-click open the voucher to be READ — an order has
      // lines, charges and tenders, so it does not fit the shell's view modal.
      // A cancelled row still opens: unlike a soft-deleted quotation, `GET
      // /sale-orders/get` filters on `soIsDeleted`, and an order cancelled
      // without being deleted is a perfectly readable document.
      onViewAction={(row) => onOpen(docKeyOf(row), "browse")}
      afterDeleteSuccess={({ rowSource }) => {
        const refno = asText(rowSource?.so_order_refno);
        toast.success(refno ? `Order ${refno} deleted.` : "Order deleted.");
      }}
      auditHistory={{
        // What the server stamps on `sale_order` audit rows.
        screenName: "Sale Order",
        getRecordId: (row) => asText(sourceValue(row, "so_id")) || null,
        getDisplayName: (row) =>
          asText(sourceValue(row, "so_order_refno")) || asText(sourceValue(row, "cus_name")) || null,
      }}
    />
  );
}
