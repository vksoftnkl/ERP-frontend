"use client";

/**
 * F8 — open another bill without leaving the form.
 *
 * The same shape as the quotation's picker, deliberately: an operator who has
 * learned one sales screen's F8 has learned them all. Toolbar, filters, local
 * pager, keyboard walk and the single-gesture-short-of-opening rule are all its
 * design, fed grid 86 ("TXN MAIN LIST - BILLS") instead of grid 84.
 *
 * The same configured grid the register uses, so it inherits the same
 * constraints, each handled rather than papered over:
 *
 *  - `search=` is not sent on the wire; the box filters the fetched page over
 *    more fields than the grid marks filterable;
 *  - the grid's own `WHERE` scopes on company, branch and YEAR — grid 86 binds
 *    `iacc_year` where the sale order's grid 87 does not, which is right:
 *    `sale_bill` is partitioned by it, so a list spanning years would scan every
 *    partition;
 *  - `FETCH_LIMIT` rows are one page of the year's bills rather than all of
 *    them, so the "may be more" note keeps that honest rather than silently
 *    truncating.
 *
 * A CANCELLED bill is shown, not hidden, and unlike the quotation's deleted rows
 * it is still selectable — it opens READ-ONLY. `GET /bills/get` filters on
 * `sbIsDeleted`, which cancelling never sets (that route cancels the source
 * ORDER), so a cancelled bill is a perfectly readable document and refusing to
 * open it would be hiding history rather than protecting anything.
 *
 * A row's whole document key is returned — company, branch and year included —
 * which is what lets another branch's bill load correctly.
 *
 * Choosing one is a SINGLE gesture short of opening it: a click (or ↑↓) moves
 * the highlight and Enter, a double-click or the Select button opens. Opening a
 * bill replaces whatever is on the form, so it is not something a stray click on
 * a list should do.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit3, FiLayout, FiPrinter, FiRefreshCw } from "react-icons/fi";
import { toast } from "@/lib/notify";
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
import useRowSelection from "@/hooks/useRowSelection";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import styles from "@/features/sales/quotation/page.module.scss";
import { useListBillsQuery, type BillListRow } from "@/store/api/saleBillApi";
import type { SaleBillDocKey } from "../salebill.types";

export type BillListPick = (key: SaleBillDocKey, mode: "browse" | "entry") => void;

export type BillListModalProps = {
  isOpen: boolean;
  /** Only rows of this tenant are offered. */
  companyId: string;
  branchId: string;
  accYear: string;
  onClose: () => void;
  onPick: BillListPick;
};

/**
 * One request, generously sized — there is no server "next page" control in this
 * dialog. 100 is the server's own cap (`limit must not be greater than 100`);
 * asking for more 400s the request.
 */
const FETCH_LIMIT = 100;
/** Rows per page of the LOCAL pager, over the already-fetched, already-filtered set. */
const LOCAL_PAGE_SIZE = 10;

/**
 * The presets, and they are shorter than the quotation's on purpose: a counter
 * looks up this morning's bill, not last quarter's. Anything older is a report.
 */
const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All dates" },
  { value: "custom", label: "Custom range" },
] as const;
type Period = (typeof PERIOD_OPTIONS)[number]["value"];

function periodRange(period: Period, today: string): { from: string; to: string } | null {
  switch (period) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -7), to: today };
    case "30d":
      return { from: addDays(today, -30), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "all":
      return { from: "", to: "" };
    default:
      return null;
  }
}

function isCancelled(row: BillListRow): boolean {
  return (row.sb_status ?? "").trim().toUpperCase() === "CANCELLED";
}

function keyOf(row: BillListRow): SaleBillDocKey {
  return {
    sbId: row.sb_id,
    sbCompanyId: row.sb_company_id,
    sbBranchId: row.sb_branch_id,
    sbAccYear: row.sb_acc_year,
  };
}

/** A ticked row is identified by its document id — stable, so the
 *  selection hook's callbacks and memo actually hold. */
const rowKeyOf = (row: BillListRow): string => row.sb_id;

