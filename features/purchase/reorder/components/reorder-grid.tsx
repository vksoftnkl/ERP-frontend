"use client";

/**
 * The Reorder → PO grid — ui_table 64 (Qt `NexTable` + `PurchaseInvoiceDelegate`
 * in its reorder set-up, `PurchaseReorderCols`).
 *
 * ✓ ticks a row for "Create POs": a click on the ✓ cell, or Space anywhere on
 * the row (Qt: Space on the grid; Order qty / Rate never take a space). Order
 * qty and Rate are keyed; Enter walks Order qty → Rate → the next row's Order
 * qty (Qt `setFocusStops`); ↑ / ↓ keep the column.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { isoToDisplayDate } from "@/lib/date-format";
import { COL, REORDER_GRID_NAME, REORDER_NUMBER_COLUMNS, TICK } from "../reorder.constants";
import { cellText, type ReorderGridColumn } from "../reorder.state";
import type { ReorderRow } from "../reorder.types";
import styles from "../page.module.scss";

const ROW_ATTR = "data-reorder-row";
const FIELD_ATTR = "data-reorder-field";

/** Focus a row's cell: "tick", "qty" or "rate". */
export function focusReorderCell(key: string, field: "tick" | "qty" | "rate"): boolean {
  const element = document.querySelector<HTMLElement>(
    `[data-grid-name="${REORDER_GRID_NAME}"] [${ROW_ATTR}="${CSS.escape(key)}"] [${FIELD_ATTR}="${field}"]`,
  );
  element?.focus();
  if (element instanceof HTMLInputElement) {
    element.select();
  }
  return Boolean(element);
}

export type ReorderGridProps = {
  rows: readonly ReorderRow[];
  columns: readonly ReorderGridColumn[];
  /** Nothing is keyed while a create is on its way. */
  disabled: boolean;
  onToggle: (key: string) => void;
  onOrderQty: (key: string, raw: string) => void;
  onRate: (key: string, raw: string) => void;
};

export function ReorderGrid({ rows, columns, disabled, onToggle, onOrderQty, onRate }: ReorderGridProps) {
  /** Space ticks, ↑ / ↓ keep the field, Enter walks qty → rate → next qty. */
  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const row = rows[index];
    const field = (event.target as HTMLElement).getAttribute(FIELD_ATTR) as "tick" | "qty" | "rate" | null;
    if (event.key === " " && !disabled) {
      event.preventDefault();
      onToggle(row.key);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const next = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        event.preventDefault();
        focusReorderCell(next.key, field ?? "tick");
      }
      return;
    }
    if (event.key === "Enter" && field) {
      event.preventDefault();
      if (field === "tick") {
        focusReorderCell(row.key, "qty");
      } else if (field === "qty" && !event.shiftKey) {
        focusReorderCell(row.key, "rate");
      } else if (field === "rate" && !event.shiftKey) {
        const next = rows[index + 1];
        if (next) {
          focusReorderCell(next.key, "qty");
        }
      } else if (field === "rate") {
        focusReorderCell(row.key, "qty");
      } else if (index > 0) {
        focusReorderCell(rows[index - 1].key, "rate");
      }
    }
  };

  const renderCell = (row: ReorderRow, column: ReorderGridColumn) => {
    const numeric = REORDER_NUMBER_COLUMNS.has(column.no);
    switch (column.no) {
      case COL.Tick:
        return (
          <button
            type="button"
            {...{ [FIELD_ATTR]: "tick" }}
            className={cx(styles.tickCell, row.ticked && styles.tickOn)}
            aria-pressed={row.ticked}
            aria-label={row.ticked ? `Untick ${row.itemName}` : `Tick ${row.itemName}`}
            title="Tick for Create POs (Space)"
            disabled={disabled}
            onClick={() => onToggle(row.key)}
          >
            {row.ticked ? TICK : ""}
          </button>
        );
      case COL.OrderQty:
        return (
          <input
            {...{ [FIELD_ATTR]: "qty" }}
            className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
            value={row.orderQty}
            inputMode="decimal"
            disabled={disabled}
            aria-label={`Order qty — ${row.itemName}`}
            onChange={(event) => onOrderQty(row.key, event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
        );
      case COL.Rate:
        return (
          <input
            {...{ [FIELD_ATTR]: "rate" }}
            className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
            value={row.rate}
            inputMode="decimal"
            disabled={disabled}
            aria-label={`Rate — ${row.itemName}`}
            onChange={(event) => onRate(row.key, event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
        );
      default: {
        let value = "";
        switch (column.no) {
          case COL.Item:
            value = row.itemName;
            break;
          case COL.Unit:
            value = row.unitName;
            break;
          case COL.Godown:
            value = row.godownName;
            break;
          case COL.Supplier:
            value = row.supplierName;
            break;
          case COL.Source:
            value = row.source;
            break;
          case COL.LastBought:
            value = row.lastBought ? isoToDisplayDate(row.lastBought) : "";
            break;
          default:
            value = cellText(row, column.no);
        }
        return (
          <div
            className={cx(quotationStyles.cellText, numeric && quotationStyles.alignRight)}
            title={column.no === COL.Supplier && !row.supplierId ? "No supplier yet — set one for the ticked rows below." : value}
          >
            {value || " "}
          </div>
        );
      }
    }
  };

  return (
    <div className={cx(quotationStyles.gridViewport, styles.gridViewport)} data-grid-name={REORDER_GRID_NAME}>
      <table className={cx(quotationStyles.grid, styles.grid)}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.no} style={{ width: `${column.widthPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.no} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.key}
              {...{ [ROW_ATTR]: row.key }}
              className={cx(
                index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                row.ticked && styles.rowTicked,
                !row.below && styles.rowAbove,
              )}
              onKeyDown={(event) => onRowKeyDown(event, index)}
            >
              {columns.map((column) => (
                <td key={column.no}>
                  {renderCell(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
