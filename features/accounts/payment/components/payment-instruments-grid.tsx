"use client";

/**
 * The instruments grid — `ui_tables` 43, "PAYMENT - TENDERS".
 *
 * The receipt's one-list-two-kinds grid: a row is an INSTRUMENT (cash, a bank
 * transfer, our cheque, UPI) or a ROLE LINE, and picking the other kind in the
 * Type cell converts it. What is the payment's own:
 *
 *  - **Bank / book is painted, never typed.** A cheque shows its book (F4 to
 *    pick it); a transfer shows where the money goes (F4 for the beneficiary).
 *    Picking a cheque or transfer tender opens F4 at once.
 *  - **A cheque has no number cell.** The leaf is the server's, taken at Post;
 *    the row says so, and shows the leaf once there is one.
 *  - **Charge** opens on a transfer only — the bank's fee, inside the amount.
 *  - **Dr/Cr and Settles bill are the role's**, shown, never keyed.
 *  - **Every seeded line is closed** — TDS, the charge, the mirrors and a
 *    round-up are worked out from the grids, and the server would refuse a
 *    typed figure.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { toast } from "@/lib/notify";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import type { ResolvedReceiptColumn } from "@/features/accounts/receipt/columns";
import { Chip } from "@/features/accounts/receipt/components/chip";
import styles from "@/features/accounts/receipt/page.module.scss";
import type { PaymentTenderColumnKey } from "../columns";
import { PAYMENT_ROLE_LABELS, PICKABLE_PAYMENT_ROLES } from "../domain/roles";
import { isChequeType, isPdc, isTransferType, lastFour } from "../domain/tenders";
import type {
  BillRow,
  ChequeBook,
  PaymentLineRow,
  PaymentRole,
  PaymentTenderRow,
} from "../payment.types";

export type PaymentInstrumentsGridProps = {
  columns: ResolvedReceiptColumn<PaymentTenderColumnKey>[];
  tenders: PaymentTenderRow[];
  lines: PaymentLineRow[];
  masters: readonly TenderMasterRow[];
  books: readonly ChequeBook[];
  bills: readonly BillRow[];
  paymentDate: string;
  editable: boolean;
  onSetTender: (rowKey: string, patch: Partial<PaymentTenderRow>) => void;
  onRetarget: (rowKey: string, master: TenderMasterRow) => void;
  onConvertToLine: (rowKey: string, role: PaymentRole) => void;
  onConvertToTender: (rowKey: string, master: TenderMasterRow) => void;
  onSetLine: (rowKey: string, patch: Partial<PaymentLineRow>) => void;
  onSetLineRole: (rowKey: string, role: PaymentRole) => void;
  onRemoveRow: (rowKey: string) => void;
  /** F4 — our cheque's book, or a transfer's beneficiary. */
  onOpenInstrumentDialog: (rowKey: string) => void;
  onAmountCommitted: () => void;
  onFocusRow: (rowKey: string) => void;
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

const ALIGN_CLASS: Record<string, string> = {
  left: "",
  right: styles.alignRight,
  center: styles.alignCenter,
};

const TENDER_OPTION_PREFIX = "tender:";
const ROLE_OPTION_PREFIX = "role:";

function disabledCell(title: string) {
  return (
    <span className={`${styles.cellText} ${styles.cellMuted}`} title={title}>
      —
    </span>
  );
}

function roleLabel(line: PaymentLineRow): string {
  if (line.role === "ROUND_OFF" && line.drCr === "DR") {
    return "Rounded up";
  }
  if (line.role) {
    return PAYMENT_ROLE_LABELS[line.role] ?? line.role;
  }
  return line.ledgerName || "Ledger";
}

