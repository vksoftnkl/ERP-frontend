"use client";

/**
 * The selected party's bill-wise breakup — `ui_tables` 31, "OPENING BALANCE -
 * BILLS".
 *
 * It sits UNDER the ledger grid and is never a modal. The tie has one number on
 * the ledger row and the other in here, and a modal would hide the trial
 * balance at exactly the moment the operator is changing the figures that move
 * it.
 *
 * **The party opens at the NET.** 5,000 Dr against 3,000 Cr opens it at 2,000
 * Dr, not 8,000 — verified live. The ledger row mirrors that as the bills are
 * typed, because `POST /bills` rewrites `op_amount` from these rows in the same
 * transaction: showing any other figure meanwhile would be a lie the save then
 * silently corrects.
 *
 * **There is no load race to guard against.** The panel renders from
 * `billsByParty[currentParty]` and shows "Loading…" while that entry is
 * undefined, so a late answer for party A fills A's cache entry and can never
 * paint under B's name. Qt had to clear the grid before the fetch and re-check
 * the party in the callback; neither is needed here, and neither is a
 * "discard if stale" branch.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import {
  BILL_FROZEN_COLUMNS,
  BILL_READONLY_COLUMNS,
  type BillColumnKey,
  type ResolvedOpeningColumn,
} from "../columns";
import { formatMoney, formatSigned, isBlankBill, partyNet } from "../derived";
import type { BillRow } from "../opening-balance.types";
import { Chip } from "./chip";
import {
  FIELD_ATTR,
  FOCUS_STOP_ATTR,
  GRID_ATTR,
  ROW_ATTR,
  moveCellFocus,
  moveRowFocus,
} from "./grid-focus";
import styles from "../page.module.scss";

export const BILL_GRID_NAME = "bills";

const ROW_ACTION_PX = 32;

const ALIGN_CLASS: Record<string, string> = {
  left: "",
  right: styles.alignRight,
  center: styles.alignCenter,
};

/** A cell a lone hyphen is a legitimate character in. */
function isTextCell(element: EventTarget | null): boolean {
  return element instanceof HTMLInputElement && (element.type === "text" || element.type === "");
}

const FROZEN_TITLE =
  "This bill has been receipted against, so its reference, date, amount and side are fixed. " +
  "Add a correcting opening bill for the difference, or reverse the allocation in the receipt screen first.";

export type BillPanelProps = {
  columns: ResolvedOpeningColumn<BillColumnKey>[];
  partyName: string;
  /** `undefined` = still loading. An empty array is a party with no bills yet. */
  bills: BillRow[] | undefined;
  editable: boolean;
  /**
   * What `GET /bills` said about the tie WHEN IT LOADED. A `false` here means
   * the data was written around the route — a loud warning, never the live
   * figure, which is computed from the rows on screen.
   */
  loadedTie: boolean | null;
  /** The column a width drag is live on, for the handle's own highlight. */
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  /** Right-click: "save column width" and "Admin settings". */
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onSetField: (rowKey: string, patch: Partial<BillRow>) => void;
  onRemoveBill: (rowKey: string) => void;
  onClose: () => void;
};

