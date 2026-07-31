"use client";

/**
 * The item picker — configured grid 71 ("POPUP - ITEMS").
 *
 * Grid 71 returns one row per item × unit conversion, so a pick settles the item
 * and its selling unit together, and `item_uom_id` is an `iuc_id` (the value a
 * line stores), not a raw `unit_id`.
 *
 * Only `item_name_en` has `grid_column_filter = true`, so the server can only
 * search on the name — a code or barcode search has to go through the Barcode
 * cell instead.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchPickerItemsQuery } from "@/store/api/quotationApi";
import type { ItemPickerRow } from "../quotation.types";
import { ModalShell } from "./modal-shell";
import styles from "../page.module.scss";

export type ItemPick = { itemId: string; itemUnitId: string; itemName: string; unitName: string };

export type ItemPickerModalProps = {
  isOpen: boolean;
  /** Pre-fills the search box — whatever the operator typed in the cell. */
  initialQuery?: string;
  /** Warn (do not block) when the picked item is already on another row. */
  usedItemIds?: string[];
  onClose: () => void;
  onPick: (pick: ItemPick) => void;
};

const PAGE_SIZE = 20;

export function ItemPickerModal(props: ItemPickerModalProps) {
  const { isOpen, initialQuery = "", usedItemIds = [], onClose, onPick } = props;
  const [search, setSearch] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);

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
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useSearchPickerItemsQuery(
    { search: debounced, page, limit: PAGE_SIZE },
    { skip: !isOpen },
  );

  const rows = useMemo<ItemPickerRow[]>(() => data?.items ?? [], [data]);
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const used = useMemo(() => new Set(usedItemIds), [usedItemIds]);

  const choose = (row: ItemPickerRow) => {
    onPick({
      itemId: row.item_id,
      itemUnitId: row.item_uom_id,
      itemName: row.item_name_en,
      unitName: row.unit_name,
    });
  };

  return (
    <ModalShell
      title="Select item"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <>
          <span className={styles.modalNote}>
            {total} match{total === 1 ? "" : "es"} · page {page} of {pageCount}
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
        className={styles.input}
        value={search}
        placeholder="Search by item name…"
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
      <div className={styles.listViewport}>
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Uom</th>
              <th scope="col" />
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
                <td className={styles.modalNote}>
                  {used.has(row.item_id) ? "already on this quotation" : ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.emptyGrid}>
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
