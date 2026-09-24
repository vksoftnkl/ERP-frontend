"use client";

/**
 * Grid 109, with a tick per row.
 *
 * WHICH columns show, in what order, is grid 109's own configuration
 * (`fixed.grid_columns`), read through `/configured-grid-sql/columns`. Only the
 * rendering of a cell is decided here — a pill for the status and the bucket,
 * dd-mm-yyyy for dates, Indian grouping for money — keyed by the SQL field.
 *
 * What the screen READS about a row never comes from a cell: the row object
 * is parsed once (`fromGridRow`) and keys, money and dates come from there, so
 * an operator hiding a column cannot break an action.
 *
 * Keyboard, with the table focused: ↑/↓ move, Space ticks, Home/End jump, and
 * Enter opens the receipt (the screen handles that one — it is window-wide).
 */
import { useEffect, useRef } from "react";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import { formatAmount, formatDate, parseDate, parseMoney } from "../domain/chequeRow";
import { statusPill } from "../domain/bucket";
import type { TickSet } from "../domain/selection";
import type { ChequeRow } from "../domain/types";
import { BucketPill, StatusPill } from "./pill";
import styles from "../cheques.module.scss";

/**
 * What the grid shows until its configuration has been read, or if it cannot
 * be: its visible columns as seeded, with the Qt widths (fractions the Qt
 * table scaled by ten).
 */
const FALLBACK_COLUMNS: readonly { field: string; header: string; qtWidth: number }[] = [
  { field: "apd_instrument_no", header: "Cheque No", qtWidth: 7 },
  { field: "apd_instrument_date", header: "Instr Date", qtWidth: 8 },
  { field: "party_name", header: "Party", qtWidth: 13 },
  { field: "apd_amount", header: "Amount", qtWidth: 8 },
  { field: "apd_bank_name", header: "Drawn On", qtWidth: 10 },
  { field: "apd_status", header: "Status", qtWidth: 7 },
  { field: "due_bucket", header: "Due", qtWidth: 6 },
  { field: "apd_deposit_date", header: "Deposited", qtWidth: 7 },
  { field: "deposit_bank_name", header: "Into Bank", qtWidth: 14 },
  { field: "apd_present_count", header: "Presented", qtWidth: 5 },
  { field: "apd_clear_date", header: "Cleared", qtWidth: 7 },
  { field: "apd_bounce_date", header: "Bounced", qtWidth: 6 },
];
const QT_WIDTH = new Map(FALLBACK_COLUMNS.map((column) => [column.field, column.qtWidth]));

const MONEY_FIELDS = new Set(["apd_amount", "apd_bounce_charges"]);
const DATE_FIELDS = new Set([
  "apd_instrument_date",
  "apd_deposit_date",
  "apd_clear_date",
  "apd_bounce_date",
  "apd_created_on",
]);

export type RegisterColumn = {
  field: string;
  header: string;
  width: number;
  align: "left" | "center" | "right";
};

function widthOf(field: string, configured: string | undefined): number {
  const px = Number.parseFloat(configured ?? "");
  if (Number.isFinite(px) && px >= 32) {
    return Math.round(px);
  }
  return Math.max(64, (QT_WIDTH.get(field) ?? 10) * 11);
}

/** The configured columns, visible only, in the grid's own order. */
export function resolveColumns(config: readonly GridColumnConfig[] | undefined): RegisterColumn[] {
  const visible = (config ?? []).filter((column) => column.visible);
  const source =
    visible.length > 0
      ? visible.map((column) => ({
          field: column.sqlFieldName || column.accessorKey || column.key,
          header: column.header,
          width: column.width,
          align: column.align,
        }))
      : FALLBACK_COLUMNS.map((column) => ({
          field: column.field,
          header: column.header,
          width: undefined,
          align: undefined,
        }));
  return source.map((column) => ({
    field: column.field,
    header: column.header,
    width: widthOf(column.field, column.width),
    align:
      column.align ??
      (MONEY_FIELDS.has(column.field) || column.field === "apd_present_count"
        ? "right"
        : column.field === "apd_status" || column.field === "due_bucket"
          ? "center"
          : "left"),
  }));
}

