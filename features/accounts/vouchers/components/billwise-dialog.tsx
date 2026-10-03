"use client";

/**
 * Bill-wise — one party line of a Receipt / Payment Voucher (the Qt
 * `VoucherBillwiseDialog`).
 *
 * The party's open bills, oldest first (by due date, else the bill's own),
 * laid out by ui table 40 "VOUCHER REGISTER - BILLWISE". It opens filled:
 * oldest first, each bill up to what it owes, until the line's amount is gone
 * — on a payment with TDS that amount is the GROSS, which the head says. A
 * figure can be changed: never above what the bill owes, nor above what is
 * left of the amount once the other bills are counted. The rest is the
 * advance (on account), raised by the server as a bill of the party's.
 *
 * OK is the only way out (Esc and the close button do nothing): leaving with
 * nothing said would leave the operator not knowing where the money went.
 * F2 fills oldest first again; F3 puts it all on account. In the figures,
 * Enter walks down; past the last bill it is OK.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useUiTableId } from "@/lib/ui-tables";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { resolveReceiptColumns, type ReceiptColumnMeaning } from "@/features/accounts/receipt/columns";
import receiptStyles from "@/features/accounts/receipt/page.module.scss";
import styles from "../vouchers.module.scss";
import {
  allToAdvance,
  allocatedPaise,
  billLabel,
  editBill,
  fillOldestFirst,
  pendingPaise,
  type BillRow,
} from "../domain/bills";
import { formatPaise, paiseText } from "../domain/lines";
import type { BillwiseAnswer, BillwiseAsk } from "../state/use-voucher-entry";

type BillColumnKey = "ref" | "date" | "type" | "pending" | "thisVoucher" | "due";

const BILL_MEANINGS: ReceiptColumnMeaning<BillColumnKey>[] = [
  { key: "ref", token: "Bill / Ref", kind: "text", align: "left" },
  { key: "date", token: "Date", kind: "date", align: "center" },
  { key: "type", token: "Type", kind: "text", align: "left" },
  { key: "pending", token: "Pending", kind: "money", align: "right" },
  { key: "thisVoucher", token: "This voucher", kind: "money", align: "right" },
  { key: "due", token: "Due", kind: "date", align: "center" },
];

const BILL_NUMBERS: Record<BillColumnKey, number> = {
  ref: 0,
  date: 1,
  type: 2,
  pending: 3,
  thisVoucher: 4,
  due: 5,
};

/** Only "This voucher" is ever typed in; the figures walk down with Enter. */
const BILLS_FOCUS_NOTE =
  "Focus is kept with the layout; only This voucher is typed in here, and Enter walks down it.";

/**
 * ui table 40 "VOUCHER REGISTER - BILLWISE" — the popup's and the one-party
 * card's layout, with the right-click the entry grids carry: "save column
 * width" for a dragged heading and "Admin settings" (visibility, order).
 * Every configured column feeds the dialog; the table draws the visible ones.
 */
export function useBillGrid(label: string) {
  const tableId = useUiTableId("voucherBills");
  const { data: layout } = useGetQuotationGridLayoutQuery({ uiTableId: tableId }, { skip: !tableId });
  const all = useMemo(() => resolveReceiptColumns(layout, BILL_MEANINGS, BILL_NUMBERS), [layout]);
  const resize = useColumnResize(all, tableId);
  const settings = useGridSettings({
    label,
    uiTableId: tableId,
    columns: resize.columns,
    pendingWidthCount: resize.pendingCount,
    savingWidths: resize.saving,
    onSaveWidths: resize.saveWidths,
    focusNote: BILLS_FOCUS_NOTE,
  });
  const columns = useMemo(() => resize.columns.filter((column) => column.visible), [resize.columns]);
  return { columns, resize, settings };
}

export type BillGrid = ReturnType<typeof useBillGrid>;

