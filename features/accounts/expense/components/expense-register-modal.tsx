"use client";

/**
 * F8 — the expense register, opened over the entry screen as a PICKER (Qt
 * 6f15977: `TxnMainView::openPicker(TxnDocTypes::expenseVoucher())`).
 *
 * Grid 137, "MAIN LIST - EXPENSE VOUCHERS" — the list menu 277 lands on — in
 * the receipt's and the payment's register skin. Every row opens, whatever
 * its status: the voucher itself says what may change (a DRAFT is edited, a
 * POSTED one only cancelled, a CANCELLED one read).
 *
 * Choosing is a gesture short of opening, because opening replaces what is on
 * the screen: a click or ↑ / ↓ moves the highlight, Enter or a double-click
 * opens. The caret starts in Search, and ↑ / ↓ / Enter work from there too.
 */
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import { Chip } from "@/features/accounts/receipt/components/chip";
import styles from "@/features/accounts/receipt/page.module.scss";
import { useExpenseRegisterQuery } from "../api/expense-api";
import { registerRowsOf, stepHighlight, type RegisterFilters, type RegisterRow } from "../domain/register";
import type { ExpenseKeys, ExpenseScope } from "../expense.types";

/** The runner caps `limit` at 100. */
const PAGE_SIZE = 50;
/** Qt's list waits 400 ms after the last keystroke before it asks. */
const SEARCH_DEBOUNCE_MS = 400;
const COLUMN_COUNT = 9;

export type ExpenseRegisterModalProps = {
  /** The header's business context — the register lists this company / branch / year. */
  scope: ExpenseScope;
  /** Kept by the screen, so the next F8 opens on the same window. */
  filters: RegisterFilters;
  onFiltersChange: (filters: RegisterFilters) => void;
  onClose: () => void;
  onPick: (keys: ExpenseKeys) => void;
};

export function ExpenseRegisterModal({ scope, filters, onFiltersChange, onClose, onPick }: ExpenseRegisterModalProps) {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  /** The highlighted voucher; `null` = the first row, so a fresh page needs no effect. */
  const [activeId, setActiveId] = useState<string | null>(null);

  // A new search is a different list: back to its first page, highlight on top.
  useEffect(() => {
    const term = searchText.trim();
    if (term === search) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setSearch(term);
      setPage(1);
      setActiveId(null);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, searchText]);

  const { data, isFetching, isError } = useExpenseRegisterQuery(
    {
      companyId: scope.companyId,
      branchId: scope.branchId,
      accYear: scope.accYear,
      status: filters.status,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      search,
      page,
      limit: PAGE_SIZE,
    },
    { skip: !scope.companyId || !scope.branchId, refetchOnMountOrArgChange: true },
  );

  const rows = useMemo(() => registerRowsOf(data?.rows ?? [], scope), [data, scope]);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeRow = rows.find((row) => row.keys.voucherId === activeId) ?? rows[0] ?? null;

  const changeFilters = (next: RegisterFilters) => {
    setPage(1);
    setActiveId(null);
    onFiltersChange(next);
  };

  const pick = (row: RegisterRow | null) => {
    if (row) onPick(row.keys);
  };

  // ↑ / ↓ / Enter, from Search or from the list.
  const onNavigate = (event: ReactKeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveId(stepHighlight(rows, activeRow?.keys.voucherId ?? null, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Enter" && activeRow) {
      event.preventDefault();
      pick(activeRow);
    }
  };

  const emptyText = isError
    ? "The register could not be read. Close and press F8 to try again."
    : isFetching
      ? "Reading the register…"
      : "No expense voucher matches these filters.";

  return (
    <ModalShell title="Select expense voucher" isOpen wide fixedHeight onClose={onClose}>
      <div className={styles.registerFilters}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Search</span>
          <input
            autoFocus
            className={styles.input}
            type="search"
            value={searchText}
            placeholder="paid to, expense head or voucher no"
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={onNavigate}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select
            className={styles.select}
            value={filters.status}
            onChange={(event) => changeFilters({ ...filters, status: event.target.value })}
          >
            {/* An empty string, not an absent parameter: grid 137's tokens are all bound. */}
            <option value="">Every status</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>From</span>
          <input
            className={styles.input}
            type="date"
            value={filters.fromDate}
            max={filters.toDate || undefined}
            onChange={(event) => changeFilters({ ...filters, fromDate: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>To</span>
          <input
            className={styles.input}
            type="date"
            value={filters.toDate}
            min={filters.fromDate || undefined}
            onChange={(event) => changeFilters({ ...filters, toDate: event.target.value })}
          />
        </label>
      </div>

      <div className={styles.registerViewport} tabIndex={0} onKeyDown={onNavigate}>
        <table className={styles.registerTable}>
          <thead>
            <tr>
              <th>Voucher no</th>
              <th>Date</th>
              <th>Paid to</th>
              <th>Expense heads</th>
              <th>Amount</th>
              <th>Tenders</th>
              <th>GST bill no</th>
              <th>Session</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT}>
                  <p className={styles.panelEmpty}>{emptyText}</p>
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.keys.voucherId}
                className={[
                  styles.registerRow,
                  activeRow?.keys.voucherId === row.keys.voucherId ? styles.registerRowActive : "",
                  // Struck through, not hidden: it happened, and a Rev voucher answers for it.
                  row.cancelled ? styles.cancelledRow : "",
                ].join(" ")}
                onClick={() => setActiveId(row.keys.voucherId)}
                onDoubleClick={() => pick(row)}
              >
                <td>{row.number}</td>
                <td>{toDisplayDate(row.date)}</td>
                <td>{row.paidTo || "—"}</td>
                <td>{row.heads || "—"}</td>
                <td>{row.amount}</td>
                <td>{row.tenders || "—"}</td>
                <td>{row.gstBillNo}</td>
                <td>{row.session}</td>
                <td>
                  <Chip value={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.pager}>
        <span>
          {total > 0 ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : ""}
        </span>
        <span className={styles.footerActions}>
          <button
            type="button"
            className={styles.button}
            disabled={page <= 1}
            onClick={() => {
              setPage((current) => Math.max(1, current - 1));
              setActiveId(null);
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={page >= pageCount}
            onClick={() => {
              setPage((current) => Math.min(pageCount, current + 1));
              setActiveId(null);
            }}
          >
            Next
          </button>
          <button type="button" className={styles.primaryButton} disabled={!activeRow} onClick={() => pick(activeRow)}>
            Open
          </button>
        </span>
      </div>
    </ModalShell>
  );
}