function cell(row: ChequeRow, raw: Record<string, unknown>, field: string) {
  switch (field) {
    case "apd_status":
      return <StatusPill status={row.status} />;
    case "due_bucket":
      return <BucketPill bucket={row.bucket} />;
    case "apd_present_count":
      return row.presentCount > 0 ? String(row.presentCount) : "";
    default:
      break;
  }
  if (MONEY_FIELDS.has(field)) {
    const value = parseMoney(raw[field]);
    return field === "apd_amount" || value !== 0 ? formatAmount(value) : "";
  }
  if (DATE_FIELDS.has(field)) {
    return formatDate(parseDate(raw[field]));
  }
  const value = raw[field];
  return value === null || value === undefined ? "" : String(value);
}

export type RegisterProps = {
  columns: readonly RegisterColumn[];
  rows: readonly ChequeRow[];
  /** The raw grid rows, parallel to `rows`, for cells the row type does not carry. */
  rawRows: readonly Record<string, unknown>[];
  ticks: TickSet;
  currentId: string | null;
  loading: boolean;
  error: string | null;
  emptyText: string;
  onCurrent: (apdId: string) => void;
  onToggle: (row: ChequeRow) => void;
  onTogglePage: () => void;
  onOpen: (row: ChequeRow) => void;
};

export function Register(props: RegisterProps) {
  const {
    columns,
    rows,
    rawRows,
    ticks,
    currentId,
    loading,
    error,
    emptyText,
    onCurrent,
    onToggle,
    onTogglePage,
    onOpen,
  } = props;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const currentIndex = rows.findIndex((row) => row.apdId === currentId);

  // Keep the current row in view as the keyboard walks.
  useEffect(() => {
    if (!currentId) {
      return;
    }
    const element = viewportRef.current?.querySelector<HTMLElement>(
      `[data-apd-id="${CSS.escape(currentId)}"]`,
    );
    element?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  const move = (index: number) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (target) {
      onCurrent(target.apdId);
    }
  };

  const pageTicked = rows.length > 0 && rows.every((row) => ticks.has(row.apdId));
  const pagePartly = !pageTicked && rows.some((row) => ticks.has(row.apdId));
  const span = columns.length + 1;

  return (
    <div
      ref={viewportRef}
      className={styles.registerViewport}
      tabIndex={0}
      data-cheque-register="true"
      aria-label="Cheque register"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        const at = currentIndex < 0 ? 0 : currentIndex;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(currentIndex < 0 ? 0 : at + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(at - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(0);
        } else if (event.key === "End") {
          event.preventDefault();
          move(rows.length - 1);
        } else if (event.key === " ") {
          event.preventDefault();
          const row = rows[at];
          if (row) {
            onToggle(row);
          }
        }
      }}
    >
      <table className={styles.table}>
        <colgroup>
          <col style={{ width: "2.2em" }} />
          {columns.map((column) => (
            <col key={column.field} style={{ width: `${column.width}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className={styles.checkCell}>
              <input
                type="checkbox"
                aria-label="Tick every row on this page"
                checked={pageTicked}
                ref={(element) => {
                  if (element) {
                    element.indeterminate = pagePartly;
                  }
                }}
                onChange={onTogglePage}
                disabled={rows.length === 0}
                tabIndex={-1}
              />
            </th>
            {columns.map((column) => (
              <th
                key={column.field}
                className={
                  column.align === "right"
                    ? styles.alignRight
                    : column.align === "center"
                      ? styles.alignCenter
                      : undefined
                }
                title={column.header}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={span} className={styles.emptyCell}>
                {error ?? (loading ? "Reading the register…" : emptyText)}
              </td>
            </tr>
          ) : null}
          {rows.map((row, index) => {
            const ticked = ticks.has(row.apdId);
            const dimmed = statusPill(row.status).dimmed;
            return (
              <tr
                key={row.apdId}
                data-apd-id={row.apdId}
                className={[
                  styles.row,
                  row.apdId === currentId ? styles.rowCurrent : "",
                  ticked ? styles.rowTicked : "",
                  dimmed ? styles.rowDimmed : "",
                ].join(" ")}
                onMouseDown={() => onCurrent(row.apdId)}
                onDoubleClick={() => onOpen(row)}
              >
                <td className={styles.checkCell}>
                  <input
                    type="checkbox"
                    aria-label={`Tick cheque ${row.instrumentNo}`}
                    checked={ticked}
                    onChange={() => onToggle(row)}
                    tabIndex={-1}
                  />
                </td>
                {columns.map((column) => (
                  <td
                    key={column.field}
                    className={
                      column.align === "right"
                        ? styles.alignRight
                        : column.align === "center"
                          ? styles.alignCenter
                          : undefined
                    }
                  >
                    {cell(row, rawRows[index] ?? {}, column.field)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
