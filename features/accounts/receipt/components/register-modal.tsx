"use client";

/**
 * F8 — the register, opened over the entry screen as a PICKER.
 *
 * Grid 108, "MAIN LIST - RECEIPTS". There is no `/receipts/list` route and
 * there must not be one: the grid IS the list, which is how the operator's
 * saved column widths, filters and order apply to it, exactly as they do on
 * every other main list in this system.
 *
 * ── `iavh_status` is always sent ─────────────────────────────────────────
 * The runner substitutes bare `i`-prefixed tokens as TEXT rather than binding
 * them, so an omitted one stays in the statement as a literal word and the
 * WHOLE call 400s — not just the filter. "Every status" is therefore an empty
 * string, and is NOT modelled as an option that sends nothing.
 *
 * Choosing a receipt is a gesture short of opening it — a click moves the
 * highlight, Enter or a double-click opens — because opening one replaces
 * what is on the screen.
 */
import { useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { toNumber } from "@/features/sales/quotation/quotation.utils";
import { useListReceiptsQuery, type ReceiptListRow } from "@/store/api/receiptApi";
import { formatTotal } from "../domain/money";
import type { ReceiptKeys, ReceiptScope } from "../receipt.types";
import { Chip } from "./chip";
import styles from "../page.module.scss";

/** The server caps `limit` at 100. */
const PAGE_SIZE = 50;

export type RegisterFilters = {
  status: string;
  fromDate: string;
  toDate: string;
};

export type RegisterModalProps = {
  isOpen: boolean;
  scope: ReceiptScope;
  filters: RegisterFilters;
  onFiltersChange: (filters: RegisterFilters) => void;
  onClose: () => void;
  onPick: (keys: ReceiptKeys) => void;
};

export function RegisterModal(props: RegisterModalProps) {
  const { isOpen, scope, filters, onFiltersChange, onClose, onPick } = props;
  const [page, setPage] = useState(1);
  /**
   * The highlighted row. `null` means "the first one" rather than "none", so a
   * fresh page needs no effect to move the highlight onto it — which is the
   * same reason the page number is reset by the filter handler below and not
   * by an effect watching the filters.
   */
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { data, isFetching } = useListReceiptsQuery(
    {
      companyId: scope.companyId,
      branchId: scope.branchId,
      accYear: scope.accYear,
      status: filters.status,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      page,
      limit: PAGE_SIZE,
    },
    { skip: !isOpen || !scope.companyId },
  );

  const rows = useMemo(() => data?.items ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeFilters = (next: RegisterFilters) => {
    // A filtered list is a different list; page 3 of the old one means nothing
    // in it.
    setPage(1);
    setActiveKey(null);
    onFiltersChange(next);
  };

  // The highlight falls on the first row until the operator moves it, and a
  // key that is no longer on the page falls back to the first row too.
  const activeRow =
    rows.find((candidate) => candidate.avh_voucher_id === activeKey) ?? rows[0] ?? null;

  const keysOf = (row: ReceiptListRow): ReceiptKeys => ({
    avhVoucherId: row.avh_voucher_id,
    // The row carries its own company, branch and year: a receipt from another
    // branch opens with the keys it was written with, never with the session's.
    avhCompanyId: row.avh_company_id || scope.companyId,
    avhBranchId: row.avh_branch_id || scope.branchId,
    avhAccYear: row.avh_acc_year || scope.accYear,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <ModalShell title="Receipts" isOpen wide fixedHeight onClose={onClose}>
      <div className={styles.registerFilters}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select
            className={styles.select}
            value={filters.status}
            onChange={(event) => changeFilters({ ...filters, status: event.target.value })}
          >
            {/* An empty string, not an absent parameter — see the note above. */}
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
            onChange={(event) => changeFilters({ ...filters, fromDate: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>To</span>
          <input
            className={styles.input}
            type="date"
            value={filters.toDate}
            onChange={(event) => changeFilters({ ...filters, toDate: event.target.value })}
          />
        </label>
      </div>

      <div
        className={styles.registerViewport}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !activeRow) {
            return;
          }
          event.preventDefault();
          onPick(keysOf(activeRow));
        }}
        tabIndex={0}
      >
        <table className={styles.registerTable}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Number</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Allocated</th>
              <th>On account</th>
              <th>Instruments</th>
              <th>PDC</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <p className={styles.panelEmpty}>
                    {isFetching ? "Reading the register…" : "No receipt matches these filters."}
                  </p>
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.avh_voucher_id}
                className={`${styles.registerRow} ${
                  activeRow?.avh_voucher_id === row.avh_voucher_id ? styles.registerRowActive : ""
                }`}
                onClick={() => setActiveKey(row.avh_voucher_id)}
                onDoubleClick={() => onPick(keysOf(row))}
              >
                <td>{String(row.avh_voucher_date ?? "").slice(0, 10)}</td>
                <td>{row.avh_voucher_refno ?? "—"}</td>
                <td>{row.party_name ?? "—"}</td>
                <td>{formatTotal(toNumber(row.avh_doc_amount as never))}</td>
                <td>{formatTotal(toNumber(row.avh_adjust_amount as never))}</td>
                <td>{formatTotal(toNumber(row.on_account_amount as never))}</td>
                <td>{row.instruments ?? "—"}</td>
                <td>{toNumber(row.pdc_count as never) > 0 ? <Chip value="PDC" /> : null}</td>
                <td>
                  <Chip value={row.avh_voucher_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.pager}>
        <span>
          {total > 0
            ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
            : ""}
        </span>
        <span className={styles.footerActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={page >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            Next
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!activeRow}
            onClick={() => {
              if (activeRow) {
                onPick(keysOf(activeRow));
              }
            }}
          >
            Open
          </button>
        </span>
      </div>
    </ModalShell>
  );
}
