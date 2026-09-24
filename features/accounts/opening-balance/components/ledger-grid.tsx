"use client";

/**
 * The ledger set — `ui_tables` 30, "OPENING BALANCE - LEDGERS".
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  THE INVARIANT. READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 *  `POST /create` goes out with `replace: true`, and the server SOFT-DELETES
 *  every opening absent from the payload. That is how a row is cleared: by
 *  being removed. It is safe only while `draft.rows` holds EVERY row that has
 *  an opening — which `includeZero=false` guarantees on load, and which the
 *  picker preserves because it only ever ADDS.
 *
 *  So: never page, filter, virtualise-away or trim the loaded set. A search box
 *  over these rows, added later with the best intentions, would make Save
 *  delete every opening scrolled out of view. Virtualised RENDERING is fine —
 *  the rows stay in `draft.rows`. A filter that drops rows from `draft.rows`,
 *  or a server-paged fetch, is not.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * There is no Add and no Remove button. The grid always ends in ONE blank row
 * whose Ledger cell opens the picker, and picking into it grows the next one.
 * That row is furniture: it does not mark the screen dirty, the payload builder
 * drops it, validation ignores it, and nothing else on it opens until a ledger
 * is picked — an amount with no account is not an opening balance.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import type { LedgerColumnKey, ResolvedOpeningColumn } from "../columns";
import { formatMoney, isBlankLedgerRow } from "../derived";
import type { LedgerRow, ShownSide } from "../opening-balance.types";
import { toDisplayDate } from "../wire/dates";
import { SHOWN_SIDES } from "../wire/side";
import { Chip } from "./chip";
import {
  FIELD_ATTR,
  FOCUS_STOP_ATTR,
  GRID_ATTR,
  LOOKUP_ATTR,
  ROW_ATTR,
  moveCellFocus,
  moveRowFocus,
} from "./grid-focus";
import styles from "../page.module.scss";

export const LEDGER_GRID_NAME = "ledgers";

const ROW_ACTION_PX = 32;

/** The column's configured alignment, as the one class that sets it. */
const ALIGN_CLASS: Record<string, string> = {
  left: "",
  right: styles.alignRight,
  center: styles.alignCenter,
};

export type LedgerGridProps = {
  columns: ResolvedOpeningColumn<LedgerColumnKey>[];
  rows: LedgerRow[];
  editable: boolean;
  /** The ledger whose breakup is open, so the row can show it is selected. */
  currentParty: string | null;
  onSelectRow: (row: LedgerRow) => void;
  onOpenPicker: (rowKey: string) => void;
  onSetAmount: (rowKey: string, amount: number) => void;
  onSetSide: (rowKey: string, side: ShownSide) => void;
  onSetRemarks: (rowKey: string, remarks: string) => void;
  onRemoveRow: (rowKey: string) => void;
  /** The column a width drag is live on, for the handle's own highlight. */
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  /** Right-click: "save column width" and "Admin settings". */
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  /** Alt+B — the explicit "open the breakup" request, which explains refusals. */
  onRequestBreakup: (row: LedgerRow) => void;
  /** F4 on a settled Ledger cell: says why it cannot be repointed. */
  onRepointRefused: (row: LedgerRow) => void;
};

/**
 * The tooltip on a stale row's chip. The date and the reason are the whole
 * point of the flag: "stale" alone tells nobody whether to regenerate.
 */
function staleTitle(row: LedgerRow): string {
  const since = toDisplayDate(row.staleSince);
  const reason = (row.staleReason ?? "").replace(/_/g, " ").toLowerCase();
  if (!since && !reason) {
    return "Something moved under this figure after it was derived.";
  }
  return `Stale${since ? ` since ${since}` : ""}${reason ? ` — ${reason}` : ""}. Regenerate it; do not overwrite it.`;
}

/** A cell a lone hyphen is a legitimate character in. */
function isTextCell(element: EventTarget | null): boolean {
  return element instanceof HTMLInputElement && (element.type === "text" || element.type === "");
}

function billWiseTitle(row: LedgerRow): string {
  return `Owned by the bill-wise breakup — the net of ${row.billCount} opening bill(s).`;
}

