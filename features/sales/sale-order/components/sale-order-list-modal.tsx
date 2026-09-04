"use client";
/**
 * The F8 popup — the order picker the entry screen opens over itself.
 *
 * Deliberately NOT the landing list: that one is the `CrudMasterPage` shell
 * (`sale-order-list-view.tsx`), which owns a page header, an icon toolbar and
 * its own modals — none of which belong inside another modal. This is the same
 * grid 87 data in the light-weight shape a picker needs: a date window, a
 * filter box, one table and a pager.
 *
 * It paints the same status pills and strikes cancelled rows through, so the
 * two faces of the list read alike.
 */
import { useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import {
  addDays,
  buildPageList,
  toDateInput,
  toDisplayDate,
  todayIso,
  toNumber,
} from "@/features/sales/quotation/quotation.utils";
import styles from "@/features/sales/quotation/page.module.scss";
import orderStyles from "../page.module.scss";
import { useListSaleOrdersQuery, type SaleOrderListRow } from "@/store/api/saleOrderApi";
import { SALE_ORDER_LIST_WINDOW_DAYS } from "../sale-order.constants";
import type { SaleOrderDocKey } from "../sale-order.types";

const PAGE_SIZE = 20;

export type SaleOrderListPick = (key: SaleOrderDocKey, mode: "browse" | "entry") => void;

function keyOf(row: SaleOrderListRow): SaleOrderDocKey {
  return {
    soId: row.so_id,
    soCompanyId: row.so_company_id,
    soBranchId: row.so_branch_id,
    soAccYear: row.so_acc_year,
  };
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

export type SaleOrderListModalProps = {
  isOpen: boolean;
  companyId: string;
  branchId: string;
  onClose: () => void;
  onPick: SaleOrderListPick;
};

export function SaleOrderListModal({
  isOpen,
  companyId,
  branchId,
  onClose,
  onPick,
}: SaleOrderListModalProps) {
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -SALE_ORDER_LIST_WINDOW_DAYS));
  const [toDate, setToDate] = useState(() => todayIso());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isFetching, refetch } = useListSaleOrdersQuery(
    { companyId, branchId, fromDate, toDate, page, limit: PAGE_SIZE },
    { skip: !isOpen || !companyId || !branchId },
  );

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return items;
    }
    // Client-side, across more fields than the grid marks filterable.
    return items.filter((row) =>
      [row.so_order_refno, row.cus_name, row.cus_addr3, row.so_status, row.so_order_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [data, search]);

  const total = data?.meta?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pick = (row: SaleOrderListRow, mode: "browse" | "entry") => {
    onClose();
    onPick(keyOf(row), mode);
  };

  return (
    <ModalShell title="Sale Orders" isOpen={isOpen} wide fixedHeight onClose={onClose}>
      <div className={styles.listFilters}>
        <label className={styles.label} htmlFor="so-pick-from">
          From
          <input
            id="so-pick-from"
            type="date"
            className={styles.input}
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className={styles.label} htmlFor="so-pick-to">
          To
          <input
            id="so-pick-to"
            type="date"
            className={styles.input}
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => {
              setToDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <input
          type="search"
          className={styles.input}
          placeholder="party name, order no or amount"
          value={search}
          aria-label="Filter the listed orders"
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="button" className={styles.button} disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? "Loading…" : "Refresh"}
        </button>
      </div>
      <div className={styles.gridViewport} data-erp-table-viewport="true">
        <table className={styles.grid}>
          <thead>
            <tr>
              <th className={styles.gridHeaderCell}>Date</th>
              <th className={styles.gridHeaderCell}>Order No</th>
              <th className={styles.gridHeaderCell}>Type</th>
              <th className={styles.gridHeaderCell}>Customer</th>
              <th className={styles.gridHeaderCell}>Place</th>
              <th className={styles.gridHeaderCell}>Items</th>
              <th className={styles.gridHeaderCell}>Total</th>
              <th className={styles.gridHeaderCell}>Status</th>
              <th className={styles.gridHeaderCell}>By</th>
              <th className={styles.gridHeaderCell} aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const status = (row.so_status ?? "").trim().toUpperCase();
              return (
                <tr
                  key={row.so_id}
                  className={cx(
                    index % 2 === 0 ? styles.rowOdd : styles.rowEven,
                    isCancelled(row) && orderStyles.cancelledRow,
                  )}
                  onDoubleClick={() => pick(row, "browse")}
                >
                  <td>{toDisplayDate(toDateInput(row.so_order_date)) || ""}</td>
                  <td>{row.so_order_refno ?? ""}</td>
                  <td>{row.so_order_type ?? ""}</td>
                  <td>{row.cus_name ?? ""}</td>
                  <td>{row.cus_addr3 ?? ""}</td>
                  <td style={{ textAlign: "right" }}>{row.so_tot_items ?? 0}</td>
                  <td style={{ textAlign: "right" }}>
                    {formatCurrency(toNumber(row.so_order_amt))}
                  </td>
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
                  <td className={styles.actionCell}>
                    <button
                      type="button"
                      className={styles.rowButton}
                      title="Open read-only"
                      onClick={() => pick(row, "browse")}
                    >
                      👁
                    </button>
                    <button
                      type="button"
                      className={styles.rowButton}
                      title="Open for editing"
                      disabled={isCancelled(row)}
                      onClick={() => pick(row, "entry")}
                    >
                      ✎
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td className={styles.emptyGrid} colSpan={10}>
                  {isFetching ? "Loading orders…" : "No orders in this window."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className={orderStyles.listPager}>
          {buildPageList(totalPages, page).map((entry, index) =>
            entry === "ellipsis" ? (
              <span key={`e-${index}`}>…</span>
            ) : (
              <button
                key={entry}
                type="button"
                className={cx(styles.button, entry === page && styles.buttonPrimary)}
                onClick={() => setPage(entry)}
              >
                {entry}
              </button>
            ),
          )}
        </div>
      ) : null}
    </ModalShell>
  );
}
