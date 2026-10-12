"use client";

/**
 * WHAT WAS SPENT — the expense lines: `ui_tables` 51 "EXPENSE VOUCHER - LINES"
 * and Qt d97cdd4's `ExpenseLineDelegate`.
 *
 *   #  Reason  Expense ledger  Description  HSN/SAC  Amount|Taxable  GST  ITC  Tax  Total
 *
 * Reason and Expense ledger have no editor: they are popup cells, as the
 * quotation's item cell. A typed character opens the picker (grid 155 / 156)
 * with that character as the search, and so do F2 and a double-click. Enter
 * on an empty Reason or Expense ledger opens its list (Qt 5e25760 — Esc backs
 * out of the optional reason; Tab steps past it); on a filled one it moves on.
 * Delete on a reason clears it. A reason fills its ledger, and a ledger its
 * GST rate and HSN/SAC.
 *
 * HSN/SAC, GST and ITC are there only with a GST bill. Tax and Total are the
 * server's (`domain/view.ts`). A cell that will not open says why in its
 * tooltip — never a silent no.
 */
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { columnShare, columnsWidthPx, type ExpenseColumn, type LineColumnKey } from "../columns";
import type { ExpenseLineDraft, ExpenseRateOption } from "../expense.types";
import { isBlankLine } from "../domain/draft";
import { tidyAmountText } from "../domain/money";
import { reasonLabel } from "../domain/pickers";
import type { ExpenseView } from "../domain/view";
import { cellAttrs, lineKeyOf, moveCell, typedCharacter } from "./grid-keys";
import styles from "../expense.module.scss";

const GRID = "lines" as const;

const READ_ONLY = "This voucher is read-only.";
const SERVER_FIGURE = "Worked out by the server from the amount and the GST rate.";

const ALIGN_CLASS: Record<string, string | undefined> = {
  left: undefined,
  right: styles.alignRight,
  center: styles.alignCenter,
};

export type PopupColumn = "reason" | "ledger";

