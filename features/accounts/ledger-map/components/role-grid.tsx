"use client";

/**
 * The posting roles — `ui_tables` 37, "LEDGER MAP - POSTING ROLES".
 *
 * ONE SCREEN, NO LIST PAGE, NO ENTRY DIALOG. An operator comparing SALES with
 * SALES_RETURN wants both on screen, not one modal at a time — so the ledger is
 * edited in the row and there is nothing else.
 *
 * Two editable cells out of seven: Ledger and Remarks. Everything else is the
 * role catalogue describing itself, and none of it is this screen's to change.
 * There are no line keys either: the row set is the server's catalogue, and
 * nothing here may look like it can add to it.
 *
 * A row that does not resolve is LOUD — tinted amber across its full width,
 * because an unmapped role does not fail when it is saved; it fails months
 * later, at the moment money is being taken.
 */
import { useMemo, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import {
  FIELD_ATTR,
  FOCUS_STOP_ATTR,
  GRID_ATTR,
  ROW_ATTR,
  focusRow,
  moveCellFocus,
  moveRowFocus,
} from "@/features/accounts/opening-balance/components/grid-focus";
import type { ResolvedRoleColumn } from "../columns";
import { doesNotResolve, groupLabel, isMapped, needsLabel, statusOf, usedByLabel } from "../domain";
import type { LedgerMapRow, LedgerMapStatus } from "../ledger-map.types";
import styles from "../page.module.scss";

export const ROLE_GRID_NAME = "ledger-map-roles";

/** alm_remarks is varchar(250); a longer one is a 400 quoting a column width. */
const REMARKS_MAX_LENGTH = 250;

const ALIGN_CLASS: Record<string, string> = {
  left: "",
  right: styles.alignRight,
  center: styles.alignCenter,
};

/**
 * Red for the two states where a posting will fail on a pick, amber for a row
 * switched off, green for the one quiet state.
 */
const STATUS_CHIP: Record<LedgerMapStatus, string> = {
  Mapped: styles.chipGood,
  "Not mapped": styles.chipBad,
  "Ledger gone": styles.chipBad,
  Off: styles.chipWarn,
};

const STATUS_TITLE: Record<LedgerMapStatus, string> = {
  Mapped: "Resolves — postings for this role land on this ledger.",
  "Not mapped": "No ledger — anything that posts this role is refused until one is picked.",
  Off: "The mapping exists but is switched off, so it resolves to nothing.",
  "Ledger gone":
    "The ledger this role points at has been deleted or deactivated. Pick a different one.",
};

/** A key that types a character, and so starts a search in the picker. */
function isPrintable(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export type RoleGridProps = {
  columns: ResolvedRoleColumn[];
  rows: LedgerMapRow[];
  dirtyRoles: ReadonlySet<string>;
  /** The row Alt+U acts on — the one the caret was last in. */
  currentRole: string | null;
  editable: boolean;
  loading: boolean;
  onCurrentRoleChange: (role: string) => void;
  onOpenPicker: (role: string, initialSearch: string) => void;
  onSetRemarks: (role: string, remarks: string) => void;
  resizingKey: string | null;
  onColumnResizeStart: (event: ReactMouseEvent<HTMLElement>, columnKey: string) => void;
  /** Right-click: "save column width" and "Admin settings". */
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function RoleGrid(props: RoleGridProps) {
  const {
    columns,
    rows,
    dirtyRoles,
    currentRole,
    editable,
    loading,
    onCurrentRoleChange,
    onOpenPicker,
    onSetRemarks,
    resizingKey,
    onColumnResizeStart,
    onContextMenu,
  } = props;

  const visible = useMemo(() => columns.filter((column) => column.visible), [columns]);
  const tableWidth = useMemo(() => totalColumnWidth(visible), [visible]);

  /**
   * Keys every cell shares. Handled HERE, not on the window, so a press can mean
   * one thing in a cell and another outside it.
   *
   *   Enter / Shift+Enter   Ledger → Remarks → the next row's Ledger
   *   ↑ / ↓                 one row, same column
   */
  const onCellKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      moveCellFocus(ROLE_GRID_NAME, event.target, event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveRowFocus(ROLE_GRID_NAME, event.target, event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const renderCell = (column: ResolvedRoleColumn, row: LedgerMapRow) => {
    const cellProps = {
      [GRID_ATTR]: ROLE_GRID_NAME,
      [ROW_ATTR]: row.role,
      [FIELD_ATTR]: column.key,
      ...(column.focus ? { [FOCUS_STOP_ATTR]: "" } : {}),
    };
    const status = statusOf(row);

    switch (column.key) {
      case "role":
        return (
          <span className={styles.cellText} title={`${row.label} — ${row.role}`}>
            {row.label}
            {dirtyRoles.has(row.role) ? (
              <span className={styles.dirtyDot} title="Changed — not saved yet" aria-label="changed">
                ●
              </span>
            ) : null}
          </span>
        );

      case "group":
        return <span className={cx(styles.chip, styles.chipNeutral)}>{groupLabel(row.group)}</span>;

      case "ledger":
        /*
         * READ-ONLY, never disabled: a disabled cell drops out of the keyboard
         * walk. It is a picker cell — typing in it opens the picker with that
         * keystroke as the search, which is how the desktop screen behaved.
         *
         * An em-dashed placeholder, not a blank: a blank cell reads as "nothing
         * to say here", and this one is the failure the screen exists to show.
         */
        return (
          <div className={styles.lookupCell}>
            <input
              {...cellProps}
              className={cx(
                styles.cellInput,
                styles.cellInputPlain,
                !isMapped(row) && styles.ledgerUnmapped,
                status === "Ledger gone" && styles.ledgerGone,
              )}
              readOnly
              value={row.ledgerName}
              placeholder="— not mapped —"
              title={
                status === "Mapped"
                  ? `${row.ledgerName} — type, F4 or double-click to pick another`
                  : STATUS_TITLE[status]
              }
              onKeyDown={(event) => {
                if (editable) {
                  const opens =
                    event.key === "F4" ||
                    (event.altKey && event.key === "ArrowDown") ||
                    // Enter on a row with no ledger has nothing to step past:
                    // picking one is the only thing to do there.
                    (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !isMapped(row));
                  if (opens) {
                    event.preventDefault();
                    onOpenPicker(row.role, "");
                    return;
                  }
                  if (isPrintable(event)) {
                    event.preventDefault();
                    onOpenPicker(row.role, event.key === " " ? "" : event.key);
                    return;
                  }
                }
                onCellKeyDown(event);
              }}
              onDoubleClick={() => {
                if (editable) {
                  onOpenPicker(row.role, "");
                }
              }}
            />
            {editable ? (
              <button
                type="button"
                className={styles.lookupButton}
                // Out of the tab order: the cell itself opens the picker, and a
                // second stop per row would double every Tab.
                tabIndex={-1}
                title="Pick a ledger (F4)"
                aria-label={`Pick a ledger for ${row.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCurrentRoleChange(row.role);
                  onOpenPicker(row.role, "");
                }}
              >
                ▾
              </button>
            ) : null}
          </div>
        );

      case "needs":
        return <span className={styles.cellText}>{needsLabel(row)}</span>;

      case "usedby":
        return (
          <span className={cx(styles.cellText, row.usedBy.length === 0 && styles.cellMuted)}>
            {usedByLabel(row.usedBy)}
          </span>
        );

      case "status":
        return (
          <span className={cx(styles.chip, STATUS_CHIP[status])} title={STATUS_TITLE[status]}>
            {status}
          </span>
        );

      case "remarks":
        return (
          <input
            {...cellProps}
            className={styles.cellInput}
            value={row.remarks}
            maxLength={REMARKS_MAX_LENGTH}
            disabled={!editable}
            onChange={(event) => onSetRemarks(row.role, event.target.value)}
            onKeyDown={onCellKeyDown}
            // A long remark typed to its end stays scrolled there after the
            // caret leaves, and reads as a lone ellipsis; show its start again.
            onBlur={(event) => {
              event.currentTarget.scrollLeft = 0;
            }}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.gridShell} onContextMenu={onContextMenu}>
      <div className={styles.gridHead}>
        <span className={styles.gridHeadTitle}>The posting roles</span>
        <span className={styles.gridHeadNote}>
          {rows.length} role(s) · one ledger each, shared by every company
        </span>
      </div>
      <div className={styles.gridViewport}>
        <table className={styles.grid} style={{ width: scaledWidth(tableWidth) }}>
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(1, visible.length)} className={styles.gridEmpty}>
                  {loading ? "Loading the posting roles…" : "The server lists no posting roles."}
                </td>
              </tr>
            ) : null}
            {rows.map((row, index) => (
              <tr
                key={row.role}
                className={cx(
                  index % 2 === 0 ? styles.rowOdd : styles.rowEven,
                  doesNotResolve(row) && styles.rowLoud,
                  dirtyRoles.has(row.role) && styles.rowDirty,
                  row.role === currentRole && styles.rowCurrent,
                )}
                /*
                 * A click on a read-out (Group, Needs, a chip) focuses nothing,
                 * so it also puts the caret on the row — ↑/↓ need a cell to step
                 * from, and Alt+U needs a row to act on.
                 */
                onClick={(event) => {
                  onCurrentRoleChange(row.role);
                  if (!event.currentTarget.contains(document.activeElement)) {
                    focusRow(ROLE_GRID_NAME, row.role);
                  }
                }}
                onFocus={() => onCurrentRoleChange(row.role)}
              >
                {visible.map((column) => (
                  <td key={column.key} className={ALIGN_CLASS[column.align]}>
                    {renderCell(column, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
