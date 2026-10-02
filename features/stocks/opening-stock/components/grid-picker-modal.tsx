"use client";

/**
 * A configured popup grid as a picker — what `NexTable::openGridPopup()` opens
 * on the Description cell (grid 71, items) and the Supplier cell (grid 100).
 *
 * The popup IS a configured grid: its columns, their headings and widths come
 * from the grid's own column config (`/configured-grid-sql/columns`), and its
 * rows from the grid's stored SELECT, with the screen's named tokens bound
 * (`grid_param`). Nothing about which columns show lives on this screen; the
 * caller only says which row fields it reads back.
 */
import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import { useRunOpeningStockPickerGridQuery } from "../opening-stock.api";
import type { GridRow } from "../opening-stock.types";

export type PickerFallbackColumn = { field: string; header: string };

export type GridPickerModalProps = {
  isOpen: boolean;
  title: string;
  /** The resolved `grid_id`. */
  gridId: string;
  /** The SELECT's named tokens. Pass a stable object. */
  params?: Record<string, string>;
  /** Pre-fills the search — whatever the operator typed into the cell. */
  initialQuery?: string;
  searchPlaceholder: string;
  /** Shown when the grid's column config cannot be read. */
  fallbackColumns: readonly PickerFallbackColumn[];
  /** The field that identifies a row — React's key. */
  rowKeyField: string;
  onClose: () => void;
  onPick: (row: GridRow) => void;
};

const PAGE_SIZE = 20;

type PickerColumn = { field: string; header: string; align?: "left" | "center" | "right" };

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function GridPickerModal(props: GridPickerModalProps) {
  const {
    isOpen,
    title,
    gridId,
    params,
    initialQuery = "",
    searchPlaceholder,
    fallbackColumns,
    rowKeyField,
    onClose,
    onPick,
  } = props;

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
      setActiveIndex(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const numericGridId = Number.parseInt(gridId, 10);
  const { data: columnConfig } = useGetGridColumnsQuery(
    { gridId: numericGridId },
    { skip: !isOpen || !Number.isFinite(numericGridId) },
  );
  const { data, isFetching, isError } = useRunOpeningStockPickerGridQuery(
    { gridId, search: debounced, page, limit: PAGE_SIZE, params },
    { skip: !isOpen || !gridId },
  );

  const columns = useMemo<PickerColumn[]>(() => {
    const configured = (columnConfig ?? [])
      .filter((column) => column.visible !== false)
      .sort((left, right) => (left.position ?? left.order) - (right.position ?? right.order))
      .map((column) => ({
        field: column.sqlFieldName || column.accessorKey || column.key,
        header: column.header || column.columnName || column.key,
        align: column.align,
      }))
      .filter((column) => column.field);
    return configured.length > 0 ? configured : fallbackColumns.map((column) => ({ ...column }));
  }, [columnConfig, fallbackColumns]);

  const rows = useMemo<GridRow[]>(() => data?.items ?? [], [data]);
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ModalShell
      title={title}
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
        placeholder={searchPlaceholder}
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
          if (event.key === "PageDown" && page < pageCount) {
            event.preventDefault();
            setPage(page + 1);
            setActiveIndex(0);
          }
          if (event.key === "PageUp" && page > 1) {
            event.preventDefault();
            setPage(page - 1);
            setActiveIndex(0);
          }
          if (event.key === "Enter" && rows[activeIndex]) {
            event.preventDefault();
            event.stopPropagation();
            onPick(rows[activeIndex]);
          }
        }}
      />
      <div className={quotationStyles.listViewport}>
        <table className={quotationStyles.listTable}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.field} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${cellText(row[rowKeyField])}-${index}`}
                data-selected={index === activeIndex ? "true" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onPick(row)}
              >
                {columns.map((column) => (
                  <td key={column.field} style={column.align ? { textAlign: column.align } : undefined}>
                    {cellText(row[column.field])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className={quotationStyles.emptyGrid}>
                  {isFetching ? "Searching…" : isError ? "The list could not be read." : "Nothing matches."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