export function PaymentInstrumentsGrid(props: PaymentInstrumentsGridProps) {
  const {
    columns,
    tenders,
    lines,
    masters,
    books,
    bills,
    paymentDate,
    editable,
    onSetTender,
    onRetarget,
    onConvertToLine,
    onConvertToTender,
    onSetLine,
    onSetLineRole,
    onRemoveRow,
    onOpenInstrumentDialog,
    onAmountCommitted,
    onFocusRow,
    resizingKey,
    onColumnResizeStart,
    onContextMenu,
  } = props;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const tableWidth = useMemo(() => totalColumnWidth(visible), [visible]);
  const mastersById = useMemo(
    () => new Map(masters.map((master) => [master.tndId, master])),
    [masters],
  );
  const booksById = useMemo(
    () => new Map(books.map((book) => [book.chequeBookId, book])),
    [books],
  );

  const typeOptions = (
    <>
      <optgroup label="Paid by">
        {masters.map((master) => (
          <option key={master.tndId} value={`${TENDER_OPTION_PREFIX}${master.tndId}`}>
            {master.tndName}
          </option>
        ))}
      </optgroup>
      <optgroup label="Charges and deductions">
        {PICKABLE_PAYMENT_ROLES.map((role) => (
          <option key={role} value={`${ROLE_OPTION_PREFIX}${role}`}>
            {PAYMENT_ROLE_LABELS[role]}
          </option>
        ))}
      </optgroup>
    </>
  );

  const onTypeChange = (rowKey: string, value: string, fromKind: "tender" | "line") => {
    if (value.startsWith(TENDER_OPTION_PREFIX)) {
      const master = mastersById.get(value.slice(TENDER_OPTION_PREFIX.length));
      if (!master) {
        return;
      }
      if (fromKind === "tender") {
        onRetarget(rowKey, master);
      } else {
        onConvertToTender(rowKey, master);
      }
      const typeId = Number.parseInt(master.tndTypeId, 10) || 0;
      // A cheque needs its book and a transfer its beneficiary: F4 opens
      // straight away rather than waiting to be remembered. A converted line
      // gets a new key, so only a retargeted row can be addressed here.
      if (fromKind === "tender" && (isChequeType(typeId) || isTransferType(typeId))) {
        onOpenInstrumentDialog(rowKey);
      }
      return;
    }
    const role = value.slice(ROLE_OPTION_PREFIX.length) as PaymentRole;
    if (fromKind === "tender") {
      onConvertToLine(rowKey, role);
    } else {
      onSetLineRole(rowKey, role);
    }
  };

  const onRowKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    rowKey: string,
    tender: PaymentTenderRow | null,
  ) => {
    if (event.key === "F4" && tender) {
      event.preventDefault();
      if (isChequeType(tender.tenderTypeId) || isTransferType(tender.tenderTypeId)) {
        onOpenInstrumentDialog(rowKey);
      } else {
        toast.info(
          "F4 is for a cheque's book and date, or a transfer's beneficiary. Cash needs neither.",
        );
      }
      return;
    }
    if (event.key === "-" && event.altKey) {
      event.preventDefault();
      onRemoveRow(rowKey);
    }
  };

  const tenderCell = (
    column: ResolvedReceiptColumn<PaymentTenderColumnKey>,
    row: PaymentTenderRow,
    rowNo: number,
  ) => {
    const cheque = isChequeType(row.tenderTypeId);
    const transfer = isTransferType(row.tenderTypeId);
    const postDated = cheque && isPdc(row.instrumentDate || null, paymentDate);

    switch (column.key) {
      case "rowNo":
        return <span className={`${styles.cellText} ${styles.alignRight}`}>{rowNo}</span>;
      case "type":
        return (
          <select
            className={styles.cellSelect}
            value={`${TENDER_OPTION_PREFIX}${row.tenderId}`}
            disabled={!editable}
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onTypeChange(row.key, event.target.value, "tender")}
            onKeyDown={(event) => onRowKeyDown(event, row.key, row)}
          >
            {!mastersById.has(row.tenderId) ? (
              // A loaded row on a tender no longer offered still shows its name.
              <option value={`${TENDER_OPTION_PREFIX}${row.tenderId}`}>
                {row.tenderName || "—"}
              </option>
            ) : null}
            {typeOptions}
          </select>
        );
      case "amount":
        return (
          <input
            className={`${styles.cellInput} ${styles.alignRight}`}
            type="number"
            min={0}
            step="0.01"
            value={row.amount === 0 ? "" : row.amount}
            disabled={!editable}
            title={transfer ? "What leaves our bank — the charge included." : undefined}
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onSetTender(row.key, { amount: Number(event.target.value) })}
            onBlur={onAmountCommitted}
            onKeyDown={(event) => onRowKeyDown(event, row.key, row)}
          />
        );
      case "refNote":
        if (cheque) {
          const favouring = row.cheque.favouring.trim();
          const text = row.leaf
            ? `leaf ${row.leaf}${favouring ? ` · favouring ${favouring}` : ""}`
            : `leaf (auto)${favouring ? ` · favouring ${favouring}` : ""}`;
          return (
            <span
              className={`${styles.cellText} ${styles.cellMuted}`}
              title="The leaf is the server's: it is taken from the book at Post. F4 sets who the cheque is to."
            >
              {text}
            </span>
          );
        }
        return (
          <input
            className={styles.cellInput}
            value={row.refNo}
            maxLength={100}
            disabled={!editable}
            placeholder={transfer ? "UTR / Ref No" : "reference"}
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onSetTender(row.key, { refNo: event.target.value })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, row)}
          />
        );
      case "instrDate":
        if (!cheque) {
          return disabledCell("Only a cheque carries a date of its own.");
        }
        return (
          <input
            className={styles.cellInput}
            type="date"
            value={row.instrumentDate}
            min={paymentDate || undefined}
            disabled={!editable}
            title="The date written on the cheque. Later than the payment makes it post-dated — a voucher of its own."
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onSetTender(row.key, { instrumentDate: event.target.value })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, row)}
          />
        );
      case "bankName": {
        if (cheque) {
          const book = row.cheque.chequeBookId ? booksById.get(row.cheque.chequeBookId) : undefined;
          const label = book
            ? `${book.bankName} · ${book.bookNo}`
            : row.cheque.chequeBookId
              ? [row.bankName, row.bookNo].filter(Boolean).join(" · ") || "book chosen"
              : "F4 — pick the book";
          return (
            <button
              type="button"
              className={`${styles.cellSelect} ${row.cheque.chequeBookId ? "" : styles.inputInvalid}`}
              disabled={!editable}
              title="F4 — the book the cheque is written from, its date and who it is to."
              onFocus={() => onFocusRow(row.key)}
              onClick={() => onOpenInstrumentDialog(row.key)}
              onKeyDown={(event) => onRowKeyDown(event, row.key, row)}
            >
              {label}
            </button>
          );
        }
        if (transfer) {
          const name = row.beneficiary.name.trim();
          const account = row.beneficiary.accountNo.trim();
          const label = name || account
            ? `→ ${name || "account"}${account ? ` ····${lastFour(account)}` : ""}`
            : "F4 — beneficiary";
          return (
            <button
              type="button"
              className={styles.cellSelect}
              disabled={!editable}
              title="F4 — where the money goes. A snapshot on this payment only."
              onFocus={() => onFocusRow(row.key)}
              onClick={() => onOpenInstrumentDialog(row.key)}
              onKeyDown={(event) => onRowKeyDown(event, row.key, row)}
            >
              {label}
            </button>
          );
        }
        return disabledCell("Cash has no bank and no book.");
      }
      case "charge":
        if (!transfer) {
          return disabledCell("Only a transfer carries the bank's charge.");
        }
        return (
          <input
            className={`${styles.cellInput} ${styles.alignRight}`}
            type="number"
            min={0}
            step="0.01"
            value={row.mdrAmt === 0 ? "" : row.mdrAmt}
            disabled={!editable}
            title="The bank's charge for sending it — INSIDE the amount. The party receives the amount less this."
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onSetTender(row.key, { mdrAmt: Number(event.target.value) })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, row)}
          />
        );
      case "drCr":
        return disabledCell("An instrument is always money going out.");
      case "settlesBill":
        return disabledCell("An instrument settles whatever the bills grid places it against.");
      case "against":
        return disabledCell("Only a deduction can be pinned to one bill.");
      case "pdcVoucher":
        if (row.pdcVoucherRefno) {
          return <Chip value={row.pdcVoucherRefno} tone="blue" />;
        }
        return postDated ? (
          <Chip
            value="PDC"
            tone="amber"
            title="Dated after the payment, so it is posted as a voucher of its own and the bills it covers stay pending until then."
          />
        ) : null;
      default:
        return null;
    }
  };

  const lineCell = (
    column: ResolvedReceiptColumn<PaymentTenderColumnKey>,
    row: PaymentLineRow,
    rowNo: number,
  ) => {
    switch (column.key) {
      case "rowNo":
        return <span className={`${styles.cellText} ${styles.alignRight}`}>{rowNo}</span>;
      case "type":
        if (row.seeded || !row.role || !PICKABLE_PAYMENT_ROLES.includes(row.role)) {
          return (
            <span
              className={styles.cellText}
              title={row.seeded ? "Derived from the grids — change the figure it comes from." : undefined}
            >
              {roleLabel(row)}
            </span>
          );
        }
        return (
          <select
            className={styles.cellSelect}
            value={`${ROLE_OPTION_PREFIX}${row.role}`}
            disabled={!editable}
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onTypeChange(row.key, event.target.value, "line")}
            onKeyDown={(event) => onRowKeyDown(event, row.key, null)}
          >
            {typeOptions}
          </select>
        );
      case "amount":
        return (
          <input
            className={`${styles.cellInput} ${styles.alignRight}`}
            type="number"
            min={0}
            step="0.01"
            value={row.amount === 0 ? "" : row.amount}
            disabled={!editable || row.seeded}
            title={
              row.seeded
                ? row.role === "TDS_PAYABLE"
                  ? "Worked out from the instruments exactly as the server will — a different figure is refused."
                  : "The total of a column on the grids."
                : undefined
            }
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onSetLine(row.key, { amount: Number(event.target.value) })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, null)}
          />
        );
      case "refNote":
        if (row.seeded) {
          return (
            <span className={`${styles.cellText} ${styles.cellMuted}`} title={row.narration}>
              {row.narration}
            </span>
          );
        }
        return (
          <input
            className={styles.cellInput}
            value={row.narration}
            maxLength={250}
            disabled={!editable}
            placeholder="narration"
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onSetLine(row.key, { narration: event.target.value })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, null)}
          />
        );
      case "instrDate":
        return disabledCell("A ledger line has no instrument.");
      case "bankName":
        return disabledCell("A ledger line has no bank.");
      case "charge":
        return disabledCell("A charge belongs to the transfer it was taken on.");
      case "drCr":
        return (
          <span
            className={`${styles.cellText} ${styles.alignCenter}`}
            title="The role's own side — a deduction is CR, money on top is DR."
          >
            {row.drCr}
          </span>
        );
      case "settlesBill":
        return (
          <span className={`${styles.cellText} ${styles.alignCenter}`}>
            {row.settlesBill ? "Yes" : "No"}
          </span>
        );
      case "against": {
        if (!row.settlesBill) {
          return disabledCell("Only a line that settles a bill can be pinned to one.");
        }
        return (
          <select
            className={styles.cellSelect}
            value={row.againstBillId ?? ""}
            disabled={!editable}
            title="Pin it to one bill, or leave it to spread over the bills this payment settles."
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => {
              const billId = event.target.value;
              const bill = bills.find((candidate) => candidate.billId === billId);
              onSetLine(row.key, {
                againstBillId: bill ? bill.billId : null,
                againstBillAccYear: bill ? bill.billAccYear : null,
              });
            }}
            onKeyDown={(event) => onRowKeyDown(event, row.key, null)}
          >
            <option value="">spread over the bills</option>
            {bills.map((bill) => (
              <option key={bill.billId} value={bill.billId}>
                {bill.docRefno}
              </option>
            ))}
          </select>
        );
      }
      case "pdcVoucher":
        return row.seeded ? (
          <Chip
            value="SEEDED"
            tone="amber"
            title="The screen keeps this line in step with the grids. It cannot be typed or removed."
          />
        ) : null;
      default:
        return null;
    }
  };

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
          {tenders.length === 0 && lines.length === 0 ? (
            <tr>
              <td colSpan={visible.length}>
                <p className={styles.gridEmpty}>
                  No instrument yet — Alt+T adds one on the default tender.
                </p>
              </td>
            </tr>
          ) : null}
          {tenders.map((row, index) => (
            <tr
              key={row.key}
              className={
                row.amount <= 0
                  ? styles.rowIncomplete
                  : index % 2 === 0
                    ? styles.rowOdd
                    : styles.rowEven
              }
            >
              {visible.map((column) => (
                <td key={column.key}>{tenderCell(column, row, index + 1)}</td>
              ))}
            </tr>
          ))}
          {lines.map((row, index) => (
            <tr
              key={row.key}
              className={(tenders.length + index) % 2 === 0 ? styles.rowOdd : styles.rowEven}
            >
              {visible.map((column) => (
                <td key={column.key}>{lineCell(column, row, tenders.length + index + 1)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
