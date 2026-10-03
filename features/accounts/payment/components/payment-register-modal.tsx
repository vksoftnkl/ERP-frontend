"use client";

/**
 * F8 — the register, opened over the entry screen as a PICKER (grid 123).
 *
 * The receipt's picker over the payment's grid: a click moves the highlight,
 * Enter or a double-click opens, because opening one replaces what is on the
 * screen. `iavh_status` is always sent ("" = every status).
 */
import { useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { toNumber } from "@/features/sales/quotation/quotation.utils";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import { Chip } from "@/features/accounts/receipt/components/chip";
import type { RegisterFilters } from "@/features/accounts/receipt/components/register-modal";
import styles from "@/features/accounts/receipt/page.module.scss";
import { useListPaymentsQuery, type PaymentListRow } from "@/store/api/paymentApi";
import type { PaymentKeys, PaymentScope } from "../payment.types";

const PAGE_SIZE = 50;

export type { RegisterFilters };

export type PaymentRegisterModalProps = {
  isOpen: boolean;
  scope: PaymentScope;
  filters: RegisterFilters;
  onFiltersChange: (filters: RegisterFilters) => void;
  onClose: () => void;
  onPick: (keys: PaymentKeys) => void;
};

export function PaymentRegisterModal(props: PaymentRegisterModalProps) {
  const { isOpen, scope, filters, onFiltersChange, onClose, onPick } = props;
  const [page, setPage] = useState(1);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { data, isFetching } = useListPaymentsQuery(
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
    setPage(1);
    setActiveKey(null);
    onFiltersChange(next);
  };

  const activeRow =
    rows.find((candidate) => candidate.avh_voucher_id === activeKey) ?? rows[0] ?? null;

  const keysOf = (row: PaymentListRow): PaymentKeys => ({
    avhVoucherId: row.avh_voucher_id,
    // The row carries its own scope: a payment opens with the keys it was
    // written with, never the session's.
    avhCompanyId: row.avh_company_id || scope.companyId,
    avhBranchId: row.avh_branch_id || scope.branchId,
    avhAccYear: row.avh_acc_year || scope.accYear,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <ModalShell title="Payments" isOpen wide fixedHeight onClose={onClose}>
      <div className={styles.registerFilters}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <select
            className={styles.select}
            value={filters.status}
            onChange={(event) => changeFilters({ ...filters, status: event.target.value })}
          >
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
              <th>Payee</th>
              <th>Paid</th>
              <th>Adjusted</th>
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
                    {isFetching ? "Reading the register…" : "No payment matches these filters."}
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
