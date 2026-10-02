"use client";

/**
 * The item picker on the Item cell — grid 71 "POPUP - ITEMS", the one item
 * search the whole product uses, scoped to this document's company and branch
 * as the Qt popup scopes it (`iitem_company_id` / `iitem_branch_id`).
 *
 * A row is an item × unit, so a pick settles the unit the line is keyed in
 * (`item_uom_id` is an iuc_id). A scan typed into the search matches no name;
 * Enter then resolves it as a barcode — the Qt `resolveBarcode` path, since the
 * Barcode column is never on this screen.
 */
import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useStockAdjustmentItemSearchQuery } from "../stock-adjustment.api";
import type { ItemPickerRow } from "../stock-adjustment.types";

const PAGE_SIZE = 20;

export type AdjustmentItemPick = { itemId: string; itemName: string; unitId: string };

export type AdjustmentItemPickerProps = {
  isOpen: boolean;
  initialQuery: string;
  companyId: string;
  branchId: string;
  onClose: () => void;
  onPick: (pick: AdjustmentItemPick) => void;
  /** Enter on a search that matches nothing: try it as a barcode. True when it resolved. */
  onBarcode: (code: string) => Promise<boolean>;
};

export function AdjustmentItemPicker(props: AdjustmentItemPickerProps) {
  const { isOpen, initialQuery, companyId, branchId, onClose, onPick, onBarcode } = props;
  const [search, setSearch] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSearch(initialQuery);
      setDebounced(initialQuery);
      setPage(1);
      setActiveIndex(0);
    }
  }, [initialQuery, isOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
      setActiveIndex(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useStockAdjustmentItemSearchQuery(
    { search: debounced, page, limit: PAGE_SIZE, companyId, branchId },
    { skip: !isOpen },
  );
  const rows = useMemo<ItemPickerRow[]>(() => data?.items ?? [], [data]);
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const choose = (row: ItemPickerRow) =>
    onPick({ itemId: row.item_id, itemName: row.item_name_en, unitId: row.item_uom_id });

  const tryBarcode = async () => {
    const code = search.trim();
    if (!code || resolving) {
      return;
    }
    setResolving(true);
    try {
      await onBarcode(code);
    } finally {
      setResolving(false);
    }
  };

  return (
    <ModalShell
      title="Select item"
      isOpen={isOpen}
      fixedHeight
      onClose={onClose}
      footer={
        <>
          <span className={quotationStyles.modalNote}>
            {total} match{total === 1 ? "" : "es"} · page {page} of {pageCount}
          </span>
          <span className={quotationStyles.gridHeadActions}>
            <button
              type="button"
              className={quotationStyles.button}
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={quotationStyles.button}
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              Next
            </button>
          </span>
        </>
      }
    >
      <input
        className={quotationStyles.input}
        value={search}
        placeholder="Search by item name, or scan a barcode…"
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
          if (event.key === "Enter") {
            event.preventDefault();
            // Typed faster than the search answered: the rows on screen are
            // for an older query, so resolve the text as it stands.
            if (debounced === search && rows[activeIndex]) {
              choose(rows[activeIndex]);
            } else if (debounced === search && !isFetching) {
              void tryBarcode();
            }
          }
        }}
      />
      <div className={quotationStyles.listViewport}>
        <table className={quotationStyles.listTable}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.item_id}-${row.item_uom_id}`}
                data-selected={index === activeIndex ? "true" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(row)}
              >
                <td>{row.item_name_en}</td>
                <td>{row.unit_name}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className={quotationStyles.emptyGrid}>
                  {isFetching || resolving
                    ? "Searching…"
                    : search.trim()
                      ? "No item matches that name — Enter tries it as a barcode."
                      : "No item matches that name."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
