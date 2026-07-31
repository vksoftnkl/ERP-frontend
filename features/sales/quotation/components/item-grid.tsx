"use client";

/**
 * The item grid — ui table 18 ("Quotation", 89 configured columns).
 *
 * Two structural decisions worth stating:
 *
 *  - **There is no trailing blank row.** `draft.lines` holds only real lines and
 *    the grid renders an explicit "Add row" affordance instead. That deletes the
 *    `rowCount() - 1` off-by-one from the payload builder, the price-level apply,
 *    the freight apply, the validation and the totals loop at once.
 *  - **Nothing derived is written back.** A cell reads the merged view of
 *    `{ draft line, engine output }`; the three discount amount columns read the
 *    engine's computed amount and write the operator's keyed one.
 */
import { useMemo, type KeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import type { PricedLine } from "@/domain/pricing";
import {
  PRICE_LEVEL_OPTIONS,
  type ItemColumnMeaning,
} from "../quotation.constants";
import type { DraftLine, ItemUnitOption } from "../quotation.types";
import { totalColumnWidth, type ResolvedItemColumn } from "../quotation.utils";
import { GridCell } from "./grid-cell";
import { focusCell, focusLastCellAfterRender, moveCellFocus } from "./grid-focus";
import styles from "../page.module.scss";

export const ITEM_GRID_NAME = "items";

/** The sticky remove-row column. */
const ROW_ACTION_PX = 30;

export type ItemGridProps = {
  columns: ResolvedItemColumn[];
  lines: DraftLine[];
  priced: PricedLine[];
  editable: boolean;
  canEditPrice: boolean;
  /** `${rowKey}:${fieldKey}` of the cells validation has flagged. */
  invalidCells: Record<string, true>;
  activeRowKey: string | null;
  unitOptionsFor: (itemId: string) => ItemUnitOption[];
  onActiveRowChange: (rowKey: string) => void;
  onSetField: (rowKey: string, field: keyof DraftLine, raw: string) => void;
  onToggleField: (rowKey: string, field: keyof DraftLine, checked: boolean) => void;
  onOpenItemPicker: (rowKey: string) => void;
  onCommitBarcode: (rowKey: string, barcode: string) => void;
  onSetUnit: (rowKey: string, itemUnitId: string) => void;
  onSetPriceLevel: (rowKey: string, priceLevel: number) => void;
  onAddLine: () => void;
  onInsertLine: (rowKey: string) => void;
  onRemoveLine: (rowKey: string) => void;
  onSwitchUnit: (rowKey: string) => void;
  onPriceLevelShortcut: (priceLevel: number) => void;
};

/**
 * Whether this column's editor is live, given the screen-wide gate and the
 * column's own condition.
 */
function isColumnEditable(
  column: ItemColumnMeaning,
  line: DraftLine,
  editable: boolean,
  canEditPrice: boolean,
): boolean {
  if (!editable) {
    return false;
  }
  // A lookup cell writes nothing itself — it opens the picker, which dispatches a
  // whole priced line — so it must not be gated on having a `write` target.
  if (column.kind === "itemLookup") {
    return true;
  }
  if (!column.write) {
    return false;
  }
  switch (column.editableWhen) {
    case "batchConfig":
      return line.batchConfig > 0;
    case "hasFreight":
      return line.hasFreight;
    case "editPrice":
      return canEditPrice;
    default:
      return true;
  }
}

export function ItemGrid(props: ItemGridProps) {
  const {
    columns,
    lines,
    priced,
    editable,
    canEditPrice,
    invalidCells,
    activeRowKey,
    unitOptionsFor,
    onActiveRowChange,
    onSetField,
    onToggleField,
    onOpenItemPicker,
    onCommitBarcode,
    onSetUnit,
    onSetPriceLevel,
    onAddLine,
    onInsertLine,
    onRemoveLine,
    onSwitchUnit,
    onPriceLevelShortcut,
  } = props;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  // `table-layout: fixed` needs the table's own width stated, or the `<col>`
  // widths are only a hint and the browser re-fits them to the container.
  const tableWidth = useMemo(() => totalColumnWidth(visible, ROW_ACTION_PX), [visible]);

  /**
   * Every shortcut is scoped here rather than to the window, which is what makes
   * "disabled in browse mode" one gate instead of a guard inside each handler.
   * (In Qt a `QShortcut` bypasses the grid's read-only branch, so the price-level
   * hotkey needed its own check.)
   */
  const onGridKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (!editable) {
      return;
    }
    const rowKey = (event.target as HTMLElement).getAttribute("data-quotation-row");

    if (event.key === "F4" && rowKey) {
      event.preventDefault();
      onSwitchUnit(rowKey);
      return;
    }
    if (event.ctrlKey && (event.key === "+" || event.key === "=") && rowKey) {
      event.preventDefault();
      onInsertLine(rowKey);
      return;
    }
    if (event.ctrlKey && event.key === "-" && rowKey) {
      event.preventDefault();
      onRemoveLine(rowKey);
      return;
    }
    if (event.ctrlKey && /^[1-4]$/.test(event.key)) {
      event.preventDefault();
      onPriceLevelShortcut(Number.parseInt(event.key, 10));
      return;
    }
    if (event.key === "Enter") {
      // The cell has already committed its buffer on Enter; move on.
      event.preventDefault();
      moveCellFocus(ITEM_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
    }
  };

  return (
    <div className={styles.gridViewport} data-erp-table-viewport="true">
      <table className={styles.grid} style={{ width: `${tableWidth}px` }}>
        <colgroup>
          {visible.map((column) => (
            <col key={column.key} style={{ width: `${column.widthPx}px` }} />
          ))}
          <col style={{ width: `${ROW_ACTION_PX}px` }} />
        </colgroup>
        <thead>
          <tr>
            {visible.map((column) => (
              <th key={column.key} scope="col" title={column.token}>
                {column.header}
              </th>
            ))}
            <th scope="col" aria-label="Row actions" />
          </tr>
        </thead>
        <tbody onKeyDown={onGridKeyDown}>
          {lines.map((line, rowIndex) => {
            // The engine spreads the whole draft line into its output, so one
            // merged view answers both a configured column that reads a stored
            // field and one that reads a derived figure.
            const view: Record<string, unknown> = { ...line, ...(priced[rowIndex] ?? {}) };
            const isActive = line.key === activeRowKey;

            return (
              <tr
                key={line.key}
                className={cx(
                  rowIndex % 2 === 0 ? styles.rowOdd : styles.rowEven,
                  isActive && styles.rowActive,
                )}
                onFocusCapture={() => onActiveRowChange(line.key)}
              >
                {visible.map((column, columnIndex) => {
                  const cellEditable = isColumnEditable(column, line, editable, canEditPrice);
                  const invalid = Boolean(
                    column.write && invalidCells[`${line.key}:${String(column.write)}`],
                  );
                  const value =
                    column.kind === "serial" ? rowIndex + 1 : column.read ? view[column.read] : "";

                  const options =
                    column.kind === "unit"
                      ? unitOptionsFor(line.itemId).map((unit) => ({
                          value: unit.itemUnitId,
                          label: unit.unitName,
                        }))
                      : column.kind === "priceLevel"
                        ? PRICE_LEVEL_OPTIONS.map((option) => ({ ...option }))
                        : undefined;

                  // The Uom cell holds the conversion id but shows the unit
                  // name; a fresh line has a name the options list may not carry
                  // yet, so it is added rather than rendering an empty select.
                  if (column.kind === "unit" && options && line.itemUnitId) {
                    if (!options.some((option) => option.value === line.itemUnitId)) {
                      options.unshift({ value: line.itemUnitId, label: line.unitName || "—" });
                    }
                  }

                  return (
                    <td
                      key={column.key}
                      className={cx(columnIndex === 0 && styles.serialCell)}
                    >
                      <GridCell
                        kind={column.kind}
                        value={
                          column.kind === "unit"
                            ? line.itemUnitId
                            : column.kind === "priceLevel"
                              ? String(line.priceLevel)
                              : value
                        }
                        align={column.align}
                        precision={column.precision}
                        editable={cellEditable}
                        invalid={invalid}
                        options={options}
                        gridName={ITEM_GRID_NAME}
                        rowKey={line.key}
                        fieldKey={String(column.write ?? column.key)}
                        columnIndex={columnIndex}
                        onOpenPicker={() => onOpenItemPicker(line.key)}
                        onToggle={(checked) => {
                          if (column.write) {
                            onToggleField(line.key, column.write, checked);
                          }
                        }}
                        onCommit={(raw) => {
                          if (!column.write) {
                            return;
                          }
                          if (column.kind === "unit") {
                            onSetUnit(line.key, raw);
                            return;
                          }
                          if (column.kind === "priceLevel") {
                            onSetPriceLevel(line.key, Number.parseInt(raw, 10) || 1);
                            return;
                          }
                          if (column.write === "barcode") {
                            onSetField(line.key, "barcode", raw);
                            return;
                          }
                          onSetField(line.key, column.write, raw);
                        }}
                        onKeyDown={(event) => {
                          if (column.write !== "barcode") {
                            return;
                          }
                          const input = event.target as HTMLInputElement;
                          if (event.key === "Enter") {
                            event.preventDefault();
                            event.stopPropagation();
                            const scanned = input.value.trim();
                            if (scanned) {
                              onCommitBarcode(line.key, scanned);
                            }
                            // A scanner runs row after row, so a commit lands on
                            // the next row's Barcode cell rather than the next
                            // column of this one.
                            const next = lines[rowIndex + 1];
                            if (next) {
                              focusCell(ITEM_GRID_NAME, next.key, "barcode");
                            } else {
                              onAddLine();
                              focusLastCellAfterRender(ITEM_GRID_NAME, "barcode");
                            }
                            return;
                          }
                          if (event.key === "ArrowDown") {
                            // Bail out of the scanner into the item picker.
                            event.preventDefault();
                            event.stopPropagation();
                            onOpenItemPicker(line.key);
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
                    title="Remove this line (Ctrl+-)"
                    aria-label={`Remove ${line.itemName || "line"}`}
                    onClick={() => onRemoveLine(line.key)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
          {lines.length === 0 ? (
            <tr>
              <td className={styles.emptyGrid} colSpan={visible.length + 1}>
                No items yet. Use <strong>Add row</strong> and pick an item in the Description cell.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
