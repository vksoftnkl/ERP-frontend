"use client";

/**
 * Grid 121, one row at a time.
 *
 * The received register's table without its tick column: every verb on this
 * side acts on ONE cheque (there is no presenting a slip of ours), so a tick
 * would only invite a bulk move that does not exist.
 *
 * WHICH columns show, and in what order, is grid 121's own configuration;
 * only a cell's rendering is decided here — a pill for the status and the
 * state, dd-mm-yyyy for dates, Indian grouping for money, Yes / No for the
 * crossing. What the screen READS about a row comes from the parsed row,
 * never a cell, so hiding a column cannot break an action.
 *
 * Keyboard, with the table focused: ↑/↓ move, Home/End jump; Enter (handled
 * window-wide by the screen) opens the voucher.
 */
import { useEffect, useRef } from "react";
import type { GridColumnConfig } from "@/store/slices/gridColumnsSlice";
import { formatAmount, formatDate, parseDate, parseMoney } from "../../domain/chequeRow";
import { TonePill } from "../../components/pill";
import { issuedStatePill, issuedStatusPill } from "../domain/pills";
import type { IssuedChequeRow } from "../issued.types";
import styles from "../../cheques.module.scss";

/** The visible columns as seeded, with the Qt widths — until the config is read. */
const FALLBACK_COLUMNS: readonly { field: string; header: string; qtWidth: number }[] = [
  { field: "apd_instrument_no", header: "Cheque No", qtWidth: 7 },
  { field: "apd_instrument_date", header: "Cheque Date", qtWidth: 8 },
  { field: "issued_on", header: "Issued On", qtWidth: 8 },
  { field: "party_name", header: "Supplier", qtWidth: 14 },
  { field: "apd_favouring", header: "Favouring", qtWidth: 14 },
  { field: "apd_amount", header: "Amount", qtWidth: 9 },
  { field: "bank_name", header: "Bank", qtWidth: 12 },
  { field: "acb_book_no", header: "Book", qtWidth: 6 },
  { field: "apd_status", header: "Status", qtWidth: 9 },
  { field: "apd_clear_date", header: "Presented", qtWidth: 8 },
  { field: "avh_voucher_refno", header: "Voucher", qtWidth: 9 },
  { field: "state", header: "State", qtWidth: 8 },
];
const QT_WIDTH = new Map(FALLBACK_COLUMNS.map((column) => [column.field, column.qtWidth]));

const MONEY_FIELDS = new Set(["apd_amount"]);
const DATE_FIELDS = new Set([
  "apd_instrument_date",
  "issued_on",
  "apd_clear_date",
  "apd_bounce_date",
]);
const CENTRED_FIELDS = new Set(["apd_status", "state", "apd_ac_payee"]);

export type IssuedRegisterColumn = {
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
export function resolveIssuedColumns(
  config: readonly GridColumnConfig[] | undefined,
): IssuedRegisterColumn[] {
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
      (MONEY_FIELDS.has(column.field) || column.field === "apd_print_count"
        ? "right"
        : CENTRED_FIELDS.has(column.field)
          ? "center"
          : "left"),
  }));
}

function cell(row: IssuedChequeRow, raw: Record<string, unknown>, field: string) {
  switch (field) {
    case "apd_status":
      return <TonePill pill={issuedStatusPill(row.status)} title={String(row.status)} />;
    case "state": {
      const pill = issuedStatePill(row.state);
      return <TonePill pill={pill} title={pill.hint ?? String(row.state)} />;
    }
    case "apd_ac_payee":
      return row.acPayee ? "Yes" : "No";
    case "apd_print_count":
      return row.printCount > 0 ? String(row.printCount) : "";
    default:
      break;
  }
  if (MONEY_FIELDS.has(field)) {
    return formatAmount(parseMoney(raw[field]));
  }
  if (DATE_FIELDS.has(field)) {
    return formatDate(parseDate(raw[field]));
  }
  const value = raw[field];
  return value === null || value === undefined ? "" : String(value);
}

export type IssuedRegisterProps = {
  columns: readonly IssuedRegisterColumn[];
  rows: readonly IssuedChequeRow[];
  rawRows: readonly Record<string, unknown>[];
  currentId: string | null;
  loading: boolean;
  error: string | null;
  emptyText: string;
  onCurrent: (apdId: string) => void;
  onOpen: (row: IssuedChequeRow) => void;
};

export function IssuedRegister(props: IssuedRegisterProps) {
  const { columns, rows, rawRows, currentId, loading, error, emptyText, onCurrent, onOpen } = props;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const currentIndex = rows.findIndex((row) => row.apdId === currentId);

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

  const alignClass = (align: IssuedRegisterColumn["align"]) =>
    align === "right" ? styles.alignRight : align === "center" ? styles.alignCenter : undefined;

  return (
    <div
      ref={viewportRef}
      className={styles.registerViewport}
      tabIndex={0}
      data-cheque-register="true"
      aria-label="Issued cheque register"
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
        }
      }}
    >
      <table className={styles.table}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.field} style={{ width: `${column.width}px` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.field} className={alignClass(column.align)} title={column.header}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(1, columns.length)} className={styles.emptyCell}>
                {error ?? (loading ? "Reading the register…" : emptyText)}
              </td>
            </tr>
          ) : null}
          {rows.map((row, index) => (
            <tr
              key={row.apdId}
              data-apd-id={row.apdId}
              className={[
                styles.row,
                row.apdId === currentId ? styles.rowCurrent : "",
                issuedStatusPill(row.status).dimmed ? styles.rowDimmed : "",
              ].join(" ")}
              onMouseDown={() => onCurrent(row.apdId)}
              onDoubleClick={() => onOpen(row)}
            >
              {columns.map((column) => (
                <td key={column.field} className={alignClass(column.align)}>
                  {cell(row, rawRows[index] ?? {}, column.field)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
