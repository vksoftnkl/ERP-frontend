"use client";

/**
 * The order picker the entry screens open over themselves — F8 on the sale order
 * screen, Ctrl+F4 on the sale bill, where it is the import source.
 *
 * Deliberately NOT the landing list: that one is the `CrudMasterPage` shell
 * (`sale-order-list-view.tsx`), which owns a page header, an icon toolbar and
 * its own modals, none of which belong inside another modal. This is the same
 * grid 87 data in the shape a picker needs — and in the SAME shape the
 * quotation's and the bill's pickers use, because an operator who has learned
 * one sales screen's picker has learned them all.
 *
 * The grid's constraints, each handled rather than papered over:
 *
 *  - `search=` is not sent on the wire; the box filters the fetched page over
 *    more fields than the grid marks filterable;
 *  - the grid's `WHERE` scopes on company and branch only — there is NO year
 *    token, unlike the bill's grid 86, because an order legitimately outlives
 *    the year it was raised in. So the client-side filter below scopes on those
 *    two and NOT on the year: filtering by year here would hide last year's
 *    order that is still pending, which is exactly the one being looked for;
 *  - `FETCH_LIMIT` rows are the most recent orders (the grid orders by date
 *    descending), not all of them, so the "may be more" note keeps that honest.
 *
 * A CANCELLED order is shown, not hidden, and is still selectable — it opens
 * READ-ONLY. `GET /sale-orders/get` filters on `soIsDeleted`, and an order
 * cancelled without being deleted is a perfectly readable document. The bill's
 * import refuses it after the fetch, with a reason, rather than the picker
 * pretending it does not exist.
 *
 * Choosing one is a SINGLE gesture short of opening it: a click (or ↑↓) moves
 * the highlight and Enter, a double-click or the Select button opens. Opening an
 * order replaces whatever is on the form, so it is not something a stray click
 * on a list should do.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit3, FiLayout, FiPrinter, FiRefreshCw } from "react-icons/fi";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useListKeyboardNav } from "@/features/sales/quotation/components/use-list-keyboard-nav";
import {
  addDays,
  buildPageList,
  toDateInput,
  todayIso,
  toNumber,
} from "@/features/sales/quotation/quotation.utils";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import styles from "@/features/sales/quotation/page.module.scss";
import orderStyles from "../page.module.scss";
import { useListSaleOrdersQuery, type SaleOrderListRow } from "@/store/api/saleOrderApi";
import { SALE_ORDER_LIST_WINDOW_DAYS } from "../sale-order.constants";
import type { SaleOrderDocKey } from "../sale-order.types";

export type SaleOrderListPick = (key: SaleOrderDocKey, mode: "browse" | "entry") => void;

export type SaleOrderListModalProps = {
  isOpen: boolean;
  companyId: string;
  branchId: string;
  onClose: () => void;
  onPick: SaleOrderListPick;
  /**
   * What the dialog is being opened FOR. The sale order screen is picking one to
   * alter; the bill is picking one to bill, and saying so is the difference
   * between an operator understanding what Enter is about to do and guessing.
   */
  title?: string;
};

/**
 * One request, generously sized — there is no server "next page" control here.
 * 100 is the server's own cap (`limit must not be greater than 100`).
 */
const FETCH_LIMIT = 100;
/** Rows per page of the LOCAL pager, over the already-fetched, already-filtered set. */
const LOCAL_PAGE_SIZE = 10;

/**
 * Longer than the bill's presets: orders outlive bills, and the one being looked
 * for is routinely months old — which is also why the window opens at 90 days
 * rather than at 30.
 */
const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: `Last ${SALE_ORDER_LIST_WINDOW_DAYS} days` },
  { value: "180d", label: "Last 180 days" },
  { value: "all", label: "All dates" },
  { value: "custom", label: "Custom range" },
] as const;
type Period = (typeof PERIOD_OPTIONS)[number]["value"];