export function BillPanel(props: BillPanelProps) {
  const {
    columns,
    partyName,
    bills,
    editable,
    loadedTie,
    resizingKey,
    onColumnResizeStart,
    onContextMenu,
    onSetField,
    onRemoveBill,
    onClose,
  } = props;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const tableWidth = useMemo(() => totalColumnWidth(visible, ROW_ACTION_PX), [visible]);
  const net = useMemo(() => partyNet(bills ?? []), [bills]);
  const keyed = useMemo(() => (bills ?? []).filter((bill) => !isBlankBill(bill)), [bills]);

  /** The ledger grid's keys, over this grid: Enter chain, ↑/↓ rows, −/Ctrl+− remove. */
  const onCellKeyDown = (event: KeyboardEvent<HTMLElement>, row: BillRow) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveCellFocus(BILL_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (event.currentTarget instanceof HTMLSelectElement) {
        return;
      }
      event.preventDefault();
      moveRowFocus(BILL_GRID_NAME, event.target, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "-" && (event.ctrlKey || !isTextCell(event.currentTarget))) {
      // Bare `−` everywhere but Invoice no and Narration, where a hyphen is part
      // of the value an operator is typing ("SB/2025-0412").
      event.preventDefault();
      onRemoveBill(row.key);
    }
  };

  const renderCell = (column: ResolvedOpeningColumn<BillColumnKey>, row: BillRow) => {
    const frozenHere = row.isFrozen && BILL_FROZEN_COLUMNS.has(column.key);
    const disabled = !editable || BILL_READONLY_COLUMNS.has(column.key) || frozenHere;
    // Say WHY instead of rendering an input that silently refuses: that is the
    // most common way these grids get reported as broken.
    const title = frozenHere ? FROZEN_TITLE : undefined;
    const cellProps = {
      [GRID_ATTR]: BILL_GRID_NAME,
      [ROW_ATTR]: row.key,
      [FIELD_ATTR]: column.key,
      ...(column.focus ? { [FOCUS_STOP_ATTR]: "" } : {}),
    };

    switch (column.key) {
      case "invoiceno":
        return (
          <input
            {...cellProps}
            className={styles.cellInput}
            value={row.docRefno}
            maxLength={50}
            disabled={disabled}
            title={title}
            onChange={(event) => onSetField(row.key, { docRefno: event.target.value })}
            onKeyDown={(event) => onCellKeyDown(event, row)}
          />
        );

      case "invoicedate":
      case "duedate": {
        const field = column.key === "invoicedate" ? "docDate" : "dueDate";
        return (
          <input
            {...cellProps}
            className={styles.cellInput}
            type="date"
            // The ORIGINAL invoice date, not today's: ageing measures from it.
            value={column.key === "invoicedate" ? row.docDate : row.dueDate}
            min={column.key === "duedate" ? row.docDate || undefined : undefined}
            disabled={disabled}
            title={title}
            onChange={(event) => onSetField(row.key, { [field]: event.target.value })}
            onKeyDown={(event) => onCellKeyDown(event, row)}
          />
        );
      }

      case "creditdays":
      case "grace": {
        const field = column.key === "creditdays" ? "creditDays" : "graceDays";
        const value = column.key === "creditdays" ? row.creditDays : row.graceDays;
        return (
          <input
            {...cellProps}
            className={`${styles.cellInput} ${styles.alignRight}`}
            type="number"
            min={0}
            step={1}
            value={value === 0 ? "" : value}
            disabled={disabled}
            title={title}
            onChange={(event) =>
              onSetField(row.key, { [field]: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })
            }
            onKeyDown={(event) => onCellKeyDown(event, row)}
          />
        );
      }

      case "drcr":
        return (
          <select
            {...cellProps}
            className={`${styles.cellSelect} ${styles.alignCenter}`}
            value={row.drCr}
            disabled={disabled}
            title={title}
            onChange={(event) => onSetField(row.key, { drCr: event.target.value as "Dr" | "Cr" })}
            onKeyDown={(event) => onCellKeyDown(event, row)}
          >
            <option value="Dr">Dr</option>
            <option value="Cr">Cr</option>
          </select>
        );

      case "amount":
        return (
          <input
            {...cellProps}
            className={`${styles.cellInput} ${styles.alignRight}`}
            type="number"
            min={0}
            step="0.01"
            value={row.amount === 0 ? "" : row.amount}
            disabled={disabled}
            title={title}
            onChange={(event) => onSetField(row.key, { amount: Math.max(0, Number(event.target.value)) })}
            onKeyDown={(event) => onCellKeyDown(event, row)}
          />
        );

      case "narration":
        return (
          <input
            {...cellProps}
            className={styles.cellInput}
            value={row.narration}
            maxLength={2000}
            disabled={disabled}
            onChange={(event) => onSetField(row.key, { narration: event.target.value })}
            onKeyDown={(event) => onCellKeyDown(event, row)}
          />
        );

      // GENERATED / server-derived. Shown, never sent.
      case "allocated":
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`}>
            {row.allocated === 0 ? "" : formatMoney(row.allocated)}
          </span>
        );
      case "pending":
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`}>
            {row.ablId === null ? "" : formatMoney(row.pending)}
          </span>
        );
      case "status":
        return <Chip value={row.status} />;

      default:
        return null;
    }
  };

  return (
    <div className={`${styles.gridShell} ${styles.billShell}`} onContextMenu={onContextMenu}>
      <div className={styles.gridHead}>
        <span className={styles.gridHeadTitle}>Bill-wise breakup — {partyName}</span>
        <button type="button" className={styles.linkButton} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.tieBand}>
        {bills === undefined ? (
          <span>Loading…</span>
        ) : keyed.length === 0 ? (
          <span>
            No opening bills yet — this party opens at zero. Key its outstanding invoices into the
            blank row below.
          </span>
        ) : (
          <span>
            {keyed.length} bill(s), net <strong>{formatSigned(net.amount, net.side)}</strong> — this
            is the party&apos;s opening.
          </span>
        )}
        {loadedTie === false ? (
          <span className={styles.tieAlarm}>
            The stored opening figure did not match these bills when they loaded. `POST /bills`
            keeps the two equal in one transaction, so this can only mean the rows were written
            around the route — saving the breakup will correct the figure.
          </span>
        ) : null}
      </div>

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
              {visible.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  title={`${column.header} — drag the right edge to widen, right-click to save or configure`}
                  className={cx(
                    styles.gridHeaderCell,
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
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {(bills ?? []).map((row, index) => (
              <tr
                key={row.key}
                className={[
                  index % 2 === 0 ? styles.rowOdd : styles.rowEven,
                  row.isFrozen ? styles.rowFrozen : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {visible.map((column) => (
                  <td key={column.key} className={ALIGN_CLASS[column.align]}>
                    {renderCell(column, row)}
                  </td>
                ))}
                <td className={styles.rowActionCell}>
                  {editable && !isBlankBill(row) ? (
                    <button
                      type="button"
                      className={styles.rowRemove}
                      title={row.isFrozen ? FROZEN_TITLE : `Remove "${row.docRefno}"`}
                      onClick={() => onRemoveBill(row.key)}
                    >
                      −
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {bills === undefined ? (
              <tr>
                <td colSpan={visible.length + 1} className={styles.gridLoading}>
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
