"use client";

/**
 * A configured-grid popup — NexTable's `openGridPopup`: the grid's own visible
 * columns, a search box seeded with whatever key opened it, ↑↓ to walk, Enter
 * or a click to pick. The count grid opens two: grid 71 on the Item cell (with
 * the company / branch the Qt PopupConfig passes) and grid 102 on Reason.
 */
import { useEffect, useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { useGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { usePhysicalStockPickerGridQuery } from "../physical-stock.api";
import styles from "../page.module.scss";

export type PickerColumn = { field: string; header: string };

export type GridPickerModalProps = {
  isOpen: boolean;
  title: string;
  gridKey: ConfiguredGridKey;
  /** The grid SQL's bare tokens. Pass a stable object. */
  params?: Record<string, string>;
  /** Shown when the grid's column config cannot be read. */
  fallbackColumns: readonly PickerColumn[];
  initialQuery?: string;
  emptyText: string;
  onClose: () => void;
  onPick: (row: Record<string, unknown>) => void;
};

const PAGE_SIZE = 20;

function textOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** Mounted only while open, so every open starts from the key that opened it. */
export function GridPickerModal(props: GridPickerModalProps) {
  return props.isOpen ? <OpenGridPicker {...props} /> : null;
}

function OpenGridPicker(props: GridPickerModalProps) {
  const {
    isOpen,
    title,
    gridKey,
    params,
    fallbackColumns,
    initialQuery = "",
    emptyText,
    onClose,
    onPick,
  } = props;
  const gridId = useGridId(gridKey);
  const [search, setSearch] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (search === debounced) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
      setActiveIndex(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [debounced, search]);

  const numericGridId = Number.parseInt(gridId, 10);
  const { data: configured } = useGetGridColumnsQuery(
    { gridId: numericGridId },
    { skip: !isOpen || !Number.isFinite(numericGridId) },
  );
  const columns = useMemo<PickerColumn[]>(() => {
    const visible = (configured ?? [])
      .filter((column) => column.visible)
      .map((column) => ({ field: column.accessorKey, header: column.header }));
    return visible.length > 0 ? visible : [...fallbackColumns];
  }, [configured, fallbackColumns]);

  const { data, isFetching, isError } = usePhysicalStockPickerGridQuery(
    { gridId, search: debounced, page, limit: PAGE_SIZE, params },
    { skip: !isOpen || !gridId },
  );
  const rows = useMemo(() => data?.items ?? [], [data]);
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const choose = (row: Record<string, unknown> | undefined) => {
    if (row) {
      onPick(row);
    }
  };

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
        placeholder="Search…"
        autoFocus
        autoComplete="off"
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(rows[activeIndex]);
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
                key={`${index}-${columns.map((column) => textOf(row[column.field])).join("|")}`}
                className={cx(index === activeIndex && styles.pickerRowActive)}
                data-selected={index === activeIndex ? "true" : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(row)}
              >
                {columns.map((column) => (
                  <td key={column.field}>{textOf(row[column.field])}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className={quotationStyles.emptyGrid}>
                  {isFetching ? "Searching…" : isError ? "The list could not be read." : emptyText}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
