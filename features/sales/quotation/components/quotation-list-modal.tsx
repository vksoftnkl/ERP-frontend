"use client";

/**
 * F8 — open another quotation without leaving the form.
 *
 * The same configured grid the list screen uses (84, "Quotation"), so it inherits
 * the same three constraints, each handled rather than papered over:
 *
 *  - **no filterable column**, so `search=` on the wire returns nothing; the box
 *    filters the fetched page;
 *  - **no `WHERE` clause**, so soft-deleted rows and other tenants' rows come
 *    back and are filtered out here;
 *  - **no `grid_param`**, so `meta.total` counts the unfiltered set — the footer
 *    reports what is actually on the page against that total instead of faking a
 *    page count. Silent truncation would read as "that is all there is".
 *
 * A row's whole document key is returned (company, branch and year included),
 * which is what lets another branch's quotation load correctly.
 */
import { useEffect, useMemo, useState } from "react";
import { useListQuotationsQuery } from "@/store/api/quotationApi";
import type { QuotationDocKey, QuotationListRow } from "../quotation.types";
import { toDateInput, toNumber } from "../quotation.utils";
import { ModalShell } from "./modal-shell";
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

const PAGE_SIZE = 50;

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
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setDebounced("");
      setPage(1);
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useListQuotationsQuery({ page, limit: PAGE_SIZE }, { skip: !isOpen });

  const rows = useMemo(() => {
    const all = data?.items ?? [];
    const needle = debounced.trim().toLowerCase();
    return all.filter((row) => {
      if (
        isDeleted(row.sq_is_deleted) ||
        (companyId && row.sq_company_id !== companyId) ||
        (branchId && row.sq_branch_id !== branchId) ||
        (accYear && row.sq_acc_year !== accYear)
      ) {
        return false;
      }
      if (!needle) {
        return true;
      }
      // Filtered here, not on the wire: the configured list grid has no
      // filterable column, so a `search=` param makes the runner inject `1 = 0`
      // and answer with an empty page.
      return [row.sq_quote_refno, row.sq_usr_refno, row.sq_cust_name, row.sq_cust_phone]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [accYear, branchId, companyId, data, debounced]);

  const fetched = data?.items.length ?? 0;
  const serverTotal = data?.meta.total ?? 0;
  const hasMore = page * PAGE_SIZE < serverTotal;

  const choose = (row: QuotationListRow) => {
    onPick({
      sqId: row.sq_id,
      sqCompanyId: row.sq_company_id,
      sqBranchId: row.sq_branch_id,
      sqAccYear: row.sq_acc_year,
    });
  };

  return (
    <ModalShell
      title="Quotations"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <span className={styles.modalNote}>
            {rows.length} of {fetched} rows on this page match
            {serverTotal ? ` · ${serverTotal} rows in the list overall` : ""}
          </span>
          <span className={styles.gridHeadActions}>
            <button
              type="button"
              className={styles.button}
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={!hasMore}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </span>
        </>
      }
    >
      <div className={styles.modalFilters}>
        <input
          className={styles.input}
          value={search}
          placeholder="Filter this page by quote no, ref no, customer or phone…"
          autoFocus
          autoComplete="off"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter" && rows[activeIndex]) {
              event.preventDefault();
              choose(rows[activeIndex]);
            }
          }}
        />
      </div>
      <div className={styles.listViewport}>
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Quote no</th>
              <th scope="col">Ref no</th>
              <th scope="col">Customer</th>
              <th scope="col">Phone</th>
              <th scope="col">Valid until</th>
              <th scope="col">Items</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.sq_id}
                data-selected={index === activeIndex ? "true" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(row)}
              >
                <td>{toDateInput(row.sq_quote_date)}</td>
                <td>{row.sq_quote_refno ?? "—"}</td>
                <td>{row.sq_usr_refno ?? ""}</td>
                <td>{row.sq_cust_name ?? ""}</td>
                <td>{row.sq_cust_phone ?? ""}</td>
                <td>{toDateInput(row.sq_valid_until)}</td>
                <td className={styles.alignRight}>{row.sq_tot_items ?? 0}</td>
                <td className={styles.alignRight}>{toNumber(row.sq_quote_amt).toFixed(2)}</td>
                <td>{row.sq_status ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyGrid}>
                  {isFetching
                    ? "Loading…"
                    : fetched > 0
                      ? "No quotation on this page belongs to the current company, branch and year."
                      : "No quotation matches."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
