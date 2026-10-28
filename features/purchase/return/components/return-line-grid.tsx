"use client";

/**
 * The return's line grid — ui_table 59, the Qt `NexTable` + the purchase line
 * delegate with its combo cells (Qt 8ca6ff3). One row = one source line of the
 * bill / GRN, one outcome.
 *
 * Cells that open on a draft: Qty (typed), Outcome, From (the holding) and
 * Claim On (only on a claim row) as pick-lists. Everything else is the bill's.
 * Keys: Enter walks Qty → Outcome → the next row's Qty (Qt
 * `setFocusStops({ Qty, Outcome })`); ↑ / ↓ keep the column and change the row;
 * + splits the row's bill line into another outcome, − drops the row (Alt+= /
 * Alt+− too); Tab leaves the grid.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { focusCell, moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import {
  GRID_FIELD_ATTR,
  GRID_FOCUS_STOP_ATTR,
  GRID_GRID_ATTR,
  GRID_ROW_ATTR,
} from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { money, qtyText } from "../../shared/purchase.format";
import { CLAIM_PARTIES, COL, ENTER_STOPS, LINE_GRID_NAME, type ClaimParty, type OutcomeText } from "../return.constants";
import type { GridColumn } from "../return.columns";
import { bucketChoices, isClaim, outcomeChoices } from "../return.state";
import type { ReturnDraft, ReturnRow } from "../return.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^\d*(\.\d{0,3})?$/;

/** The viewport's marker — what Tab leaves and what a read-only document focuses. */
export const RETURN_GRID_VIEWPORT_ATTR = "data-purchase-return-viewport";

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab — leave the grid: the next focusable thing after the viewport (the cell commits on blur). */
function leaveGrid(from: HTMLElement, forward: boolean): boolean {
  const viewport = from.closest<HTMLElement>(`[${RETURN_GRID_VIEWPORT_ATTR}]`);
  if (!viewport) {
    return false;
  }
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => element.tabIndex >= 0 && !viewport.contains(element) && element.getClientRects().length > 0,
  );
  const target = forward
    ? candidates.find((element) => (viewport.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
    : [...candidates].reverse().find((element) => (viewport.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING) !== 0);
  if (!target) {
    return false;
  }
  target.focus();
  return true;
}

/** The first row's Qty, else the viewport. */
export function focusReturnGrid(rowKey?: string): boolean {
  if (rowKey && focusCell(LINE_GRID_NAME, rowKey, String(COL.Qty))) {
    return true;
  }
  const first = document.querySelector<HTMLElement>(
    `[${GRID_GRID_ATTR}="${LINE_GRID_NAME}"][${GRID_FIELD_ATTR}="${COL.Qty}"]`,
  );
  if (first) {
    first.focus();
    return true;
  }
  const viewport = document.querySelector<HTMLElement>(`[${RETURN_GRID_VIEWPORT_ATTR}]`);
  viewport?.focus();
  return Boolean(viewport);
}

function cellAttrs(row: ReturnRow, column: number) {
  return {
    [GRID_GRID_ATTR]: LINE_GRID_NAME,
    [GRID_ROW_ATTR]: row.key,
    [GRID_FIELD_ATTR]: String(column),
    ...(ENTER_STOPS.includes(column) ? { [GRID_FOCUS_STOP_ATTR]: "true" } : {}),
  };
}

/** + / − as line keys: no cell here types either, so bare keys work too; Alt+= / Alt+− by the physical key. */
function lineKeyOf(event: ReactKeyboardEvent): "add" | "remove" | null {
  if (event.ctrlKey || event.metaKey) {
    return null;
  }
  if (event.altKey) {
    if (event.key === "=" || event.key === "+" || event.code === "Equal" || event.code === "NumpadAdd") {
      return "add";
    }
    return event.key === "-" || event.code === "Minus" || event.code === "NumpadSubtract" ? "remove" : null;
  }
  if (event.key === "+") {
    return "add";
  }
  return event.key === "-" || event.key === "−" ? "remove" : null;
}

/** The typed Qty: edits a local copy, commits on Enter or on leaving it. */
function QtyCell({ row, onActive, onCommit }: { row: ReturnRow; onActive: () => void; onCommit: (raw: string) => void }) {
  const [text, setText] = useState(row.qty);
  const [focused, setFocused] = useState(false);
  const committed = useRef(row.qty);
  // Enter commits and then moves focus, so the old cell's blur would run against
  // a stale closure and commit again; the ref keeps that to one write.
  const textRef = useRef(row.qty);

  useEffect(() => {
    if (!focused) {
      setText(row.qty);
      textRef.current = row.qty;
      committed.current = row.qty;
    }
  }, [focused, row.qty]);

  const commit = () => {
    if (textRef.current !== committed.current) {
      committed.current = textRef.current;
      onCommit(textRef.current);
    }
  };

  return (
    <input
      {...cellAttrs(row, COL.Qty)}
      className={cx(quotationStyles.cellInput, quotationStyles.alignRight)}
      value={text}
      placeholder={row.returnable !== null ? qtyText(row.returnable) : ""}
      title="The qty going back, in the bill's unit"
      autoComplete="off"
      inputMode="decimal"
      data-uppercase="off"
      onFocus={(event) => {
        setFocused(true);
        onActive();
        event.currentTarget.select();
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (QTY_PATTERN.test(next)) {
          textRef.current = next;
          setText(next);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // The first Esc takes back what was typed; only an Esc with nothing to undo reaches the screen.
          if (textRef.current !== committed.current) {
            event.preventDefault();
            textRef.current = committed.current;
            setText(committed.current);
          }
          return;
        }
        if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          commit();
          moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
        }
      }}
    />
  );
}

