"use client";

/**
 * The bills grid — `ui_tables` 42, "PAYMENT - BILLS".
 *
 * The receipt's grid with the side flipped. ONE list, HELD ITEMS FIRST, never
 * re-sorted: what the party holds of ours (an advance we paid, a debit note,
 * an opening debit) sits on top, tinted, because it should be spent before
 * money is; then the bills we OWE, in the server's own order — the order it
 * pours, which is what keeps the preview identical to the post.
 *
 * A held row is chipped by what it IS (ADVANCE · DR NOTE · DEBIT), never by its
 * raw type: an opening debit and an opening bill are both `OPENING`. On it,
 * Pay means APPLY, and Disc recd / W/back / R/off do not open.
 *
 * After shows the bill closing: the TDS (or a typed write-back) that settles
 * it without being money lands on it too, and the Note cell says how much.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import type { ResolvedReceiptColumn } from "@/features/accounts/receipt/columns";
import { afterSettlement } from "@/features/accounts/receipt/domain/identity";
import { formatMoney, toPaise, toRupees } from "@/features/accounts/receipt/domain/money";
import { Chip } from "@/features/accounts/receipt/components/chip";
import styles from "@/features/accounts/receipt/page.module.scss";
import type { PaymentBillColumnKey } from "../columns";
import type { PaymentBillColumn } from "../domain/bill-cells";
import { debitChipFor } from "../domain/roles";
import type { BillRow, CreditRow } from "../payment.types";

export type PaymentBillsGridProps = {
  columns: ResolvedReceiptColumn<PaymentBillColumnKey>[];
  bills: BillRow[];
  held: CreditRow[];
  /** Per bill id, in paise: the settling deductions that land on it. */
  deductionShares: ReadonlyMap<string, number>;
  editable: boolean;
  currentRowId: string | null;
  onFocusRow: (billId: string) => void;
  onSetCell: (billId: string, column: PaymentBillColumn, value: number) => void;
  onSetNote: (billId: string, note: string) => void;
  onSetHeldApply: (billId: string, value: number) => void;
  onOpenHistory: (row: BillRow | CreditRow, isHeld: boolean) => void;
  loading: boolean;
  emptyMessage: string;
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

const ALIGN_CLASS: Record<string, string> = {
  left: "",
  right: styles.alignRight,
  center: styles.alignCenter,
};

/** Zero is blank: forty rows of 0.00 bury the three figures that matter. */
function money(value: number): string {
  return value === 0 ? "" : formatMoney(value);
}

/** The grid's money columns → the bill field each one writes. */
const CELL_FIELD: Partial<Record<PaymentBillColumnKey, PaymentBillColumn>> = {
  pay: "receive",
  discount: "discount",
  writeBack: "writeOff",
  roundOff: "roundOff",
};

