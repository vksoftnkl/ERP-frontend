"use client";

/**
 * The instruments grid — `ui_tables` 33, "RECEIPT - TENDERS".
 *
 * ── One list, two kinds of row ───────────────────────────────────────────
 * A row is either an INSTRUMENT (cash, card, UPI, cheque — it writes an
 * `acc_tender_detail` row) or a ROLE LINE (it writes one `acc_vouchers` leg
 * carrying `av_role`). The Type picker lists the tenders first and then the
 * roles, and PICKING THE OTHER KIND CONVERTS THE ROW. That is the only way to
 * add a role line, and the reason there is no second button.
 *
 * This is presentation only: the payload still splits into `tenders[]` and
 * `otherLines[]` exactly as the server expects.
 *
 * ── The kind decides which cells open ────────────────────────────────────
 * What a kind cannot use is greyed WITH THE REASON IN ITS TOOLTIP, so the
 * operator sees why before clicking rather than after.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import type { ResolvedReceiptColumn, TenderColumnKey } from "../columns";
import { ROLE_LABELS, PICKABLE_ROLES } from "../domain/roles";
import { isChequeTender, isPdc, requiredRefLabel } from "../domain/tenders";
import type { BillRow, DrCr, OtherLineRow, ReceiptRole, TenderRow } from "../receipt.types";
import { Chip } from "./chip";
import styles from "../page.module.scss";

export type InstrumentsGridProps = {
  columns: ResolvedReceiptColumn<TenderColumnKey>[];
  tenders: TenderRow[];
  otherLines: OtherLineRow[];
  masters: readonly TenderMasterRow[];
  /** Only DR bills may be pinned — a deduction is a fact about a debt. */
  bills: readonly BillRow[];
  receiptDate: string;
  editable: boolean;
  onSetTender: (rowKey: string, patch: Partial<TenderRow>) => void;
  onRetarget: (rowKey: string, master: TenderMasterRow) => void;
  onConvertToLine: (rowKey: string, role: ReceiptRole) => void;
  onConvertToTender: (rowKey: string, master: TenderMasterRow) => void;
  onSetLine: (rowKey: string, patch: Partial<OtherLineRow>) => void;
  onSetLineRole: (rowKey: string, role: ReceiptRole) => void;
  onRemoveRow: (rowKey: string) => void;
  /** F4 — the optional cheque extras. */
  onOpenChequeDialog: (rowKey: string) => void;
  /** Ask the duplicate guard once the amount has settled. */
  onAmountCommitted: () => void;
  /** Which row the cursor is on — the Default and − buttons act on it. */
  onFocusRow: (rowKey: string) => void;
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

const TENDER_OPTION_PREFIX = "tender:";
const ROLE_OPTION_PREFIX = "role:";

/** Greyed, with the reason — never greyed silently. */
function disabledCell(title: string) {
  return (
    <span className={`${styles.cellText} ${styles.cellMuted}`} title={title}>
      —
    </span>
  );
}