export type LinesGridProps = {
  columns: ExpenseColumn<LineColumnKey>[];
  lines: readonly ExpenseLineDraft[];
  cells: ExpenseView["lineCells"];
  linesFresh: boolean;
  gstBill: boolean;
  editable: boolean;
  reasonNames: ReadonlyMap<string, string>;
  rates: readonly ExpenseRateOption[];
  ratesFailed: boolean;
  activeKey: string | null;
  onActivate: (key: string) => void;
  /** Open the reason / ledger picker on this line, searching for `query`. */
  onOpenPicker: (key: string, column: PopupColumn, query: string) => void;
  onClearReason: (key: string) => void;
  onChange: (key: string, patch: Partial<ExpenseLineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (key: string) => void;
  /** The column a width drag is live on, for its handle's own highlight. */
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  /** Right-click: "save column width" and "Admin settings" (ui_table 51). */
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function LinesGrid(props: LinesGridProps) {
  const {
    columns,
    lines,
    cells,
    linesFresh,
    gstBill,
    editable,
    reasonNames,
    rates,
    ratesFailed,
    activeKey,
    onActivate,
    onOpenPicker,
    onClearReason,
    onChange,
    onAddLine,
    onRemoveLine,
    resizingKey,
    onColumnResizeStart,
    onContextMenu,
  } = props;

  /** Enter, +/− and F2 — every cell. Returns whether the key was taken. */
  const commonKeys = (event: KeyboardEvent<HTMLElement>, line: ExpenseLineDraft, freeText: boolean): boolean => {
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      moveCell(GRID, event.currentTarget, event.shiftKey ? -1 : 1);
      return true;
    }
    if (event.key === "F2") {
      // The cell is its own editor already; F2 here is never the screen's New.
      event.preventDefault();
      return true;
    }
    const lineKey = editable ? lineKeyOf(event, freeText) : null;
    if (lineKey) {
      event.preventDefault();
      if (lineKey === "add") onAddLine();
      else onRemoveLine(line.key);
      return true;
    }
    return false;
  };

  const popupKeys = (event: KeyboardEvent<HTMLInputElement>, line: ExpenseLineDraft, column: PopupColumn) => {
    if (!editable) {
      commonKeys(event, line, false);
      return;
    }
    const filled = column === "reason" ? Boolean(line.reasonId) : Boolean(line.ledgerId);
    const plainEnter = event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (event.key === "F2" || (plainEnter && !filled)) {
      event.preventDefault();
      onOpenPicker(line.key, column, "");
      return;
    }
    if (column === "reason" && event.key === "Delete" && filled) {
      event.preventDefault();
      onClearReason(line.key);
      return;
    }
    if (commonKeys(event, line, false)) {
      return;
    }
    const typed = typedCharacter(event);
    if (typed !== null) {
      event.preventDefault();
      onOpenPicker(line.key, column, typed.trim());
    }
  };

  const renderCell = (column: ExpenseColumn<LineColumnKey>, line: ExpenseLineDraft, index: number) => {
    const blank = isBlankLine(line);
    const cell = cells[index] ?? { tax: "", total: "" };
    const attrs = (field: string) => cellAttrs(GRID, line.key, field);
    const lockTitle = editable ? undefined : READ_ONLY;

    switch (column.key) {
      case "rowNo":
        return <span className={styles.cellText}>{blank ? "" : index + 1}</span>;

      case "reason":
      case "ledger": {
        const text = column.key === "reason" ? reasonLabel(line, reasonNames) : line.ledgerName;
        return (
          <input
            {...attrs(column.key)}
            className={cx(styles.cellInput, styles.cellPopup)}
            value={text}
            readOnly
            disabled={!editable}
            title={lockTitle ?? (text || "Type to pick — or F2")}
            aria-label={`Line ${index + 1} ${column.key === "reason" ? "reason" : "expense ledger"}`}
            onKeyDown={(event) => popupKeys(event, line, column.key as PopupColumn)}
            onDoubleClick={() => editable && onOpenPicker(line.key, column.key as PopupColumn, "")}
          />
        );
      }

      case "description":
        return (
          <input
            {...attrs("description")}
            className={styles.cellInput}
            value={line.description}
            maxLength={250}
            disabled={!editable}
            title={lockTitle ?? (line.description || undefined)}
            aria-label={`Line ${index + 1} description`}
            onKeyDown={(event) => commonKeys(event, line, true)}
            onChange={(event) => onChange(line.key, { description: event.target.value })}
          />
        );

      case "hsn":
        return (
          <input
            {...attrs("hsn")}
            className={styles.cellInput}
            value={line.hsn}
            maxLength={8}
            inputMode="numeric"
            data-uppercase="off"
            autoComplete="off"
            disabled={!editable}
            title={lockTitle}
            aria-label={`Line ${index + 1} HSN/SAC`}
            onKeyDown={(event) => commonKeys(event, line, false)}
            onChange={(event) => onChange(line.key, { hsn: event.target.value.replace(/\D/g, "").slice(0, 8) })}
          />
        );

      case "amount":
        return (
          <input
            {...attrs("amount")}
            className={cx(styles.cellInput, styles.cellAmount)}
            value={line.amount}
            inputMode="decimal"
            data-uppercase="off"
            autoComplete="off"
            disabled={!editable}
            title={lockTitle}
            aria-label={`Line ${index + 1} ${gstBill ? "taxable value" : "amount"}`}
            onKeyDown={(event) => commonKeys(event, line, false)}
            onChange={(event) => onChange(line.key, { amount: event.target.value })}
            onBlur={(event) => {
              const tidy = tidyAmountText(event.target.value);
              if (tidy !== line.amount) {
                onChange(line.key, { amount: tidy });
              }
            }}
          />
        );

      case "gst": {
        const known = rates.some((rate) => rate.taxId === line.taxId);
        const loading = rates.length === 0;
        const title = !editable
          ? READ_ONLY
          : loading
            ? ratesFailed
              ? "The GST rates could not be read — reload to try again."
              : "The GST rates are still loading — try again in a moment."
            : undefined;
        return (
          <select
            {...attrs("gst")}
            className={styles.cellSelect}
            value={line.taxId}
            disabled={!editable || (loading && !line.taxId)}
            title={title}
            aria-label={`Line ${index + 1} GST rate`}
            onKeyDown={(event) => commonKeys(event, line, false)}
            onChange={(event) => {
              const rate = rates.find((candidate) => candidate.taxId === event.target.value);
              onChange(line.key, { taxId: rate?.taxId ?? "", taxName: rate?.name ?? "" });
            }}
          >
            {/* Blank, as Qt's cell with no rate; picking it clears the rate. */}
            <option value="" />
            {rates.map((rate) => (
              <option key={rate.taxId} value={rate.taxId}>
                {rate.name}
              </option>
            ))}
            {line.taxId && !known ? <option value={line.taxId}>{line.taxName || "(saved rate)"}</option> : null}
          </select>
        );
      }

      case "itc":
        // A blank row shows no ITC, as Qt's (it is a line's, once there is one).
        if (blank) {
          return <span className={styles.cellText} />;
        }
        return (
          <select
            {...attrs("itc")}
            className={cx(styles.cellSelect, styles.alignCenter, line.itc ? styles.itcYes : styles.itcNo)}
            value={line.itc ? "YES" : "NO"}
            disabled={!editable}
            title={lockTitle ?? "YES books the tax to Input GST; NO adds it to the expense."}
            aria-label={`Line ${index + 1} claim ITC`}
            onKeyDown={(event) => commonKeys(event, line, false)}
            onChange={(event) => onChange(line.key, { itc: event.target.value === "YES" })}
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        );

      case "tax":
        return (
          <span className={cx(styles.cellText, !linesFresh && styles.cellPending)} title={SERVER_FIGURE}>
            {cell.tax}
          </span>
        );

      case "total":
        return (
          <span
            className={cx(styles.cellText, gstBill && !linesFresh && styles.cellPending)}
            title={SERVER_FIGURE}
          >
            {cell.total}
          </span>
        );

      default:
        return null;
    }
  };

  const total = columnsWidthPx(columns);

  return (
    <div className={styles.gridShell} onContextMenu={onContextMenu}>
      <table
        className={styles.grid}
        aria-label="What was spent"
      >
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: columnShare(column.widthPx, total) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              // Centred, as Qt's NexTable heads them; the figures' heads sit over their figures.
              <th
                key={column.key}
                className={cx(
                  column.kind === "money" ? styles.alignRight : styles.alignCenter,
                  resizingKey === column.key && styles.headResizing,
                )}
                title={`${column.header} — drag the right edge to widen, right-click to save or configure`}
              >
                {column.header}
                <span
                  className={styles.resizeHandle}
                  role="presentation"
                  onMouseDown={(event) => onColumnResizeStart(event, column.key)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr
              key={line.key}
              className={cx(line.key === activeKey && styles.rowActive)}
              onFocus={() => onActivate(line.key)}
              onMouseDown={() => onActivate(line.key)}
            >
              {columns.map((column) => (
                <td key={column.key} className={ALIGN_CLASS[column.align]}>
                  {renderCell(column, line, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
