"use client";

/**
 * One of the session's configured grids (145 timeline, 146 bills, 147 money
 * documents, 148 counts) as a read-only table. Which columns, in what order,
 * with what headings and alignment is the grid's own config
 * (`/configured-grid-sql/columns`), so Grid Master moves them without touching
 * this file; the fallback list stands in until it is read.
 *
 * Given `onSelect`, the table is a pick list (Qt's current index, c77f3f1 —
 * the cockpit's Bills tab drives Re-tender with it, its Money documents tab
 * Void movement, bec3f98): a click picks a row,
 * ↑ / ↓ / Home / End move the pick while the table has the focus.
 */
import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import { useGridId, type ConfiguredGridKey } from "@/lib/configured-grids";
import { useGetGridColumnsQuery } from "@/store/api/metadataApi";
import { textOf } from "../shared/format";
import type { GridRow } from "../shared/wire/types";
import styles from "../shared/till.module.scss";
import { pickedIndexAfter } from "./cockpit";
import local from "./sessions.module.scss";

export type GridColumn = { field: string; header: string; align: "left" | "center" | "right" };

export type GridTableProps = {
  grid: ConfiguredGridKey;
  rows: readonly GridRow[];
  fallbackColumns: readonly GridColumn[];
  /** The id column, for row keys. */
  idField: string;
  cell: (row: GridRow, field: string) => ReactNode;
  loading?: boolean;
  error?: string;
  emptyText: string;
  /** The picked row's id (`idField`); a pick list only with `onSelect`. */
  selectedId?: string | null;
  onSelect?: (row: GridRow) => void;
  /** The pick list's accessible name. */
  label?: string;
};

export function useConfiguredColumns(grid: ConfiguredGridKey, fallback: readonly GridColumn[]): GridColumn[] {
  const gridId = Number.parseInt(useGridId(grid), 10);
  const { data } = useGetGridColumnsQuery({ gridId }, { skip: !Number.isFinite(gridId) });
  return useMemo(() => {
    const configured = (data ?? [])
      .filter((column) => column.visible !== false)
      .sort((a, b) => (a.position ?? a.order) - (b.position ?? b.order))
      .map((column) => ({
        field: column.sqlFieldName || column.accessorKey || column.key,
        header: column.header || column.columnName || column.key,
        align: column.align ?? "left",
      }))
      .filter((column) => column.field);
    return configured.length > 0 ? configured : [...fallback];
  }, [data, fallback]);
}

export function GridTable({
  grid,
  rows,
  fallbackColumns,
  idField,
  cell,
  loading,
  error,
  emptyText,
  selectedId,
  onSelect,
  label,
}: GridTableProps) {
  const columns = useConfiguredColumns(grid, fallbackColumns);
  const selectable = Boolean(onSelect);
  const selectedIndex = selectable && selectedId ? rows.findIndex((row) => textOf(row, idField) === selectedId) : -1;

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (!onSelect || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const next = pickedIndexAfter(event.key, selectedIndex, rows.length);
    if (next < 0) return;
    event.preventDefault();
    onSelect(rows[next]);
    event.currentTarget.querySelectorAll("tbody tr")[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <table
      className={cx(styles.table, selectable && local.pickTable)}
      tabIndex={selectable ? 0 : undefined}
      aria-label={label}
      onKeyDown={selectable ? onKeyDown : undefined}
    >
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.field} scope="col" className={cx(column.align === "right" && styles.right, column.align === "center" && styles.center)}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={String(row[idField] ?? index)}
            aria-selected={selectable ? index === selectedIndex : undefined}
            onClick={onSelect ? () => onSelect(row) : undefined}
          >
            {columns.map((column) => (
              <td key={column.field} className={cx(column.align === "right" && styles.right, column.align === "center" && styles.center)}>
                {cell(row, column.field)}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={Math.max(1, columns.length)} className={styles.emptyCell}>
              {error ? error : loading ? "Loading…" : emptyText}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** The fallback columns, as grids 145–148 are configured on the dev box. */
export const FALLBACK_COLUMNS: Record<"events" | "bills" | "money" | "counts", readonly GridColumn[]> = {
  events: [
    { field: "te_time", header: "Time", align: "left" },
    { field: "tev_event_code", header: "Event", align: "left" },
    { field: "te_ref", header: "Ref", align: "left" },
    { field: "tev_amount", header: "Amount", align: "right" },
    { field: "te_user", header: "By", align: "left" },
    { field: "te_reason", header: "Reason", align: "left" },
    { field: "te_payload", header: "Detail", align: "left" },
  ],
  bills: [
    { field: "tb_kind", header: "Kind", align: "left" },
    { field: "tb_refno", header: "Doc", align: "left" },
    { field: "tb_clock", header: "Time", align: "left" },
    { field: "tb_party", header: "Party", align: "left" },
    { field: "tb_amount", header: "Amount", align: "right" },
    { field: "tb_status", header: "Status", align: "left" },
  ],
  money: [
    { field: "md_doc", header: "Doc", align: "left" },
    { field: "md_clock", header: "Time", align: "left" },
    { field: "md_kind", header: "Kind", align: "left" },
    { field: "md_amount", header: "Cash", align: "right" },
    { field: "md_detail", header: "Party / reason", align: "left" },
    { field: "md_by", header: "By", align: "left" },
    { field: "md_witness", header: "Witness", align: "left" },
    { field: "md_status", header: "Status", align: "left" },
  ],
  counts: [
    { field: "tct_attempt_no", header: "No", align: "right" },
    { field: "tct_kind", header: "Kind", align: "left" },
    { field: "tc_clock", header: "Time", align: "left" },
    { field: "tct_total_counted", header: "Counted", align: "right" },
    { field: "tct_expected", header: "Expected at count", align: "right" },
    { field: "tc_blind", header: "Blind", align: "left" },
    { field: "tc_by", header: "By", align: "left" },
    { field: "tc_final", header: "Final", align: "left" },
  ],
};