export function InstrumentsGrid(props: InstrumentsGridProps) {
  const {
    columns,
    tenders,
    otherLines,
    masters,
    bills,
    receiptDate,
    editable,
    onSetTender,
    onRetarget,
    onConvertToLine,
    onConvertToTender,
    onSetLine,
    onSetLineRole,
    onRemoveRow,
    onOpenChequeDialog,
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

  /** The one picker: every tender, then every role. */
  const typeOptions = (
    <>
      <optgroup label="Instruments">
        {masters.map((master) => (
          <option key={master.tndId} value={`${TENDER_OPTION_PREFIX}${master.tndId}`}>
            {master.tndName}
          </option>
        ))}
      </optgroup>
      <optgroup label="Deductions and charges">
        {PICKABLE_ROLES.map((role) => (
          <option key={role} value={`${ROLE_OPTION_PREFIX}${role}`}>
            {ROLE_LABELS[role]}
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
      return;
    }
    const role = value.slice(ROLE_OPTION_PREFIX.length) as ReceiptRole;
    if (fromKind === "tender") {
      onConvertToLine(rowKey, role);
    } else {
      onSetLineRole(rowKey, role);
    }
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLElement>, rowKey: string, isCheque: boolean) => {
    if (event.key === "F4" && isCheque) {
      event.preventDefault();
      onOpenChequeDialog(rowKey);
      return;
    }
    if (event.key === "-" && event.altKey) {
      event.preventDefault();
      onRemoveRow(rowKey);
    }
  };

  const tenderCell = (
    column: ResolvedReceiptColumn<TenderColumnKey>,
    row: TenderRow,
    rowNo: number,
  ) => {
    const master = mastersById.get(row.tenderId);
    const cheque = isChequeTender(row.tenderTypeId);
    const refLabel = master ? requiredRefLabel(master) : null;
    const postDated = cheque && isPdc(row.instrumentDate || null, receiptDate);

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
            onKeyDown={(event) => onRowKeyDown(event, row.key, cheque)}
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
            disabled={!editable}
            onFocus={() => onFocusRow(row.key)}
            onChange={(event) => onSetTender(row.key, { amount: Number(event.target.value) })}
            // The guard asks about the TOTAL received, once it has settled —
            // two 500s keyed as two rows are not a duplicate of anything.
            onBlur={onAmountCommitted}
            onKeyDown={(event) => onRowKeyDown(event, row.key, cheque)}
          />
        );
      case "refNote":
        return (
          <input
            className={styles.cellInput}
            value={row.refNo}
            maxLength={100}
            disabled={!editable}
            placeholder={refLabel ?? ""}
            title={
              cheque
                ? "The cheque number. `apd_instrument_no` is NOT NULL, so it is required whatever the tender master says."
                : (refLabel ?? undefined)
            }
            onChange={(event) => onSetTender(row.key, { refNo: event.target.value })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, cheque)}
          />
        );
      case "instrDate":
        if (!cheque) {
          return disabledCell("Only a cheque carries an instrument date.");
        }
        return (
          <input
            className={styles.cellInput}
            type="date"
            value={row.instrumentDate}
            disabled={!editable}
            title="The date written on the cheque. Later than the receipt's date makes it post-dated — and a voucher of its own."
            onChange={(event) => onSetTender(row.key, { instrumentDate: event.target.value })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, cheque)}
          />
        );
      case "bankName":
        if (!cheque) {
          return disabledCell("Only a cheque carries a drawer bank.");
        }
        return (
          <input
            className={styles.cellInput}
            value={row.bankName}
            maxLength={150}
            disabled={!editable}
            // `td_bank_name` is a varchar, not a foreign key: a bank the
            // master has never heard of is typed in and kept.
            title="Free text — F4 opens the rest of the cheque's details."
            onChange={(event) => onSetTender(row.key, { bankName: event.target.value })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, cheque)}
          />
        );
      case "mdr":
        return (
          <input
            className={`${styles.cellInput} ${styles.alignRight}`}
            type="number"
            min={0}
            step="0.01"
            value={row.mdrAmt === 0 ? "" : row.mdrAmt}
            disabled={!editable}
            // It is a SPLIT of the bank leg, not a deduction from the
            // customer — the bill still settles in full.
            title="What the acquirer kept. The customer still paid the full amount, so this changes no bill."
            onChange={(event) => onSetTender(row.key, { mdrAmt: Number(event.target.value) })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, cheque)}
          />
        );
      case "drCr":
        return disabledCell("An instrument is always money coming in.");
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
            title="Dated after the receipt, so it gets its own voucher and the bills it covers do not settle until it matures."
          />
        ) : null;
      default:
        return null;
    }
  };

  const lineCell = (
    column: ResolvedReceiptColumn<TenderColumnKey>,
    row: OtherLineRow,
    rowNo: number,
  ) => {
    switch (column.key) {
      case "rowNo":
        return <span className={`${styles.cellText} ${styles.alignRight}`}>{rowNo}</span>;
      case "type":
        return (
          <select
            className={styles.cellSelect}
            value={row.role ? `${ROLE_OPTION_PREFIX}${row.role}` : ""}
            // A derived line's role is not the operator's to change: it IS the
            // total of a column they typed somewhere else.
            disabled={!editable || row.seeded}
            title={row.seeded ? "Derived from the grids — change the figure it totals." : undefined}
            onChange={(event) => onTypeChange(row.key, event.target.value, "line")}
            onKeyDown={(event) => onRowKeyDown(event, row.key, false)}
          >
            {row.role && !PICKABLE_ROLES.includes(row.role) ? (
              <option value={`${ROLE_OPTION_PREFIX}${row.role}`}>{ROLE_LABELS[row.role]}</option>
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
            // A DERIVED line is read-only; an OFFERED one (TDS, TCS) is the
            // operator's to key — the certificate is the fact, and there is no
            // rate anywhere in this schema to compute it from.
            disabled={!editable || isDerived(row)}
            title={isDerived(row) ? "The total of a column on the grids." : undefined}
            onChange={(event) => onSetLine(row.key, { amount: Number(event.target.value) })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, false)}
          />
        );
      case "refNote":
        return (
          <input
            className={styles.cellInput}
            value={row.narration}
            maxLength={250}
            disabled={!editable}
            placeholder="narration"
            onChange={(event) => onSetLine(row.key, { narration: event.target.value })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, false)}
          />
        );
      case "instrDate":
        return disabledCell("A ledger line has no instrument.");
      case "bankName":
        return disabledCell("A ledger line has no drawer bank.");
      case "mdr":
        return disabledCell("MDR belongs to the instrument it was charged on.");
      case "drCr":
        return (
          <select
            className={`${styles.cellSelect} ${styles.alignCenter}`}
            value={row.drCr}
            disabled={!editable || row.seeded}
            onChange={(event) => onSetLine(row.key, { drCr: event.target.value as DrCr })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, false)}
          >
            <option value="DR">DR</option>
            <option value="CR">CR</option>
          </select>
        );
      case "settlesBill":
        return (
          <select
            className={`${styles.cellSelect} ${styles.alignCenter}`}
            value={row.settlesBill ? "yes" : "no"}
            disabled={!editable || row.seeded}
            title="Whether it comes off what the party owes, or is money they paid on top."
            onChange={(event) => onSetLine(row.key, { settlesBill: event.target.value === "yes" })}
            onKeyDown={(event) => onRowKeyDown(event, row.key, false)}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
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
            // Unpinned it spreads pro-rata over the bills this receipt
            // settles; pinned it lands on exactly one — which is what 26AS
            // matching works on.
            title="Pin it to one bill, or leave it to spread over the bills this receipt settles."
            onChange={(event) => {
              const billId = event.target.value;
              const bill = bills.find((candidate) => candidate.billId === billId);
              onSetLine(row.key, {
                againstBillId: bill ? bill.billId : null,
                againstBillAccYear: bill ? bill.billAccYear : null,
              });
            }}
            onKeyDown={(event) => onRowKeyDown(event, row.key, false)}
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
            title="The screen keeps this line in step with the grids. It can be re-amounted where it is the operator's figure, but not removed."
          />
        ) : null;
      default:
        return null;
    }
  };

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
          {tenders.length === 0 && otherLines.length === 0 ? (
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
              // An instrument with no amount on it is the one thing that stops
              // this receipt posting, so the row says so rather than waiting
              // for the refusal.
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
          {otherLines.map((row, index) => (
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

/**
 * A line whose amount is a SUM of something else on the screen. Read-only:
 * typing into it would be typing into a total.
 *
 * TDS and TCS are seeded but NOT derived — the screen offers the line and the
 * operator keys what the customer actually withheld.
 */
function isDerived(row: OtherLineRow): boolean {
  return (
    row.seeded &&
    row.role !== null &&
    ["DISCOUNT_ALLOWED", "WRITE_OFF", "ROUND_OFF", "BANK_CHARGES"].includes(row.role)
  );
}