function periodRange(period: Period, today: string): { from: string; to: string } | null {
  switch (period) {
    case "7d":
      return { from: addDays(today, -7), to: today };
    case "30d":
      return { from: addDays(today, -30), to: today };
    case "90d":
      return { from: addDays(today, -SALE_ORDER_LIST_WINDOW_DAYS), to: today };
    case "180d":
      return { from: addDays(today, -180), to: today };
    case "all":
      return { from: "", to: "" };
    default:
      return null;
  }
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: orderStyles.statusPillDraft,
  CONFIRMED: orderStyles.statusPillConfirmed,
  PARTIAL: orderStyles.statusPillPartial,
  COMPLETED: orderStyles.statusPillCompleted,
  CLOSED: orderStyles.statusPillCompleted,
  CANCELLED: orderStyles.statusPillCancelled,
  EXPIRED: orderStyles.statusPillCancelled,
};

function isCancelled(row: SaleOrderListRow): boolean {
  return (row.so_status ?? "").trim().toUpperCase() === "CANCELLED";
}

function keyOf(row: SaleOrderListRow): SaleOrderDocKey {
  return {
    soId: row.so_id,
    soCompanyId: row.so_company_id,
    soBranchId: row.so_branch_id,
    soAccYear: row.so_acc_year,
  };
}

