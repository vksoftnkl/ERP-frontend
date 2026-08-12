"use client";
/**
 * The browse list — configured grid 87 ("SO - MAIN LIST") behind both faces:
 * the landing page and the F8 popup share one table, one date window and one
 * pager. Orders outlive bills, so the window opens at 90 days (the plan's
 * §10); the grid's SQL has no year token — the dates are the scope.
 *
 * Grid 87 projects neither `so_src_doc_type` (backend gap §11.7 — no
 * "from quotation" badge is possible) nor `so_is_deleted` — a deleted order
 * shows only through the CANCELLED status the delete stamps.
 */
import { useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import {
  addDays,
  buildPageList,
  toDisplayDate,
  toDateInput,
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

type ListCoreProps = {
  companyId: string;
  branchId: string;
  onPick: SaleOrderListPick;
  active: boolean;
};

/** The list itself — filters, table, pager. Both faces render this. */
function SaleOrderListCore({ companyId, branchId, onPick, active }: ListCoreProps) {
  const [fromDate, setFromDate] = useState(() => addDays(todayIso(), -SALE_ORDER_LIST_WINDOW_DAYS));
  const [toDate, setToDate] = useState(() => todayIso());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isFetching, refetch } = useListSaleOrdersQuery(
    { companyId, branchId, fromDate, toDate, page, limit: PAGE_SIZE },
    { skip: !active || !companyId || !branchId },
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

  return (
    <>
      <div className={styles.listFilters}>
        <label className={styles.label} htmlFor="so-list-from">
          From
          <input
            id="so-list-from"
            type="date"
            className={styles.input}
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className={styles.label} htmlFor="so-list-to">
          To
          <input
            id="so-list-to"
            type="date"
            className={styles.input}
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <input
          type="search"
          className={styles.input}
          placeholder="Filter this page…"
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
            {rows.map((row, index) => (
              <tr
                key={row.so_id}
                className={index % 2 === 0 ? styles.rowOdd : styles.rowEven}
                onDoubleClick={() => onPick(keyOf(row), "browse")}
              >
                <td>{toDisplayDate(toDateInput(row.so_order_date)) || ""}</td>
                <td>{row.so_order_refno ?? ""}</td>
                <td>{row.so_order_type ?? ""}</td>
                <td>{row.cus_name ?? ""}</td>
                <td>{row.cus_addr3 ?? ""}</td>
                <td style={{ textAlign: "right" }}>{row.so_tot_items ?? 0}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(toNumber(row.so_order_amt))}</td>
                <td>{row.so_status ?? ""}</td>
                <td>{row.so_created_by ?? ""}</td>
                <td className={styles.actionCell}>
                  <button
                    type="button"
                    className={styles.rowButton}
                    title="Open read-only"
                    onClick={() => onPick(keyOf(row), "browse")}
                  >
                    👁
                  </button>
                  <button
                    type="button"
                    className={styles.rowButton}
                    title="Open for editing"
                    onClick={() => onPick(keyOf(row), "entry")}
                  >
                    ✎
                  </button>
                </td>
              </tr>
            ))}
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
    </>
  );
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
  return (
    <ModalShell title="Sale Orders" isOpen={isOpen} wide onClose={onClose}>
      <SaleOrderListCore
        companyId={companyId}
        branchId={branchId}
        active={isOpen}
        onPick={(key, mode) => {
          onClose();
          onPick(key, mode);
        }}
      />
    </ModalShell>
  );
}

export type SaleOrderListViewProps = {
  companyId: string;
  branchId: string;
  onCreate: () => void;
  onOpen: SaleOrderListPick;
};

export function SaleOrderListView({ companyId, branchId, onCreate, onOpen }: SaleOrderListViewProps) {
  return (
    <div className={styles.page}>
      <header className={styles.titleBar}>
        <h1 className={styles.title}>Sale Orders</h1>
        <div className={styles.titleMeta}>
          <button type="button" className={cx(styles.button, styles.buttonPrimary)} onClick={onCreate}>
            + New Order
          </button>
        </div>
      </header>
      <SaleOrderListCore companyId={companyId} branchId={branchId} active onPick={onOpen} />
    </div>
  );
}
