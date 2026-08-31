"use client";

/**
 * F8 — open another quotation without leaving the form.
 *
 * The same configured grid the list screen uses (84, "Quotation"), so it inherits
 * the same constraints, each handled rather than papered over:
 *
 *  - `search=` is not sent on the wire; the box filters the fetched page over more
 *    fields than the grid marks filterable;
 *  - the grid's own `WHERE` scopes on company, branch and year, bound from the
 *    `grid_param` this modal's props supply — the client-side tenant filter below
 *    is now a second belt on the same trousers, kept because a row is only usable
 *    if its whole document key matches;
 *  - `FETCH_LIMIT` rows are still one page of the tenant's quotations rather than
 *    all of them, so the "may be more" note under the search box keeps that honest
 *    rather than silently truncating.
 *
 * A soft-deleted row is shown, not hidden — the grid returns it either way, and
 * hiding it would leave the operator hunting for a quotation the list clearly
 * has. It is dimmed, tagged and NOT selectable: `GET /quotations/get` filters
 * soft-deleted rows out and answers 404, so picking one could only clear the
 * form and raise a "not found" toast.
 *
 * A row's whole document key is returned (company, branch and year included),
 * which is what lets another branch's quotation load correctly.
 *
 * Choosing one is a SINGLE gesture short of opening it: a click (or ↑↓) moves
 * the highlight and Enter, a double-click or the Select button opens. Opening a
 * quotation replaces whatever is on the form, so it is not something a stray
 * click on a list should do. `useListKeyboardNav` is what makes the keys work
 * once the pointer has taken focus off the search box.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit3, FiLayout, FiPrinter, FiRefreshCw } from "react-icons/fi";
import { toast } from "react-toastify";
import { cx } from "@/components/design-system/cx";
import { useListQuotationsQuery } from "@/store/api/quotationApi";
import { PrintOptionsDialog } from "@/features/printing/components/print-options-dialog";
import { PURPOSE_CODE } from "@/features/printing/domain/documentPrint";
import { usePagePermissions } from "@/hooks/useMenuPermissions";
import type { QuotationDocKey, QuotationListRow } from "../quotation.types";
import { addDays, buildPageList, toDateInput, todayIso, toNumber } from "../quotation.utils";
import { ModalShell } from "./modal-shell";
import { useListKeyboardNav } from "./use-list-keyboard-nav";
import styles from "../page.module.scss";

export type QuotationListModalProps = {
  isOpen: boolean;
  /** Only rows of this tenant are offered. */
  companyId: string;
  branchId: string;
  accYear: string;
  onClose: () => void;
  onPick: (key: QuotationDocKey) => void;
};

/**
 * One request, generously sized — there is no server "next page" control in
 * this dialog; see the module comment. 100 is the server's own cap
 * (`limit must not be greater than 100`); asking for more 400s the request.
 */
const FETCH_LIMIT = 100;
/** Rows per page of the LOCAL pager, over the already-fetched, already-filtered set. */
const LOCAL_PAGE_SIZE = 10;

const PERIOD_OPTIONS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
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

function isDeleted(value: QuotationListRow["sq_is_deleted"]): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "t" || text === "1";
}