/** A pick-list cell (the delegate's combo): every change commits at once. */
function ChoiceCell({
  row,
  column,
  value,
  choices,
  title,
  onActive,
  onPick,
}: {
  row: ReturnRow;
  column: number;
  value: string;
  choices: readonly string[];
  title?: string;
  onActive: () => void;
  onPick: (value: string) => void;
}) {
  return (
    <select
      {...cellAttrs(row, column)}
      className={quotationStyles.cellSelect}
      value={value}
      title={title}
      onFocus={onActive}
      onChange={(event) => onPick(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          moveCellFocus(LINE_GRID_NAME, event.currentTarget, event.shiftKey ? -1 : 1);
        }
      }}
    >
      {choices.includes(value) ? null : <option value={value}>{value}</option>}
      {choices.map((choice) => (
        <option key={choice} value={choice}>
          {choice}
        </option>
      ))}
    </select>
  );
}

export type ReturnLineGridProps = {
  draft: ReturnDraft;
  columns: GridColumn[];
  editable: boolean;
  /** Rows asked for more than their bill line can still give back. */
  overKeys: ReadonlySet<string>;
  onActiveRow: (key: string) => void;
  onQty: (key: string, raw: string) => void;
  onOutcome: (key: string, outcome: OutcomeText) => void;
  onBucket: (key: string, bucket: string) => void;
  onClaimOn: (key: string, claimOn: ClaimParty) => void;
  onSplit: (key: string) => void;
  onRemove: (key: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function ReturnLineGrid(props: ReturnLineGridProps) {
  const { draft, columns, editable, overKeys, onActiveRow, onQty, onOutcome, onBucket, onClaimOn, onSplit, onRemove, onContextMenu } =
    props;
  const outcomes = outcomeChoices(draft);

  /** ↑ / ↓ — the same column one row up or down (a select keeps its own arrows unless Alt is up). */
  const onRowArrow = (event: ReactKeyboardEvent<HTMLTableRowElement>, index: number): boolean => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return false;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }
    const target = event.target as HTMLElement;
    if (target instanceof HTMLSelectElement) {
      return false;
    }
    const field = target.getAttribute(GRID_FIELD_ATTR);
    if (!field) {
      return false;
    }
    event.preventDefault();
    const next = draft.rows[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next && !focusCell(LINE_GRID_NAME, next.key, field)) {
      focusCell(LINE_GRID_NAME, next.key, String(COL.Qty));
    }
    return true;
  };

  const text = (value: string, align?: "right" | "center", className?: string, title?: string) => (
    <div
      className={cx(
        quotationStyles.cellText,
        align === "right" && quotationStyles.alignRight,
        align === "center" && quotationStyles.alignCenter,
        className,
      )}
      title={title}
    >
      {value || " "}
    </div>
  );

  const renderCell = (row: ReturnRow, no: number) => {
    const active = () => onActiveRow(row.key);
    switch (no) {
      case COL.SrcLine:
        return text(row.srcLineNo, "center");
      case COL.Item:
        return text(row.itemName, undefined, undefined, row.itemName);
      case COL.Unit:
        return text(row.unitName);
      case COL.Batch:
        return text(row.batchNo);
      case COL.Bucket: {
        const choices = bucketChoices(draft, row);
        return editable && choices.length > 1 ? (
          <ChoiceCell
            row={row}
            column={no}
            value={row.bucket}
            choices={choices}
            title="The holding the goods leave from"
            onActive={active}
            onPick={(value) => onBucket(row.key, value)}
          />
        ) : (
          text(row.bucket)
        );
      }
      case COL.Returnable:
        return text(row.returnable === null ? "" : qtyText(row.returnable), "right");
      case COL.Qty:
        return editable ? (
          <QtyCell row={row} onActive={active} onCommit={(raw) => onQty(row.key, raw)} />
        ) : (
          text(row.qty, "right")
        );
      case COL.Outcome:
        return editable ? (
          <ChoiceCell
            row={row}
            column={no}
            value={row.outcome}
            choices={outcomes}
            title={
              draft.kind === "AGAINST_GRN"
                ? "Goods not yet billed can only be RETURNED — claim after the bill"
                : "RETURN (a debit note) · CLAIM SENT / CLAIM DESTROYED (a claim) · REPLACE (the same goods are due back)"
            }
            onActive={active}
            onPick={(value) => onOutcome(row.key, value as OutcomeText)}
          />
        ) : (
          text(row.outcome)
        );
      case COL.ClaimOn:
        return editable && isClaim(row.outcome) ? (
          <ChoiceCell
            row={row}
            column={no}
            value={row.claimOn || "SUPPLIER"}
            choices={CLAIM_PARTIES}
            title="TRANSPORTER / INSURER: the ledger picked under Claim on (other)"
            onActive={active}
            onPick={(value) => onClaimOn(row.key, value as ClaimParty)}
          />
        ) : (
          text(row.claimOn)
        );
      case COL.Rate:
        return text(money(row.rate), "right");
      case COL.GstPct:
        return text(qtyText(row.gstPct), "right");
      case COL.Value:
        return text(row.value === null ? "" : money(row.value), "right");
      case COL.Tax:
        return text(row.tax === null ? "" : money(row.tax), "right");
      case COL.Total:
        return text(row.total === null ? "" : money(row.total), "right");
      default:
        return null;
    }
  };

  return (
    <div
      className={cx(quotationStyles.gridViewport, styles.gridViewport)}
      {...{ [RETURN_GRID_VIEWPORT_ATTR]: "true" }}
      // Focusable from script only: a read-only document puts its cursor here.
      tabIndex={-1}
      onContextMenu={onContextMenu}
    >
      <table className={cx(quotationStyles.grid, styles.lineGrid)}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.no} style={{ width: `${column.widthPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.no} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.rows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(1, columns.length)} className={styles.emptyCell}>
                {draft.srcDocId ? "Nothing on this document can go back." : "The bill's lines come in here once it is picked."}
              </td>
            </tr>
          ) : null}
          {draft.rows.map((row, index) => {
            const over = overKeys.has(row.key);
            return (
              <tr
                key={row.key}
                className={cx(index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven, over && styles.problemRow)}
                title={over ? "More than this bill line can still give back — the server will refuse it." : undefined}
                onKeyDown={(event) => {
                  if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                    if (leaveGrid(event.target as HTMLElement, !event.shiftKey)) {
                      event.preventDefault();
                    }
                    return;
                  }
                  if (onRowArrow(event, index)) {
                    return;
                  }
                  if (!editable) {
                    return;
                  }
                  const which = lineKeyOf(event);
                  if (!which) {
                    return;
                  }
                  event.preventDefault();
                  if (which === "add") {
                    onSplit(row.key);
                  } else {
                    onRemove(row.key);
                  }
                }}
              >
                {columns.map((column) => (
                  <td key={column.no}>{renderCell(row, column.no)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