export function PaymentBillsGrid(props: PaymentBillsGridProps) {
  const {
    columns,
    bills,
    held,
    deductionShares,
    editable,
    currentRowId,
    onFocusRow,
    onSetCell,
    onSetNote,
    onSetHeldApply,
    onOpenHistory,
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
    isHeld: boolean,
  ) => {
    if (event.key === "F7") {
      event.preventDefault();
      onOpenHistory(row, isHeld);
    }
  };

  const heldCell = (column: ResolvedReceiptColumn<PaymentBillColumnKey>, row: CreditRow) => {
    switch (column.key) {
      case "docDate":
        return <span className={styles.cellText}>{row.docDate}</span>;
      case "docRefno":
        return <span className={styles.cellText}>{row.docRefno}</span>;
      case "billType":
        return (
          <Chip
            value={debitChipFor(row.billType)}
            tone="green"
            title={`Held — a ${row.billType} of ours the party holds. Spend it before paying money.`}
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
      case "pay":
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
            title="Apply — how much of this held item this payment spends. Typing here spends it; it does not pay it."
            onFocus={() => onFocusRow(row.billId)}
            onChange={(event) => onSetHeldApply(row.billId, Number(event.target.value))}
            onKeyDown={(event) => onCellKeyDown(event, row, true)}
          />
        );
      case "after":
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`}>
            {money(toRupees(toPaise(row.pendingAmount) - toPaise(row.apply)))}
          </span>
        );
      default:
        // Disc recd, W/back, R/off, Due, Days, PDC out — a held item has none.
        return null;
    }
  };

  const billCell = (column: ResolvedReceiptColumn<PaymentBillColumnKey>, row: BillRow) => {
    const align = ALIGN_CLASS[column.align] ?? "";
    const moneyCell = (value: number) => (
      <span className={`${styles.cellText} ${align}`}>{money(value)}</span>
    );
    const share = deductionShares.get(row.billId) ?? 0;

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
        return moneyCell(row.billAmount);
      case "paid":
        return moneyCell(row.billAmount - row.pendingAmount);
      case "pendingAmount":
        return moneyCell(row.pendingAmount);
      case "pdcOut":
        // Our post-dated cheque against it: the bill stays pending until the
        // cheque's date, and without this it looks like a bill nobody paid.
        return (
          <span
            className={`${styles.cellText} ${align}`}
            title={
              row.pdcHeld > 0
                ? "Our post-dated cheque covers this much. The bill stays pending until its date."
                : undefined
            }
          >
            {money(row.pdcHeld)}
          </span>
        );
      case "pay":
      case "discount":
      case "writeBack":
      case "roundOff": {
        const field = CELL_FIELD[column.key];
        if (!field) {
          return null;
        }
        const value = row[field];
        const roundUp = field === "roundOff" && value < 0;
        return (
          <input
            className={`${styles.cellInput} ${styles.alignRight} ${
              field === "receive" && row.receiveTyped ? styles.cellTyped : ""
            }`}
            type="number"
            // R/off may go NEGATIVE — a bill rounded up by a few paise.
            min={field === "roundOff" ? -0.99 : 0}
            step="0.01"
            value={value === 0 ? "" : value}
            disabled={!editable}
            title={
              roundUp
                ? "Rounded UP: paid this much over the bill. It goes to Round Off as money on top."
                : field === "writeOff"
                  ? "A balance written back — what we owe that will not be paid."
                  : field === "discount"
                    ? "Discount the supplier allowed us."
                    : undefined
            }
            onFocus={() => onFocusRow(row.billId)}
            onChange={(event) => onSetCell(row.billId, field, Number(event.target.value))}
            onKeyDown={(event) => onCellKeyDown(event, row, false)}
          />
        );
      }
      case "after":
        return moneyCell(toRupees(toPaise(afterSettlement(row)) - share));
      case "note":
        return (
          <input
            className={styles.cellInput}
            value={row.note}
            disabled={!editable}
            // The scratch note goes nowhere. Where a deduction lands on the
            // bill, the placeholder says so without overwriting it.
            placeholder={share > 0 ? `TDS / deduction ${formatMoney(toRupees(share))} lands here` : ""}
            title="A scratch note for this session. It is not saved with the payment."
            onFocus={() => onFocusRow(row.billId)}
            onChange={(event) => onSetNote(row.billId, event.target.value)}
            onKeyDown={(event) => onCellKeyDown(event, row, false)}
          />
        );
      default:
        return null;
    }
  };

  const rowCount = bills.length + held.length;

  return (
    <div className={styles.gridViewport} onContextMenu={onContextMenu}>
      <table className={styles.grid} style={{ width: scaledWidth(tableWidth), minWidth: "100%" }}>
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
                  {loading ? "Reading what we owe this party…" : emptyMessage}
                </p>
              </td>
            </tr>
          ) : null}

          {/* Held items first: what the party holds of ours, above what we owe. */}
          {held.map((row) => (
            <tr
              key={row.billId}
              className={`${styles.rowCredit} ${currentRowId === row.billId ? styles.rowSelected : ""}`}
            >
              {visible.map((column) => (
                <td key={column.key}>{heldCell(column, row)}</td>
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