export function QuotationListModal(props: QuotationListModalProps) {
  const { isOpen, companyId, branchId, accYear, onClose, onPick } = props;
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [localPage, setLocalPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  /**
   * The row the Print button is showing the print dialog for.
   *
   * The ROW itself, not a flag: the highlight moves with the arrow keys while
   * the dialog is open, so a dialog reading `activeRow` would retarget itself
   * under the operator. Its own accounting year travels with it, because that
   * year decides which partition the renderer reads and a quotation raised last
   * year is not in this one. Company, branch and counter do not: the server
   * takes all three from the access token.
   */
  const [printRow, setPrintRow] = useState<QuotationListRow | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setDebounced("");
      setFromDate("");
      setToDate("");
      setPeriod("all");
      setLocalPage(1);
      setActiveIndex(0);
      // Closing the list unmounts the print dialog with the panel but leaves
      // this component (and so this state) alive; without the reset, reopening
      // F8 would come up with the previous row's print dialog already on it.
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

  const { data, isFetching, refetch } = useListQuotationsQuery(
    { page: 1, limit: FETCH_LIMIT, companyId, branchId, accYear },
    { skip: !isOpen },
  );

  const filtered = useMemo(() => {
    const all = data?.items ?? [];
    const needle = debounced.trim().toLowerCase();
    return all.filter((row) => {
      if (
        (companyId && row.sq_company_id !== companyId) ||
        (branchId && row.sq_branch_id !== branchId) ||
        (accYear && row.sq_acc_year !== accYear)
      ) {
        return false;
      }
      if (needle) {
        // Filtered here, not on the wire: the configured list grid has no
        // filterable column, so a `search=` param makes the runner inject `1 = 0`
        // and answer with an empty page.
        const matches = [
          row.sq_quote_refno,
          row.sq_usr_refno,
          row.sq_cust_name,
          row.sq_cust_phone,
          row.sq_quote_amt != null ? String(row.sq_quote_amt) : null,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
        if (!matches) {
          return false;
        }
      }
      const quoteDate = toDateInput(row.sq_quote_date);
      if (fromDate && (!quoteDate || quoteDate < fromDate)) {
        return false;
      }
      if (toDate && (!quoteDate || quoteDate > toDate)) {
        return false;
      }
      return true;
    });
  }, [accYear, branchId, companyId, data, debounced, fromDate, toDate]);

  const fetched = data?.items.length ?? 0;
  const serverTotal = data?.meta.total ?? 0;
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

  const choose = useCallback(
    (row: QuotationListRow) => {
      if (isDeleted(row.sq_is_deleted)) {
        toast.info("This quotation is deleted — it can no longer be opened.");
        return;
      }
      onPick({
        sqId: row.sq_id,
        sqCompanyId: row.sq_company_id,
        sqBranchId: row.sq_branch_id,
        sqAccYear: row.sq_acc_year,
      });
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
  const activeRowDeleted = activeRow ? isDeleted(activeRow.sq_is_deleted) : false;

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
   * Print the HIGHLIGHTED row, not the one the form has open — this dialog's
   * whole point is reaching another quotation without loading it, and printing
   * one is the commonest reason to want that.
   *
   * The row's own ACCOUNTING YEAR goes with it and nothing else does. Company,
   * branch and counter are claims on the access token now, so a screen naming
   * them would only be restating a default it read out of the same session —
   * and would be free to restate it wrong.
   *
   * Opens the same five-button dialog the Quotation List page and the entry
   * screen's Save & print (F6) open — Print, Preview, Format, Pdf, Cancel —
   * rather than sending paper on the spot, so the three ways into a quotation's
   * paper ask the same question.
   *
   * Nothing here writes to `print_log`: that dialog renders through
   * `/print-render/preview` for all four buttons. See its header comment for
   * what that costs and how to put the logging back.
   */
  const printActiveRow = (): void => {
    if (!activeRow) return;
    if (!permissions.canPrint) {
      toast.error("You do not have permission to print on this screen.");
      return;
    }
    setPrintRow(activeRow);
  };

  return (
    <ModalShell
      title="Select quotation to alter"
      isOpen={isOpen}
      wide
      onClose={onClose}
      footer={
        <>
          <span className={styles.modalNote}>
            ↑↓ move · click highlights · Enter or double-click opens · Esc cancel
            {activeRowDeleted ? (
              <span className={styles.warning}> · Deleted quotation — cannot be opened.</span>
            ) : null}
          </span>
          <nav className={styles.pagerBar} aria-label="Quotation list pages">
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
          disabled={!activeRow || activeRowDeleted}
          title={activeRowDeleted ? "This quotation is deleted and cannot be opened" : undefined}
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
          disabled={!activeRow || activeRowDeleted}
          title={
            activeRowDeleted
              ? "This quotation is deleted and cannot be printed"
              : "Print the highlighted quotation"
          }
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
            placeholder="party name, quote no, amount…"
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
          Showing the {fetched} most recently fetched quotations across every company — narrow
          Search or the date range if the one you want is not listed.
        </p>
      ) : null}

      <div className={styles.listViewport} ref={viewportRef}>
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Quote No</th>
              <th scope="col">Customer</th>
              <th scope="col">Phone</th>
              <th scope="col">Valid Until</th>
              <th scope="col">Items</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
              <th scope="col">By</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const deleted = isDeleted(row.sq_is_deleted);
              return (
                <tr
                  key={row.sq_id}
                  data-selected={index === activeIndex ? "true" : undefined}
                  data-deleted={deleted ? "true" : undefined}
                  // Click, arrow keys and the pager move the highlight —
                  // hovering does NOT. It is what Enter and Select act on, so a
                  // row the pointer crossed on its way to a button must not
                  // quietly become the row that opens.
                  onClick={() => setActiveIndex(index)}
                  onDoubleClick={() => choose(row)}
                >
                  <td>{toDateInput(row.sq_quote_date)}</td>
                  <td>{row.sq_quote_refno ?? "—"}</td>
                  <td>{row.sq_cust_name ?? ""}</td>
                  <td>{row.sq_cust_phone ?? ""}</td>
                  <td>{toDateInput(row.sq_valid_until)}</td>
                  <td className={styles.alignRight}>{row.sq_tot_items ?? 0}</td>
                  <td className={styles.alignRight}>{toNumber(row.sq_quote_amt).toFixed(2)}</td>
                  <td>
                    {row.sq_status ?? ""}
                    {deleted ? <span className={styles.deletedTag}>Deleted</span> : null}
                  </td>
                  <td>{row.sq_created_by ?? ""}</td>
                </tr>
              );
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyGrid}>
                  {isFetching ? "Loading…" : "No quotation matches."}
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
          purposeCode={PURPOSE_CODE.SALE_QUOTATION}
          documentLabel={
            printRow.sq_quote_refno ? `Quotation ${printRow.sq_quote_refno}` : "Quotation"
          }
          target={{
            docId: printRow.sq_id,
            accYear: printRow.sq_acc_year,
            filename: `quotation-${printRow.sq_quote_refno || printRow.sq_id}`,
          }}
        />
      ) : null}
    </ModalShell>
  );
}
