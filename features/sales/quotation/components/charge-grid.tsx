"use client";

/**
 * The additional-charges grid — ui table 26 ("QUOTATION - CHARGES", 33 columns).
 *
 * Everything except Rate, Unit, Amount and Remarks is a snapshot of the charge
 * master or an output of the distribution, so the grid is mostly a read-out. Two
 * rules the operator can feel:
 *
 *  - Rate is not editable on a FIXED row: the lump sum comes from the master and
 *    the operator prices such a row by typing its Amount instead.
 *  - Typing an Amount zeroes the Rate (and keying a Rate zeroes the Amount) —
 *    that is how the engine tells "priced by total" from "priced by rate", so the
 *    two cells can never both be live.
 *
 * The layout opens with Unit / QtyVal / Weight hidden. That costs nothing: the
 * per-unit and weight methods are measured against the LINES, not against the
 * charge row's own snapshot columns, so a hidden column cannot stop a charge from
 * pricing — and Admin settings can show them again either way.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import type { PricedChargeRow } from "@/domain/pricing";
import {
  CHARGE_APPLY_ON_LABELS,
  CHARGE_METHOD_LABELS,
  CHARGE_RATE_SUFFIX,
  CHARGE_TYPE_LABELS,
} from "../quotation.constants";
import type { DraftChargeRow } from "../quotation.types";
import {
  isFrozenColumn,
  scaledWidth,
  totalColumnWidth,
  type ResolvedChargeColumn,
} from "../quotation.utils";
import { GridCell } from "./grid-cell";
import { moveCellFocus } from "./grid-focus";
import styles from "../page.module.scss";

export const CHARGE_GRID_NAME = "charges";

/**
 * The `data-quotation-field` key of the charge-name cell, whatever the layout
 * calls it — the anchor the picker resumes the Enter chain from on its way out.
 *
 * Read off the resolved columns rather than hard-coded, for the same reason the
 * item grid's twin is: the key is the column's `write` target when it has one
 * and its normalised header otherwise, and the charge lookup writes nothing.
 */
export function chargeLookupFieldKey(columns: ResolvedChargeColumn[]): string | null {
  const column = columns.find(
    (candidate) => candidate.visible && candidate.kind === "chargeLookup",
  );
  return column ? String(column.write ?? column.key) : null;
}

/** The sticky remove-row column. */
const ROW_ACTION_PX = 30;

export type ChargeGridProps = {
  columns: ResolvedChargeColumn[];
  rows: DraftChargeRow[];
  priced: PricedChargeRow[];
  editable: boolean;
  /** The column a width drag is live on, for the handle's own highlight. */
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  onOpenChargePicker: (rowKey: string) => void;
  onSetField: (rowKey: string, field: keyof DraftChargeRow, raw: string) => void;
  onRemoveRow: (rowKey: string) => void;
};

/** A label column shows the enum's caption, not the stored token. */
function labelFor(fieldKey: string, value: unknown): string {
  const raw = String(value ?? "");
  if (fieldKey === "method") {
    return CHARGE_METHOD_LABELS[raw as keyof typeof CHARGE_METHOD_LABELS] ?? raw;
  }
  if (fieldKey === "type") {
    return CHARGE_TYPE_LABELS[raw as keyof typeof CHARGE_TYPE_LABELS] ?? raw;
  }
  if (fieldKey === "applyOn") {
    return CHARGE_APPLY_ON_LABELS[raw as keyof typeof CHARGE_APPLY_ON_LABELS] ?? raw;
  }
  return raw;
}

export function ChargeGrid(props: ChargeGridProps) {
  const {
    columns,
    rows,
    priced,
    editable,
    resizingKey,
    onColumnResizeStart,
    onOpenChargePicker,
    onSetField,
    onRemoveRow,
  } = props;
  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const pricedByKey = useMemo(() => new Map(priced.map((row) => [row.key, row])), [priced]);
  const tableWidth = useMemo(() => totalColumnWidth(visible, ROW_ACTION_PX), [visible]);

  const onGridKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (!editable) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      moveCellFocus(CHARGE_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
    }
  };

  return (
    <div className={styles.gridViewport}>
      <table className={styles.grid} style={{ width: scaledWidth(tableWidth) }}>
        <colgroup>
          {visible.map((column) => (
            <col key={column.key} style={{ width: scaledWidth(column.widthPx) }} />
          ))}
          <col style={{ width: scaledWidth(ROW_ACTION_PX) }} />
        </colgroup>
        <thead>
          <tr>
            {visible.map((column, columnIndex) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  styles.gridHeaderCell,
                  isFrozenColumn(columnIndex) && styles.gridHeaderFrozenCell,
                  resizingKey === column.key && styles.gridHeaderCellResizing,
                )}
              >
                {column.header}
                <span
                  className={styles.columnResizeHandle}
                  role="presentation"
                  title="Drag to resize the column"
                  onMouseDown={(event) => onColumnResizeStart(event, column.key)}
                />
              </th>
            ))}
            <th scope="col" aria-label="Row actions" className={styles.gridHeaderActionCell} />
          </tr>
        </thead>
        <tbody onKeyDown={onGridKeyDown}>
          {rows.map((row, rowIndex) => {
            const view: Record<string, unknown> = { ...row, ...(pricedByKey.get(row.key) ?? {}) };
            return (
              <tr
                key={row.key}
                className={rowIndex % 2 === 0 ? styles.rowOdd : styles.rowEven}
              >
                {visible.map((column, columnIndex) => {
                  const isFixed = row.method === "FIXED";
                  const cellEditable =
                    editable &&
                    // The charge-name cell writes nothing itself — it opens the
                    // picker, which snapshots the whole master row — so it is not
                    // gated on having a `write` target. Everything else stays
                    // read-only until a charge is picked: an empty row has no
                    // ledger to post to.
                    (column.kind === "chargeLookup"
                      ? true
                      : Boolean(column.write) &&
                        Boolean(row.chgId) &&
                        !(column.readOnlyWhenFixed && isFixed));

                  const value =
                    column.kind === "serial"
                      ? rowIndex + 1
                      : column.kind === "label"
                        ? labelFor(String(column.read ?? ""), view[String(column.read ?? "")])
                        : column.read
                          ? view[column.read]
                          : "";

                  return (
                    <td
                      key={column.key}
                      className={cx(isFrozenColumn(columnIndex) && styles.frozenCell)}
                    >
                      <GridCell
                        kind={column.kind}
                        value={value}
                        align={column.align}
                        precision={column.precision}
                        editable={cellEditable}
                        // A rate cell paints its method's unit at paint time
                        // only; the stored value stays a bare number.
                        suffix={column.write === "rate" ? CHARGE_RATE_SUFFIX[row.method] : undefined}
                        gridName={CHARGE_GRID_NAME}
                        rowKey={row.key}
                        fieldKey={String(column.write ?? column.key)}
                        columnIndex={columnIndex}
                        focusStop={column.focus}
                        placeholder={column.kind === "chargeLookup" ? "Pick a charge…" : undefined}
                        onOpenPicker={() => onOpenChargePicker(row.key)}
                        onCommit={(raw) => {
                          if (column.write) {
                            onSetField(row.key, column.write, raw);
                          }
                        }}
                      />
                    </td>
                  );
                })}
                <td className={styles.actionCell}>
                  <button
                    type="button"
                    className={styles.rowButton}
                    disabled={!editable}
                    title="Remove this charge"
                    aria-label={`Remove ${row.chgName || "charge"}`}
                    onClick={() => onRemoveRow(row.key)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td className={styles.emptyGrid} colSpan={visible.length + 1}>
                No additional charges.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
