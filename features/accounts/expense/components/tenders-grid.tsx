"use client";

/**
 * HOW IT WAS PAID — the tenders: `ui_tables` 52 "EXPENSE VOUCHER - TENDERS"
 * and Qt d97cdd4's `ExpenseTenderDelegate`: Tender · Account · Ref · Amount.
 * Cash, a bank transfer or UPI; never a cheque (a cheque is a bill-wise
 * Payment, which keeps the issued-cheque register).
 *
 * The grid ends in a blank row; picking a tender on it takes what is still
 * unpaid. The first tender of a new voucher takes the balance until its amount
 * is typed. Account is where the money really comes from, as the server's
 * check says it — "drawer · this session", "safe · <name>", or the tender's
 * own ledger — and the tender master's ledger until the check has answered.
 */
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { columnShare, columnsWidthPx, type ExpenseColumn, type TenderColumnKey } from "../columns";
import type { ExpenseTenderDraft, ExpenseTenderOption } from "../expense.types";
import { tidyAmountText } from "../domain/money";
import { tenderChoices } from "../domain/pickers";
import { cellAttrs, lineKeyOf, moveCell } from "./grid-keys";
import styles from "../expense.module.scss";

const GRID = "tenders" as const;
const READ_ONLY = "This voucher is read-only.";

const ALIGN_CLASS: Record<string, string | undefined> = {
  left: undefined,
  right: styles.alignRight,
  center: styles.alignCenter,
};

export type TendersGridProps = {
  columns: ExpenseColumn<TenderColumnKey>[];
  rows: readonly ExpenseTenderDraft[];
  accounts: readonly string[];
  editable: boolean;
  options: readonly ExpenseTenderOption[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onPickTender: (key: string, tenderId: string) => void;
  onChange: (key: string, patch: Partial<ExpenseTenderDraft>) => void;
  onAddTender: () => void;
  onRemoveTender: (key: string) => void;
  /** The column a width drag is live on, for its handle's own highlight. */
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  /** Right-click: "save column width" and "Admin settings" (ui_table 52). */
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function TendersGrid(props: TendersGridProps) {
  const {
    columns,
    rows,
    accounts,
    editable,
    options,
    activeKey,
    onActivate,
    onPickTender,
    onChange,
    onAddTender,
    onRemoveTender,
    resizingKey,
    onColumnResizeStart,
    onContextMenu,
  } = props;

  const keys = (event: KeyboardEvent<HTMLElement>, row: ExpenseTenderDraft, freeText: boolean) => {
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      moveCell(GRID, event.currentTarget, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      return;
    }
    const lineKey = editable ? lineKeyOf(event, freeText) : null;
    if (lineKey) {
      event.preventDefault();
      if (lineKey === "add") onAddTender();
      else onRemoveTender(row.key);
    }
  };

  const renderCell = (column: ExpenseColumn<TenderColumnKey>, row: ExpenseTenderDraft, index: number) => {
    const attrs = (field: string) => cellAttrs(GRID, row.key, field);
    const lockTitle = editable ? undefined : READ_ONLY;
    switch (column.key) {
      case "tender": {
        const choices = tenderChoices(options, row);
        const loading = options.length === 0 && !row.tenderId;
        return (
          <select
            {...attrs("tender")}
            className={styles.cellSelect}
            value={row.tenderId}
            disabled={!editable || loading}
            title={lockTitle ?? (loading ? "The tenders are still loading — try again in a moment." : undefined)}
            aria-label={`Tender ${index + 1}`}
            onKeyDown={(event) => keys(event, row, false)}
            onChange={(event) => onPickTender(row.key, event.target.value)}
          >
            {row.tenderId ? null : <option value="" />}
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        );
      }
      case "account":
        return (
          <span
            className={styles.cellText}
            title={
              accounts[index]
                ? accounts[index]
                : "Where the money comes from follows the tender and the till — the server's answer."
            }
          >
            {accounts[index] ?? ""}
          </span>
        );
      case "ref":
        return (
          <input
            {...attrs("ref")}
            className={styles.cellInput}
            value={row.refNo}
            maxLength={100}
            data-uppercase="off"
            autoComplete="off"
            disabled={!editable}
            title={lockTitle}
            aria-label={`Tender ${index + 1} reference`}
            onKeyDown={(event) => keys(event, row, true)}
            onChange={(event) => onChange(row.key, { refNo: event.target.value })}
          />
        );
      case "amount":
        return (
          <input
            {...attrs("amount")}
            className={cx(styles.cellInput, styles.cellAmount, row.autoAmount && styles.cellAuto)}
            value={row.amount}
            inputMode="decimal"
            data-uppercase="off"
            autoComplete="off"
            disabled={!editable}
            title={lockTitle ?? (row.autoAmount ? "Takes the balance until you type an amount." : undefined)}
            aria-label={`Tender ${index + 1} amount`}
            onKeyDown={(event) => keys(event, row, false)}
            // Typed: it no longer follows the balance.
            onChange={(event) => onChange(row.key, { amount: event.target.value, autoAmount: false })}
            onBlur={(event) => {
              const tidy = tidyAmountText(event.target.value);
              if (tidy !== row.amount) {
                onChange(row.key, { amount: tidy, autoAmount: false });
              }
            }}
          />
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
        aria-label="How it was paid"
      >
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={{ width: columnShare(column.widthPx, total) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              // Qt's NexTable heads every column centred.
              <th
                key={column.key}
                className={cx(styles.alignCenter, resizingKey === column.key && styles.headResizing)}
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
          {rows.map((row, index) => (
            <tr
              key={row.key}
              className={cx(row.key === activeKey && styles.rowActive)}
              onFocus={() => onActivate(row.key)}
              onMouseDown={() => onActivate(row.key)}
            >
              {columns.map((column) => (
                <td key={column.key} className={ALIGN_CLASS[column.align]}>
                  {renderCell(column, row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