export function SaleOrderListModal({
  isOpen,
  companyId,
  branchId,
  onClose,
  onPick,
  title = "Select order to alter",
}: SaleOrderListModalProps) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [fromDate, setFromDate] = useState(() =>
    addDays(todayIso(), -SALE_ORDER_LIST_WINDOW_DAYS),
  );
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<Period>("90d");
  const [localPage, setLocalPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  /**
   * The row the Print button is showing the dialog for — the ROW, not a flag:
   * the highlight moves with the arrow keys while the dialog is open, so a
   * dialog reading `activeRow` would retarget itself under the operator. Its own
   * accounting year travels with it, because that year decides which partition
   * the renderer reads.
   */
  const [printRow, setPrintRow] = useState<SaleOrderListRow | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setDebounced("");
      setFromDate(addDays(todayIso(), -SALE_ORDER_LIST_WINDOW_DAYS));
      setToDate(todayIso());
      setPeriod("90d");
      setLocalPage(1);
      setActiveIndex(0);
      setPrintRow(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setLocalPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Dates are NOT sent to the grid: one fetch of the most recent orders is
  // filtered locally, so moving the window costs no round trip.
  const { data, isFetching, refetch } = useListSaleOrdersQuery(
    { page: 1, limit: FETCH_LIMIT, companyId, branchId, fromDate: "", toDate: "" },
    { skip: !isOpen || !companyId || !branchId },
  );

  const filtered = useMemo(() => {
    const all = data?.items ?? [];
    const needle = debounced.trim().toLowerCase();
    return all.filter((row) => {
      // Company and branch only — NOT the year. Grid 87 has no year token
      // because an order outlives the year it was raised in, and filtering by
      // one here would hide the pending order being looked for.
      if (
        (companyId && row.so_company_id !== companyId) ||
        (branchId && row.so_branch_id !== branchId)
      ) {
        return false;
      }
      if (needle) {
        const matches = [
          row.so_order_refno,
          row.cus_name,
          row.cus_addr3,
          row.so_order_type,
          row.so_status,
          row.so_order_amt != null ? String(row.so_order_amt) : null,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
        if (!matches) {
          return false;
        }
      }
      const orderDate = toDateInput(row.so_order_date);
      if (fromDate && (!orderDate || orderDate < fromDate)) {
        return false;
      }
      if (toDate && (!orderDate || orderDate > toDate)) {
        return false;
      }
      return true;
    });
  }, [branchId, companyId, data, debounced, fromDate, toDate]);

  const fetched = data?.items.length ?? 0;
  const serverTotal = data?.meta?.total ?? 0;
  const mayBeIncomplete = fetched >= FETCH_LIMIT && serverTotal > fetched;

  const totalLocalPages = Math.max(1, Math.ceil(filtered.length / LOCAL_PAGE_SIZE));
  const currentLocalPage = Math.min(localPage, totalLocalPages);
  const pageStartIndex = (currentLocalPage - 1) * LOCAL_PAGE_SIZE;
  const visibleRows = filtered.slice(pageStartIndex, pageStartIndex + LOCAL_PAGE_SIZE);
  const pageList = useMemo(
    () => buildPageList(totalLocalPages, currentLocalPage),
    [currentLocalPage, totalLocalPages],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [currentLocalPage, filtered.length]);

  /** A cancelled order opens READ-ONLY rather than being refused. */
  const choose = useCallback(
    (row: SaleOrderListRow) => {
      onPick(keyOf(row), isCancelled(row) ? "browse" : "entry");
    },
    [onPick],
  );

  const onPeriodChange = (value: Period) => {
    setPeriod(value);
    setLocalPage(1);
    const range = periodRange(value, todayIso());
    if (range) {
      setFromDate(range.from);
      setToDate(range.to);
    }
  };

  const activeRow = visibleRows[activeIndex];
  const activeRowCancelled = activeRow ? isCancelled(activeRow) : false;

  // ↑↓ / Enter for as long as the dialog is open, wherever focus has ended up —
  // and paused while the print dialog is over it, so one Enter is not two.
  const { viewportRef } = useListKeyboardNav({
    isOpen,
    rowCount: visibleRows.length,
    activeIndex,
    setActiveIndex,
    onEnter: () => {
      if (activeRow) {
        choose(activeRow);
      }
    },
    paused: printRow !== null,
  });

  const { permissions } = usePagePermissions();

  /*
   * Print the HIGHLIGHTED row, not the one the form has open — reaching another
   * order without loading it is this dialog's whole point, and on the BILL's
   * import it is how an operator checks what they are about to bill.
   */
  const printActiveRow = (): void => {
    if (!activeRow) {
      return;
    }
    if (!permissions.canPrint) {
      toast.error("You do not have permission to print on this screen.");
      return;
    }
    setPrintRow(activeRow);
  };

  return (
    <ModalShell
      title={title}
      isOpen={isOpen}
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <>
          <span className={styles.modalNote}>
            ↑↓ move · click highlights · Enter or double-click opens · Esc cancel
            {activeRowCancelled ? (
              <span className={styles.warning}> · Cancelled order — opens read-only.</span>
            ) : null}
          </span>
          <nav className={styles.pagerBar} aria-label="Sale order list pages">
            <span className={styles.pagerInfo}>
              {filtered.length === 0
                ? "Showing 0 entries"
                : `Showing ${pageStartIndex + 1} to ${Math.min(pageStartIndex + visibleRows.length, filtered.length)} of ${filtered.length} entries`}
            </span>
            <span className={styles.pagerControls}>
              <button
                type="button"
                className={styles.pagerButton}
                disabled={currentLocalPage <= 1}
                onClick={() => setLocalPage(1)}
                aria-label="First page"
                title="First page"
              >
                «
              </button>
              <button
                type="button"
                className={styles.pagerButton}
                disabled={currentLocalPage <= 1}
                onClick={() => setLocalPage((current) => Math.max(1, current - 1))}
                aria-label="Previous page"
                title="Previous page"
              >
                ‹
              </button>
              {pageList.map((entry, index) =>
                entry === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className={styles.pagerEllipsis}>
                    …
                  </span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    className={cx(
                      styles.pagerButton,
                      entry === currentLocalPage && styles.pagerButtonActive,
                    )}
                    onClick={() => setLocalPage(entry)}
                    title={`Go to page ${entry}`}
                  >
                    {entry}
                  </button>
                ),
              )}
              <button
                type="button"
                className={styles.pagerButton}
                disabled={currentLocalPage >= totalLocalPages}
                onClick={() => setLocalPage((current) => Math.min(totalLocalPages, current + 1))}
                aria-label="Next page"
                title="Next page"
              >
                ›
              </button>
              <button
                type="button"
                className={styles.pagerButton}
                disabled={currentLocalPage >= totalLocalPages}
                onClick={() => setLocalPage(totalLocalPages)}
                aria-label="Last page"
                title="Last page"
              >
                »
              </button>
            </span>
          </nav>
        </>
      }
    >
      <div className={styles.listToolbar}>
        <button
          type="button"
          className={cx(styles.toolButton, styles.toolButtonActive)}
          disabled={!activeRow}
          title={activeRowCancelled ? "This order is cancelled and opens read-only" : undefined}
          onClick={() => activeRow && choose(activeRow)}
        >
          <FiEdit3 aria-hidden="true" />
          Select
        </button>
        <button type="button" className={styles.toolButton} onClick={() => void refetch()}>
          <FiRefreshCw aria-hidden="true" />
          Refresh
        </button>
        <button
          type="button"
          className={styles.toolButton}
          disabled={!activeRow}
          title="Print the highlighted order"
          onClick={printActiveRow}
        >
          <FiPrinter aria-hidden="true" />
          Print
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => toast.info("Custom list formatting is not available yet.")}
        >
          <FiLayout aria-hidden="true" />
          Format
        </button>
      </div>

      <div className={styles.listFilters}>
        <label className={styles.filterField}>
          <span>Search:</span>
          <input
            className={styles.input}
            value={search}
            placeholder="party name, order no, amount…"
            autoFocus
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className={styles.filterField}>
          <span>From:</span>
          <input
            type="date"
            className={styles.input}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPeriod("custom");
              setLocalPage(1);
            }}
          />
        </label>
        <label className={styles.filterField}>
          <span>To:</span>
          <input
            type="date"
            className={styles.input}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPeriod("custom");
              setLocalPage(1);
            }}
          />
        </label>
        <label className={styles.filterField}>
          <span>Period:</span>
          <select
            className={styles.select}
            value={period}
            onChange={(event) => onPeriodChange(event.target.value as Period)}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {mayBeIncomplete ? (
        <p className={styles.modalNote}>
          Showing the {fetched} most recent orders — narrow Search or the date range if the one
          you want is not listed.
        </p>
      ) : null}

      <div className={styles.listViewport} ref={viewportRef}>
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Order No</th>
              <th scope="col">Type</th>
              <th scope="col">Customer</th>
              <th scope="col">Place</th>
              <th scope="col">Items</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
              <th scope="col">By</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const cancelled = isCancelled(row);
              const status = (row.so_status ?? "").trim().toUpperCase();
              return (
                <tr
                  key={row.so_id}
                  data-selected={index === activeIndex ? "true" : undefined}
                  data-deleted={cancelled ? "true" : undefined}
                  // Click, arrow keys and the pager move the highlight —
                  // hovering does NOT. It is what Enter and Select act on, so a
                  // row the pointer crossed on its way to a button must not
                  // quietly become the row that opens.
                  onClick={() => setActiveIndex(index)}
                  onDoubleClick={() => choose(row)}
                >
                  <td>{toDateInput(row.so_order_date)}</td>
                  <td>{row.so_order_refno ?? "—"}</td>
                  <td>{row.so_order_type ?? ""}</td>
                  <td>{row.cus_name ?? ""}</td>
                  <td>{row.cus_addr3 ?? ""}</td>
                  <td className={styles.alignRight}>{row.so_tot_items ?? 0}</td>
                  <td className={styles.alignRight}>{toNumber(row.so_order_amt).toFixed(2)}</td>
                  <td>
                    {status ? (
                      <span
                        className={cx(
                          orderStyles.statusPill,
                          STATUS_CLASS[status] ?? orderStyles.statusPillDraft,
                        )}
                      >
                        {status}
                      </span>
                    ) : null}
                  </td>
                  <td>{row.so_created_by ?? ""}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyGrid}>
                  {isFetching ? "Loading…" : "No order matches."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {printRow ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintRow(null)}
          purposeCode={PURPOSE_CODE.SALE_ORDER}
          documentLabel={printRow.so_order_refno ? `Order ${printRow.so_order_refno}` : "Order"}
          target={{
            docId: printRow.so_id,
            companyId: printRow.so_company_id,
            accYear: printRow.so_acc_year,
            filename: `sale-order-${printRow.so_order_refno || printRow.so_id}`,
          }}
        />
      ) : null}
    </ModalShell>
  );
}