/** The bill table's widths and headings, with a drag handle on each. */
export function BillTableHead({ grid }: { grid: BillGrid }) {
  return (
    <>
      <colgroup>
        {grid.columns.map((column) => (
          <col key={column.key} style={{ width: scaledWidth(column.widthPx) }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {grid.columns.map((column) => (
            <th key={column.key} style={{ position: "relative" }}>
              {column.header}
              <span
                className={receiptStyles.columnResizeHandle}
                role="presentation"
                title="Drag to resize the column"
                onMouseDown={(event) => grid.resize.onResizeStart(event, column.key)}
              />
            </th>
          ))}
        </tr>
      </thead>
    </>
  );
}

export function displayDate(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

export type BillwiseDialogProps = {
  ask: BillwiseAsk;
  onOk: (answer: BillwiseAnswer) => void;
};

export function BillwiseDialog({ ask, onOk }: BillwiseDialogProps) {
  const [rows, setRows] = useState<BillRow[]>(ask.rows);
  const [handEdited, setHandEdited] = useState(false);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [refused, setRefused] = useState(false);
  const okRef = useRef<HTMLButtonElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);

  const grid = useBillGrid("Bill-wise");
  const columns = grid.columns;

  const allocated = allocatedPaise(rows);
  const rest = Math.max(0, ask.amount - allocated);

  const commit = (index: number, text: string) => {
    setRows((current) => editBill(current, index, text, ask.amount));
    setHandEdited(true);
    setEditing(null);
  };

  const accept = () => {
    const pending = editing;
    const finalRows = pending ? editBill(rows, pending.index, pending.text, ask.amount) : rows;
    onOk({ rows: finalRows, handEdited: handEdited || pending !== null });
  };

  const oldestFirst = () => {
    setRows((current) => fillOldestFirst(current, ask.amount));
    setHandEdited(false);
    setEditing(null);
  };
  const allOnAccount = () => {
    setRows((current) => allToAdvance(current));
    setHandEdited(true);
    setEditing(null);
  };

  // F2 / F3 from anywhere in the popup; Enter outside the figures is OK.
  const keys = useRef({ oldestFirst, allOnAccount, accept, settingsOpen: grid.settings.active });
  useEffect(() => {
    keys.current = { oldestFirst, allOnAccount, accept, settingsOpen: grid.settings.active };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The grid's settings dialog, when up, has the keys.
      if (keys.current.settingsOpen) {
        return;
      }
      if (event.key === "F2" || event.key === "F3") {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "F2") {
          keys.current.oldestFirst();
        } else {
          keys.current.allOnAccount();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // Enter accepts the filled answer at once; Tab reaches the figures.
  useEffect(() => {
    okRef.current?.focus();
  }, []);

  const focusFigure = (index: number) => {
    tableRef.current?.querySelector<HTMLInputElement>(`[data-bill-row="${index}"]`)?.focus();
  };

  const cell = (key: BillColumnKey, row: BillRow, index: number) => {
    switch (key) {
      case "ref":
        return billLabel(row);
      case "date":
        return displayDate(row.date);
      case "type":
        return row.billType;
      case "pending":
        return formatPaise(pendingPaise(row));
      case "due":
        return displayDate(row.dueDate);
      case "thisVoucher":
        return (
          <input
            className={styles.billInput}
            inputMode="decimal"
            data-bill-row={index}
            value={editing?.index === index ? editing.text : row.thisPaise > 0 ? paiseText(row.thisPaise) : ""}
            onFocus={(event) => {
              setEditing({ index, text: row.thisPaise > 0 ? paiseText(row.thisPaise) : "" });
              event.currentTarget.select();
            }}
            onChange={(event) => setEditing({ index, text: event.target.value.replace(/[^\d.,]/g, "") })}
            onBlur={(event) => commit(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                commit(index, event.currentTarget.value);
                if (index >= rows.length - 1) {
                  okRef.current?.focus();
                } else {
                  focusFigure(index + 1);
                }
              }
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ModalShell
      title={ask.title}
      isOpen
      wide
      // OK is the way out — see the header.
      onClose={() => {
        // Esc in the grid's settings dialog closes that dialog, not this one.
        if (!grid.settings.active) {
          setRefused(true);
        }
      }}
      footer={
        <div className={receiptStyles.dialogActions}>
          <button type="button" className={receiptStyles.button} onClick={oldestFirst}>
            Oldest first (F2)
          </button>
          <button type="button" className={receiptStyles.button} onClick={allOnAccount}>
            All to {ask.remainderLabel.toLowerCase()} (F3)
          </button>
          <button type="button" ref={okRef} className={receiptStyles.primaryButton} onClick={accept}>
            OK
          </button>
        </div>
      }
    >
      <div className={receiptStyles.dialogBody}>
        <p className={styles.billsHead}>
          <b>{ask.partyName}</b> — amount to settle <b>{formatPaise(ask.amount)}</b>
          {ask.keyed > 0 && ask.keyed !== ask.amount ? (
            <span className={styles.billsHeadMuted}> (keyed {formatPaise(ask.keyed)} net; the rest is its TDS)</span>
          ) : null}
        </p>
        {grid.settings.overlays}
        <div className={styles.billsViewport} onContextMenu={grid.settings.onContextMenu}>
          <table
            className={receiptStyles.panelTable}
            ref={tableRef}
            style={{ width: scaledWidth(totalColumnWidth(columns)), minWidth: "100%" }}
          >
            <BillTableHead grid={grid} />
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.ablId}-${row.ablAccYear}`}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={column.align === "right" ? styles.alignRight : undefined}
                      style={column.key === "thisVoucher" ? { padding: 0 } : undefined}
                    >
                      {cell(column.key, row, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.billsTotals}>
          <span>
            <b>{ask.remainderLabel}:</b> {formatPaise(rest)}
          </span>
          <span>
            Amount {formatPaise(ask.amount)} · against bills {formatPaise(allocated)} · {ask.remainderLabel.toLowerCase()}{" "}
            {formatPaise(rest)}
          </span>
        </p>
        {refused ? (
          <p className={styles.error}>
            OK is the way out: it keeps what is shown. To back out, OK and then change the amount or remove the line.
          </p>
        ) : null}
      </div>
    </ModalShell>
  );
}
