"use client";

/**
 * The bills grid — `ui_tables` 32, "RECEIPT - BILLS".
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  ONE LIST, CREDITS FIRST, AND NEVER RE-SORTED.
 *
 *  `acc_bill_balance` holds both what the party OWES (DR) and what it HOLDS
 *  (CR), and rev 4 merged the two grids back into one. The credits come first,
 *  at the top where they cannot be scrolled past, because what the party
 *  already holds should be spent before asking them for money.
 *
 *  The bills arrive in the server's own `accounts.receipt_bill_sort` order and
 *  Auto-allocate walks them in list order. THAT ORDER IS WHAT KEEPS THE
 *  PREVIEW IDENTICAL TO THE POST, so column sorting on this grid would be a
 *  defect, not a feature.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * A credit row is tinted green the whole way across and chipped CREDIT /
 * ADVANCE / CR NOTE — never with its raw `billType`, because Deepan's credit is
 * `OPENING`, the same word as his nine DR bills. On a credit, Receive means
 * APPLY, and Disc / W/off / R/off do not open: a settlement discount cannot be
 * given on a credit note.
 *
 * A zero money cell renders BLANK. Forty rows of `0.00` bury the three figures
 * that matter.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import type { BillColumnKey, ResolvedReceiptColumn } from "../columns";
import { afterSettlement, netProfit } from "../domain/identity";
import { formatMoney } from "../domain/money";
import type { BillRow, CreditRow } from "../receipt.types";
import type { BillMoneyColumn } from "../state/draft";
import { Chip, creditChipLabel } from "./chip";
import styles from "../page.module.scss";

export type BillsGridProps = {
  columns: ResolvedReceiptColumn<BillColumnKey>[];
  bills: BillRow[];
  credits: CreditRow[];
  editable: boolean;
  /** The row the cursor is on — F7 acts on it. */
  currentRowId: string | null;
  onFocusRow: (billId: string) => void;
  onSetCell: (billId: string, column: BillMoneyColumn, value: number) => void;
  onSetNote: (billId: string, note: string) => void;
  onSetCreditApply: (billId: string, value: number) => void;
  /** F7 — everything that has already settled this bill. */
  onOpenHistory: (row: BillRow | CreditRow, isCredit: boolean) => void;
  /** A write-off over the threshold needs an approver. */
  approvalAbove: number;
  onPickApprover: (billId: string) => void;
  loading: boolean;
  /** What an empty grid means HERE — it is a different thing on a posted receipt. */
  emptyMessage: string;
  /** The column a width drag is live on, for the handle's own highlight. */
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  /** Right-click: "save column width" and "Admin settings". */
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

const ALIGN_CLASS: Record<string, string> = {
  left: "",
  right: styles.alignRight,
  center: styles.alignCenter,
};

/** Zero is blank; anything else is Indian-format money. */
function money(value: number): string {
  return value === 0 ? "" : formatMoney(value);
}

