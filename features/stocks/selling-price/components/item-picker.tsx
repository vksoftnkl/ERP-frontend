"use client";

/**
 * Mounted only while open, so every opening starts from the cell's keystroke.
 *
 * The Item cell's picker — configured grid 71 ("POPUP - ITEMS"), the product's
 * one item search, scoped to this company and branch the way the Qt
 * PopupConfig scopes it (`iitem_company_id` / `iitem_branch_id`). The
 * quotation's picker searches the same grid unscoped, which is why this
 * screen carries its own.
 *
 * One row per item × unit; the pick names the ITEM — the screen then loads
 * every unit × bucket of it, so the unit picked here does not matter.
 */
import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import qs from "@/features/sales/quotation/page.module.scss";
import { useGridId } from "@/lib/configured-grids";
import { useSearchSellingPriceItemsQuery } from "../selling-price.api";
import { ITEM_PICKER_GRID_KEY } from "../selling-price.constants";
import type { ItemPickerRow } from "../selling-price.types";

const PAGE_SIZE = 20;

export type ItemPickerProps = {
  initialQuery: string;
  companyId: string;
  branchId: string;
  onClose: () => void;
  onPick: (itemId: string, itemName: string) => void;
};

export function ItemPicker(props: ItemPickerProps) {
  const { initialQuery, companyId, branchId, onClose, onPick } = props;
  const gridId = useGridId(ITEM_PICKER_GRID_KEY);
  const [search, setSearch] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
      setActive(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useSearchSellingPriceItemsQuery(
    { gridId, search: debounced, page, limit: PAGE_SIZE, companyId, branchId },
    { skip: !gridId },
  );
  const rows = useMemo<ItemPickerRow[]>(() => data?.items ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const choose = (row: ItemPickerRow | undefined) => {
    if (row?.item_id) {
      onPick(row.item_id, row.item_name_en);
    }
  };

  return (
    <ModalShell
      title="Select item"
      isOpen
      fixedHeight
      onClose={onClose}
      footer={
        <>
          <span className={qs.modalNote}>
            {total} match{total === 1 ? "" : "es"} · page {page} of {pageCount}
          </span>
          <span className={qs.gridHeadActions}>
            <button
              type="button"
              className={qs.button}
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={qs.button}
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
        className={qs.input}
        value={search}
        placeholder="Search by item name…"
        autoFocus
        autoComplete="off"
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "PageDown") {
            event.preventDefault();
            setPage((current) => Math.min(pageCount, current + 1));
          } else if (event.key === "PageUp") {
            event.preventDefault();
            setPage((current) => Math.max(1, current - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(rows[active]);
          }
        }}
      />
      <div className={qs.listViewport}>
        <table className={qs.listTable}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Uom</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.item_id}-${row.item_uom_id}`}
                data-selected={index === active ? "true" : undefined}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(row)}
              >
                <td>{row.item_name_en}</td>
                <td>{row.unit_name}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className={qs.emptyGrid}>
                  {isFetching ? "Searching…" : "No item matches that name."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