export function LedgerGrid(props: LedgerGridProps) {
  const {
    columns,
    rows,
    editable,
    currentParty,
    onSelectRow,
    onOpenPicker,
    onSetAmount,
    onSetSide,
    onSetRemarks,
    onRemoveRow,
    resizingKey,
    onColumnResizeStart,
    onContextMenu,
    onRequestBreakup,
    onRepointRefused,
  } = props;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const tableWidth = useMemo(
    () => totalColumnWidth(visible, ROW_ACTION_PX),
    [visible],
  );

  /**
   * The grid's own keys. They are handled HERE rather than on the window so a
   * press means one thing in a cell and another outside it — `-` deletes a row
   * in the Opening cell and types a hyphen in Remarks, and neither has to check
   * for the other.
   *
   *   Enter / Shift+Enter   the next editable cell, then the next row
   *   ↑ / ↓                 one row, same column — which SELECTS the row, and
   *                         so opens or closes the breakup, exactly as a click
   *   Alt+B                 open this row's breakup, or say why it cannot
   *   − / Ctrl+−            remove the row (asks first)
   */
  const onCellKeyDown = (event: KeyboardEvent<HTMLElement>, row: LedgerRow) => {
    if (event.altKey && (event.key === "b" || event.key === "B")) {
      event.preventDefault();
      onRequestBreakup(row);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      moveCellFocus(LEDGER_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // A select's own ↑/↓ change its value, which is what the operator means
      // inside the Dr/Cr cell — so the row walk leaves that one alone.
      if (event.currentTarget instanceof HTMLSelectElement) {
        return;
      }
      event.preventDefault();
      moveRowFocus(LEDGER_GRID_NAME, event.target, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "-" && (event.ctrlKey || !isTextCell(event.currentTarget))) {
      // Bare `−` is the desktop screen's binding. It is safe on every cell but
      // the free-text ones, because an opening amount is constrained positive
      // (`ck_op_amount >= 0`) and a typed minus is refused at the input rather
      // than converted — so there is no cell here where a lone hyphen is a
      // figure. Ctrl+− works everywhere, Remarks included.
      event.preventDefault();
      onRemoveRow(row.key);
    }
  };

  const renderCell = (column: ResolvedOpeningColumn<LedgerColumnKey>, row: LedgerRow) => {
    const blank = isBlankLedgerRow(row);
    // Nothing but the Ledger cell opens on a row with no ledger.
    const rowEditable = editable && !blank;
    const cellProps = {
      [GRID_ATTR]: LEDGER_GRID_NAME,
      [ROW_ATTR]: row.key,
      [FIELD_ATTR]: column.key,
      ...(column.focus ? { [FOCUS_STOP_ATTR]: "" } : {}),
    };

    switch (column.key) {
      case "ledger":
        /*
         * READ-ONLY, never disabled — on every row, settled or blank.
         *
         * A disabled cell drops out of the keyboard walk, and a bill-wise row's
         * every other cell is disabled (its figure belongs to the bills, its
         * Remarks column is hidden on this layout). Made a `<span>` for looks,
         * or disabled for correctness, the row had NO focusable cell at all —
         * so arrow keys stepped straight over the one kind of row the breakup
         * panel exists for, and it could only be reached with the mouse. That is
         * precisely the thing §6.7 is about.
         *
         * `cellInputPlain` is what keeps it reading as settled text rather than
         * as a greyed-out control the operator thinks is broken.
         */
        return (
          <input
            {...cellProps}
            // Marks it as the picker cell, so the walk steps PAST it when it
            // already names a ledger and lands on it when it does not.
            {...{ [LOOKUP_ATTR]: "" }}
            className={`${styles.cellInput} ${blank ? "" : styles.cellInputPlain}`}
            readOnly
            value={row.ledName}
            placeholder={blank ? "Pick a ledger…" : ""}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "F4") {
                event.preventDefault();
                if (blank) {
                  if (editable) {
                    onOpenPicker(row.key);
                  }
                  return;
                }
                // A saved row cannot be repointed: `op_id` belongs to the ledger
                // it was written for. Say so, rather than opening a picker whose
                // pick would be refused.
                if (event.key === "F4") {
                  onRepointRefused(row);
                  return;
                }
                moveCellFocus(LEDGER_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
                return;
              }
              onCellKeyDown(event, row);
            }}
            onClick={() => {
              if (editable && blank) {
                onOpenPicker(row.key);
              }
            }}
          />
        );

      case "group":
        return <span className={styles.cellText}>{row.groupName}</span>;

      case "nature":
        return <span className={styles.cellText}>{row.groupNature}</span>;

      case "billwise":
        return row.isBillWise ? <Chip value="BILL-WISE" title={billWiseTitle(row)} /> : null;

      case "priorclosing":
        // Blank, not `0.00`: "there is no prior year on this server" and "last
        // year closed at nil" are different facts.
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`}>
            {row.priorClosingAmount === null ? "" : formatMoney(row.priorClosingAmount)}
          </span>
        );

      case "side":
        return (
          <span className={`${styles.cellText} ${styles.alignCenter}`}>{row.priorClosingSide}</span>
        );

      case "opening":
        return (
          <input
            {...cellProps}
            className={`${styles.cellInput} ${styles.alignRight}`}
            type="number"
            min={0}
            step="0.01"
            // The side lives in the flag, never in a sign — `ck_op_amount >= 0`.
            value={row.amount === 0 ? "" : row.amount}
            disabled={!rowEditable || row.isBillWise}
            title={row.isBillWise ? billWiseTitle(row) : undefined}
            onChange={(event) => onSetAmount(row.key, Number(event.target.value))}
            onKeyDown={(event) => onCellKeyDown(event, row)}
          />
        );

      case "drcr":
        return (
          <select
            {...cellProps}
            className={`${styles.cellSelect} ${styles.alignCenter}`}
            value={row.drCr}
            disabled={!rowEditable || row.isBillWise}
            title={row.isBillWise ? billWiseTitle(row) : undefined}
            onChange={(event) => onSetSide(row.key, event.target.value as ShownSide)}
            onKeyDown={(event) => onCellKeyDown(event, row)}
          >
            <option value="" />
            {SHOWN_SIDES.map((side) => (
              <option key={side} value={side}>
                {side}
              </option>
            ))}
          </select>
        );

      case "source":
        return <Chip value={row.source} />;

      case "stale":
        return row.isStale ? <Chip value="STALE" title={staleTitle(row)} /> : null;

      case "bills":
        return (
          <span className={`${styles.cellText} ${styles.alignRight}`}>
            {row.billCount > 0 ? row.billCount : ""}
          </span>
        );

      case "remarks":
        return (
          <input
            {...cellProps}
            className={styles.cellInput}
            value={row.remarks}
            maxLength={500}
            disabled={!rowEditable}
            onChange={(event) => onSetRemarks(row.key, event.target.value)}
            onKeyDown={(event) => onCellKeyDown(event, row)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.gridShell} onContextMenu={onContextMenu}>
      <div className={styles.gridHead}>
        <span className={styles.gridHeadTitle}>Ledgers</span>
        <span className={styles.gridHeadNote}>
          {rows.filter((row) => !isBlankLedgerRow(row)).length} ledger(s) in this set · pick into the
          last row to add one · Ctrl+− removes a row · Alt+B opens a breakup
        </span>
      </div>
      <div className={styles.gridViewport}>
        <table className={styles.grid} style={{ width: `${scaledWidth(tableWidth)}` }}>
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
            {rows.map((row, index) => {
              const blank = isBlankLedgerRow(row);
              return (
                <tr
                  key={row.key}
                  className={[
                    index % 2 === 0 ? styles.rowOdd : styles.rowEven,
                    row.ledId !== "" && row.ledId === currentParty ? styles.rowActive : "",
                    row.isStale ? styles.rowStale : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  /*
                   * ONE handler for mouse and keyboard, so a click and an arrow
                   * key do the same thing. Double-click is deliberately NOT
                   * wired to the breakup: it is how a cell is opened for
                   * editing, and taking it over made the Qt screen answer "not a
                   * bill-wise party" where the operator wanted to type a figure.
                   */
                  onClick={() => onSelectRow(row)}
                  onFocus={() => onSelectRow(row)}
                >
                  {visible.map((column) => (
                    <td key={column.key} className={ALIGN_CLASS[column.align]}>
                      {renderCell(column, row)}
                    </td>
                  ))}
                  <td className={styles.rowActionCell}>
                    {!blank && editable ? (
                      <button
                        type="button"
                        className={styles.rowRemove}
                        title={`Remove "${row.ledName}" from this set`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveRow(row.key);
                        }}
                      >
                        −
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