export function BillsGrid(props: BillsGridProps) {
  const {
    columns,
    bills,
    credits,
    editable,
    currentRowId,
    onFocusRow,
    onSetCell,
    onSetNote,
    onSetCreditApply,
    onOpenHistory,
    approvalAbove,
    onPickApprover,
    loading,
    emptyMessage,
    resizingKey,
    onColumnResizeStart,
    onContextMenu,
  } = props;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const tableWidth = useMemo(() => totalColumnWidth(visible), [visible]);

  const onCellKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    row: BillRow | CreditRow,
    isCredit: boolean,
  ) => {
    if (event.key === "F7") {
      event.preventDefault();
      onOpenHistory(row, isCredit);
    }
  };

  /** One credit row, rendered into whatever columns the layout shows. */
  const creditCell = (column: ResolvedReceiptColumn<BillColumnKey>, row: CreditRow) => {
    switch (column.key) {
      case "docDate":
        return <span className={styles.cellText}>{row.docDate}</span>;
      case "docRefno":
        return <span className={styles.cellText}>{row.docRefno}</span>;
      case "billType":
        return (
          <Chip
            value={creditChipLabel(row.billType, row.srcDocType)}
            tone="green"
            title={`Held by the party — ${row.billType}. Spend it before asking for money.`}
          />
        );
      case "billAmount":
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`}>{money(row.billAmount)}</span>
        );
      case "pendingAmount":
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`}>
            {money(row.pendingAmount)}
          </span>
        );
      case "receive":
        return (
          <input
            className={`${styles.cellInput} ${styles.alignRight} ${
              row.applyTyped ? styles.cellTyped : ""
            }`}
            type="number"
            min={0}
            step="0.01"
            value={row.apply === 0 ? "" : row.apply}
            disabled={!editable}
            title="Apply — how much of this credit this receipt spends."
            onFocus={() => onFocusRow(row.billId)}
            onChange={(event) => onSetCreditApply(row.billId, Number(event.target.value))}
            onKeyDown={(event) => onCellKeyDown(event, row, true)}
          />
        );
      case "after":
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`}>
            {money(row.pendingAmount - row.apply)}
          </span>
        );
      default:
        // Disc, W/off, R/off, PDC held, TCS, Profit — a credit has none of
        // them, and a disabled input would invite the operator to try.
        return null;
    }
  };

  const billCell = (column: ResolvedReceiptColumn<BillColumnKey>, row: BillRow) => {
    const align = ALIGN_CLASS[column.align] ?? "";
    const moneyCell = (value: number) => (
      <span className={`${styles.cellText} ${align}`}>{money(value)}</span>
    );

    switch (column.key) {
      case "docDate":
        return <span className={styles.cellText}>{row.docDate}</span>;
      case "docRefno":
        return <span className={styles.cellText}>{row.docRefno}</span>;
      case "usrRefno":
        return <span className={styles.cellText}>{row.usrRefno}</span>;
      case "billType":
        return <Chip value={row.billType} />;
      case "dueDate":
        // Null for a bill raised with no terms — blank, not "invalid date".
        return <span className={styles.cellText}>{row.dueDate ?? ""}</span>;
      case "daysOverdue":
        return (
          <span
            className={`${styles.cellText} ${align} ${
              row.daysOverdue > 0 ? styles.factOverdue : styles.cellMuted
            }`}
          >
            {row.daysOverdue > 0 ? row.daysOverdue : ""}
          </span>
        );
      case "billAmount":
        // Always shown, even though Pending is the working figure: "7,490
        // pending" means one thing on 7,500 and another on 75,000.
        return moneyCell(row.billAmount);
      case "paid":
        return moneyCell(row.billAmount - row.pendingAmount);
      case "pendingAmount":
        return moneyCell(row.pendingAmount);
      case "pdcHeld":
        // Without it, a bill settled entirely by a cheque maturing next week
        // looks exactly like a bill nobody has paid — and gets collected twice.
        return (
          <span className={`${styles.cellText} ${align}`} title={
            row.pdcHeld > 0
              ? "Promised by a post-dated cheque that has not matured. The bill does not settle until it does."
              : undefined
          }>
            {money(row.pdcHeld)}
          </span>
        );
      case "tcsPending":
        // Read-only: TCS is collected, not negotiated.
        return moneyCell(row.tcsPending);
      case "receive":
      case "discount":
      case "writeOff":
      case "roundOff": {
        // Narrowed once here: `column.key` is the wider layout key, and the
        // four money cells are the only ones the reducer will write.
        const cellKey: BillMoneyColumn = column.key;
        const value = row[cellKey];
        const needsApprover =
          column.key === "writeOff" && value > approvalAbove && !row.writeoffApprovedBy;
        return (
          <input
            className={`${styles.cellInput} ${styles.alignRight} ${
              column.key === "receive" && row.receiveTyped ? styles.cellTyped : ""
            } ${needsApprover ? styles.inputInvalid : ""}`}
            type="number"
            min={0}
            step="0.01"
            value={value === 0 ? "" : value}
            disabled={!editable}
            title={
              needsApprover
                ? "Above what may be written off unapproved — name who authorised it."
                : undefined
            }
            onFocus={() => onFocusRow(row.billId)}
            onChange={(event) => onSetCell(row.billId, cellKey, Number(event.target.value))}
            onBlur={() => {
              if (needsApprover) {
                onPickApprover(row.billId);
              }
            }}
            onKeyDown={(event) => onCellKeyDown(event, row, false)}
          />
        );
      }
      case "after":
        return moneyCell(afterSettlement(row));
      case "billProfit": {
        // `null` is NOT zero: an OPENING bill was typed, not sold, and a 0.00
        // here reads as "sold at cost".
        const profit = row.billProfit;
        return (
          <span className={`${styles.cellText} ${align}`}>
            {profit === null ? "" : formatMoney(profit)}
          </span>
        );
      }
      case "netProfit": {
        const net = netProfit(row);
        return (
          <span className={`${styles.cellText} ${align}`}>
            {net === null ? "" : formatMoney(net)}
          </span>
        );
      }
      case "note":
        return (
          <input
            className={styles.cellInput}
            value={row.note}
            disabled={!editable}
            // A scratch column: there is no per-bill narration on
            // `acc_bill_adjustment`, so this is never sent anywhere.
            title="A scratch note for this session. It is not saved with the receipt."
            onFocus={() => onFocusRow(row.billId)}
            onChange={(event) => onSetNote(row.billId, event.target.value)}
            onKeyDown={(event) => onCellKeyDown(event, row, false)}
          />
        );
      default:
        return null;
    }
  };

  const rowCount = bills.length + credits.length;

  return (
    <div className={styles.gridViewport} onContextMenu={onContextMenu}>
      {/*
        The configured widths are the Qt fractions, which add up to far less
        than a browser's width. `minWidth: 100%` lets `table-layout: fixed`
        hand the slack back to the columns in proportion, so the grid fills the
        screen instead of huddling on the left — and it still scrolls sideways
        when the layout is wider than the viewport.
      */}
      <table
        className={styles.grid}
        style={{ width: scaledWidth(tableWidth), minWidth: "100%" }}
      >
        <colgroup>
          {visible.map((column) => (
            <col key={column.key} style={{ width: scaledWidth(column.widthPx) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {visible.map((column) => (
              <th
                key={column.key}
                scope="col"
                title={`${column.header} — drag the right edge to widen, right-click to save or configure`}
                className={`${styles.gridHeaderCell} ${ALIGN_CLASS[column.align] ?? ""} ${
                  resizingKey === column.key ? styles.gridHeaderCellResizing : ""
                }`}
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
          </tr>
        </thead>
        <tbody>
          {rowCount === 0 ? (
            <tr>
              <td colSpan={visible.length}>
                <p className={styles.gridEmpty}>
                  {loading ? "Reading this customer's open items…" : emptyMessage}
                </p>
              </td>
            </tr>
          ) : null}

          {/* Credits first: what the party already holds, above the ask. */}
          {credits.map((row, index) => (
            <tr
              key={row.billId}
              className={`${styles.rowCredit} ${
                currentRowId === row.billId ? styles.rowSelected : ""
              }`}
              data-row-index={index}
            >
              {visible.map((column) => (
                <td key={column.key}>{creditCell(column, row)}</td>
              ))}
            </tr>
          ))}

          {bills.map((row, index) => (
            <tr
              key={row.billId}
              className={`${index % 2 === 0 ? styles.rowOdd : styles.rowEven} ${
                currentRowId === row.billId ? styles.rowSelected : ""
              }`}
            >
              {visible.map((column) => (
                <td key={column.key}>{billCell(column, row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