export function BillListModal({
  isOpen,
  companyId,
  branchId,
  accYear,
  onClose,
  onPick,
}: BillListModalProps) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  // Opens on the last 30 days rather than on everything: the year's whole
  // register is rarely what an operator reaching for F8 wants.
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -30));
  const [toDate, setToDate] = useState(() => todayIso());
  const [period, setPeriod] = useState<Period>("30d");
  const [localPage, setLocalPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  /**
   * The row the Print button is showing the dialog for — the ROW, not a flag:
   * the highlight moves with the arrow keys while the dialog is open, so a
   * dialog reading `activeRow` would retarget itself under the operator. Its own
   * accounting year travels with it, because that year decides which partition
   * the renderer reads and last year's bill is not in this one.
   */
  const [printRows, setPrintRows] = useState<BillListRow[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setDebounced("");
      setFromDate(addDays(todayIso(), -30));
      setToDate(todayIso());
      setPeriod("30d");
      setLocalPage(1);
      setActiveIndex(0);
      // Closing the list unmounts the print dialog with the panel but leaves
      // this component alive; without the reset, reopening F8 would come up with
      // the previous row's print dialog already on it.
      setPrintRows([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setLocalPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Dates are NOT sent to the grid: one fetch of the year is filtered locally,
  // so moving the window costs no round trip and the "may be more" note stays
  // measured against one known page.
  const { data, isFetching, refetch } = useListBillsQuery(
    { page: 1, limit: FETCH_LIMIT, companyId, branchId, accYear, fromDate: "", toDate: "" },
    { skip: !isOpen || !companyId || !branchId || !accYear },
  );

  const filtered = useMemo(() => {
    const all = data?.items ?? [];
    const needle = debounced.trim().toLowerCase();
    return all.filter((row) => {
      if (
        (companyId && row.sb_company_id !== companyId) ||
        (branchId && row.sb_branch_id !== branchId) ||
        (accYear && row.sb_acc_year !== accYear)
      ) {
        return false;
      }
      if (needle) {
        const matches = [
          row.sb_bill_refno,
          row.cus_name,
          row.cus_addr3,
          row.sb_bill_type,
          row.sb_status,
          row.sb_bill_amt != null ? String(row.sb_bill_amt) : null,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
        if (!matches) {
          return false;
        }
      }
      const billDate = toDateInput(row.sb_bill_date);
      if (fromDate && (!billDate || billDate < fromDate)) {
        return false;
      }
      if (toDate && (!billDate || billDate > toDate)) {
        return false;
      }
      return true;
    });
  }, [accYear, branchId, companyId, data, debounced, fromDate, toDate]);

  const fetched = data?.items.length ?? 0;
  const serverTotal = data?.meta?.total ?? 0;
  const mayBeIncomplete = fetched >= FETCH_LIMIT && serverTotal > fetched;

  const totalLocalPages = Math.max(1, Math.ceil(filtered.length / LOCAL_PAGE_SIZE));
  const currentLocalPage = Math.min(localPage, totalLocalPages);
  const pageStartIndex = (currentLocalPage - 1) * LOCAL_PAGE_SIZE;
  const visibleRows = filtered.slice(pageStartIndex, pageStartIndex + LOCAL_PAGE_SIZE);

  /*
   * The ticked rows, on the same rules as the register screens — a tick
   * survives the local pager, select-all means this page, and the batch comes
   * out in list order. See `lib/row-selection.ts`.
   */
  const selection = useRowSelection(visibleRows, rowKeyOf);
  const clearSelection = selection.clear;

  // Reopening F8 starts clean. Separate from the reset above only because the
  // selection cannot be declared until there are rows to select from.
  useEffect(() => {
    if (isOpen) clearSelection();
  }, [clearSelection, isOpen]);
  const pageList = useMemo(
    () => buildPageList(totalLocalPages, currentLocalPage),
    [currentLocalPage, totalLocalPages],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [currentLocalPage, filtered.length]);

  /**
   * A cancelled bill opens READ-ONLY rather than being refused: it is a readable
   * document, and the server would refuse an update to it anyway.
   */
  const choose = useCallback(
    (row: BillListRow) => {
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
    paused: printRows.length > 0,
  });

  const { permissions } = usePagePermissions();

  /*
   * Print the HIGHLIGHTED row, not the one the form has open — this dialog's
   * whole point is reaching another bill without loading it, and reprinting one
   * is the commonest reason to want that.
   *
   * `SALE_INVOICE` ("Tax Invoice") is the purpose; the server's three sale-bill
   * providers (`sales.bill.header`, `sales.bill.items`, `sales.bill.tax_summary`)
   * are what it renders from. An install with no template assigned to that
   * purpose gets the dialog's own "nothing is set up to print this here"
   * message, which is a real answer rather than a dead button.
   */
  const printActiveRow = (): void => {
    if (!permissions.canPrint) {
      toast.error("You do not have permission to print on this screen.");
      return;
    }
    // Ticked rows win over the highlight: ticking IS the operator saying which
    // bills they mean, and the highlight is only where the arrow keys happen to
    // be sitting. Nothing ticked falls back to the highlighted row, so the
    // button behaves exactly as it always has.
    if (selection.count > 0) {
      const companies = new Set(selection.selected.map((row) => row.sb_company_id));
      const years = new Set(selection.selected.map((row) => row.sb_acc_year));
      if (companies.size > 1 || years.size > 1) {
        // One render binds one company and one year for the whole batch.
        toast.error(
          "Select bills from one company and one accounting year at a time.",
        );
        return;
      }
      setPrintRows(selection.selected);
      return;
    }
    if (!activeRow) {
      return;
    }
    setPrintRows([activeRow]);
  };

  return (
    <ModalShell
      title="Select bill to alter"
      isOpen={isOpen}
      wide
      fixedHeight
      onClose={onClose}
      footer={
        <>
          <span className={styles.modalNote}>
            ↑↓ move · click highlights · Enter or double-click opens · Esc cancel
            {activeRowCancelled ? (
              <span className={styles.warning}> · Cancelled bill — opens read-only.</span>
            ) : null}
          </span>
          <nav className={styles.pagerBar} aria-label="Bill list pages">
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
          title={activeRowCancelled ? "This bill is cancelled and opens read-only" : undefined}
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
          disabled={selection.count === 0 && !activeRow}
          title={
            selection.count > 0
              ? `Print the ${selection.count} ticked bills as one document`
              : "Print the highlighted bill"
          }
          onClick={printActiveRow}
        >
          <FiPrinter aria-hidden="true" />
          {selection.count > 0 ? `Print (${selection.count})` : "Print"}
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
            placeholder="party name, bill no, amount…"
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
          Showing the {fetched} most recently fetched bills of this year — narrow Search or the
          date range if the one you want is not listed.
        </p>
      ) : null}

      <div className={styles.listViewport} ref={viewportRef}>
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col" className={styles.selectCell}>
                <input
                  type="checkbox"
                  aria-label="Select every bill on this page"
                  checked={selection.allChecked}
                  ref={(node) => {
                    // The partial state is a DOM property, not an attribute.
                    if (node) node.indeterminate = selection.someChecked;
                  }}
                  disabled={visibleRows.length === 0}
                  onChange={selection.toggleVisible}
                />
              </th>
              <th scope="col">Date</th>
              <th scope="col">Bill No</th>
              <th scope="col">Term</th>
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
              return (
                <tr
                  key={row.sb_id}
                  data-selected={index === activeIndex ? "true" : undefined}
                  data-deleted={cancelled ? "true" : undefined}
                  // Click, arrow keys and the pager move the highlight —
                  // hovering does NOT. It is what Enter and Select act on, so a
                  // row the pointer crossed on its way to a button must not
                  // quietly become the row that opens.
                  onClick={() => setActiveIndex(index)}
                  onDoubleClick={() => choose(row)}
                >
                  <td
                    className={styles.selectCell}
                    // The row's own onClick moves the highlight; a tick must not
                    // drag it along, and a double-tick must not open the bill.
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select bill ${row.sb_bill_refno ?? ""}`}
                      checked={selection.isChecked(row)}
                      onChange={() => selection.toggleRow(row)}
                    />
                  </td>
                  <td>{toDateInput(row.sb_bill_date)}</td>
                  <td>{row.sb_bill_refno ?? "—"}</td>
                  <td>{row.sb_bill_type ?? ""}</td>
                  <td>{row.cus_name ?? ""}</td>
                  <td>{row.cus_addr3 ?? ""}</td>
                  <td className={styles.alignRight}>{row.sb_tot_items ?? 0}</td>
                  <td className={styles.alignRight}>{toNumber(row.sb_bill_amt).toFixed(2)}</td>
                  <td>
                    {row.sb_status ?? ""}
                    {cancelled ? <span className={styles.deletedTag}>Cancelled</span> : null}
                  </td>
                  <td>{row.sb_created_by ?? ""}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className={styles.emptyGrid}>
                  {isFetching ? "Loading…" : "No bill matches."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {printRows.length > 0 ? (
        <PrintOptionsDialog
          open
          onClose={() => setPrintRows([])}
          purposeCode={PURPOSE_CODE.SALE_INVOICE}
          documentLabel={
            printRows.length > 1
              ? `${printRows.length} Bills`
              : printRows[0].sb_bill_refno
                ? `Bill ${printRows[0].sb_bill_refno}`
                : "Bill"
          }
          targets={printRows.map((row) => ({
            docId: row.sb_id,
            companyId: row.sb_company_id,
            accYear: row.sb_acc_year,
            filename: `bill-${row.sb_bill_refno || row.sb_id}`,
          }))}
        />
      ) : null}
    </ModalShell>
  );
}
