"use client";

/**
 * THE ROWS — the Qt `PurchaseReturnEntry` grid as the mockup draws it:
 * # Item Batch·Exp Bucket Billed Returned Qty Rate Value GST Outcome Reason
 * Credit to Writes. One row = one source line of the bill / GRN, one outcome.
 *
 * Cells that open on a draft: Qty (typed, boxed), Outcome (boxed, primary
 * border when not Return), Reason (boxed pick-list, the PURCHASE_RETURN set),
 * Bucket (a pick-list when the line brought more than one holding) and Credit
 * to on a claim row (who the claim is on). Bucket is amber when DAMAGED, a
 * claim's Credit to amber, Replace's blue, a destroyed row's Writes red. The
 * blank row under the lines carries the prompt.
 *
 * Keys: Enter walks Qty → Outcome → Reason → the next row's Qty (Qt
 * `setFocusStops`); ↑ / ↓ keep the column; + splits the row's bill line into
 * another outcome, − drops the row (Alt+= / Alt+− too); Tab leaves the grid.
 * F12 (the screen's) picks the row's exact lot.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { focusCell, moveCellFocus } from "@/features/sales/quotation/components/grid-focus";
import { GRID_FIELD_ATTR, GRID_FOCUS_STOP_ATTR, GRID_GRID_ATTR, GRID_ROW_ATTR } from "@/features/sales/quotation/quotation.constants";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { purchaseFigureClass } from "../../shared/components/purchase-parts";
import { money, qtyText } from "../../shared/purchase.format";
import {
  BUCKET_DAMAGED,
  ENTER_STOPS,
  LINE_GRID_NAME,
  OUTCOME_TEXT,
  PROMPT_ROW,
  RETURN_COLUMNS,
  type ClaimParty,
  type OutcomeCode,
  type ReturnColumn,
} from "../return.constants";
import { batchExpText, bucketChoices, CLAIM_CREDIT_CHOICES, consequenceOf, isClaim, outcomeChoices, rowQty } from "../return.state";
import type { ReasonOption, ReturnDraft, ReturnRow } from "../return.types";
import styles from "../page.module.scss";

const QTY_PATTERN = /^\d*(\.\d{0,3})?$/;

/** The viewport's marker — what Tab leaves and what a read-only document focuses. */
export const RETURN_GRID_VIEWPORT_ATTR = "data-purchase-return-viewport";

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const TOTAL_WEIGHT = 3 + RETURN_COLUMNS.reduce((sum, column) => sum + column.weight, 0);

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

/** The row's Qty, else the first Qty, else the viewport. */
export function focusReturnGrid(rowKey?: string): boolean {
  if (rowKey && focusCell(LINE_GRID_NAME, rowKey, "qty")) {
    return true;
  }
  const first = document.querySelector<HTMLElement>(`[${GRID_GRID_ATTR}="${LINE_GRID_NAME}"][${GRID_FIELD_ATTR}="qty"]`);
  if (first) {
    first.focus();
    return true;
  }
  const viewport = document.querySelector<HTMLElement>(`[${RETURN_GRID_VIEWPORT_ATTR}]`);
  viewport?.focus();
  return Boolean(viewport);
}

function cellAttrs(row: ReturnRow, column: ReturnColumn) {
  return {
    [GRID_GRID_ATTR]: LINE_GRID_NAME,
    [GRID_ROW_ATTR]: row.key,
    [GRID_FIELD_ATTR]: column,
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
      {...cellAttrs(row, "qty")}
      className={cx(quotationStyles.cellInput, quotationStyles.alignRight, styles.boxed)}
      value={text}
      placeholder={row.returnable !== null ? qtyText(row.returnable) : ""}
      title={row.returnable !== null ? `The qty going back, in ${row.unitName || "the bill's unit"} — ${qtyText(row.returnable)} can still go` : "The qty going back"}
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
  boxed,
  primary,
  muted,
  placeholder,
  onActive,
  onPick,
}: {
  row: ReturnRow;
  column: ReturnColumn;
  value: string;
  choices: readonly { value: string; label: string }[];
  title?: string;
  boxed?: boolean;
  primary?: boolean;
  muted?: boolean;
  placeholder?: string;
  onActive: () => void;
  onPick: (value: string) => void;
}) {
  const known = choices.some((choice) => choice.value === value);
  return (
    <select
      {...cellAttrs(row, column)}
      className={cx(quotationStyles.cellSelect, boxed && styles.boxed, primary && styles.boxedPrimary, muted && purchaseFigureClass("muted"))}
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
      {placeholder !== undefined && !value ? <option value="">{placeholder}</option> : null}
      {known || !value ? null : <option value={value}>{value}</option>}
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
}

export type ReturnLineGridProps = {
  draft: ReturnDraft;
  editable: boolean;
  /** The PURCHASE_RETURN reasons; null = not read yet. */
  reasons: readonly ReasonOption[] | null;
  /** The row the cursor is on (F12 acts on it). */
  activeKey: string | null;
  onActiveRow: (key: string) => void;
  onQty: (key: string, raw: string) => void;
  onOutcome: (key: string, outcome: OutcomeCode) => void;
  onBucket: (key: string, bucket: string) => void;
  onClaimOn: (key: string, claimOn: ClaimParty) => void;
  onReason: (key: string, reasonId: string, reasonName: string) => void;
  onSplit: (key: string) => void;
  onRemove: (key: string) => void;
};

export function ReturnLineGrid(props: ReturnLineGridProps) {
  const { draft, editable, reasons, activeKey, onActiveRow, onQty, onOutcome, onBucket, onClaimOn, onReason, onSplit, onRemove } = props;
  const outcomes = outcomeChoices(draft.kind).map((code) => ({ value: code, label: OUTCOME_TEXT[code] }));
  const reasonChoices = (reasons ?? []).map((reason) => ({ value: reason.id, label: reason.name }));
  const noReasons = reasons !== null && reasons.length === 0;

  /** ↑ / ↓ — the same column one row up or down (a select keeps its own arrows). */
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
      focusCell(LINE_GRID_NAME, next.key, "qty");
    }
    return true;
  };

  const cellText = (value: string, align?: "right", className?: string, title?: string) => (
    <div className={cx(quotationStyles.cellText, align === "right" && quotationStyles.alignRight, className)} title={title}>
      {value || " "}
    </div>
  );

  const renderCell = (row: ReturnRow, column: ReturnColumn) => {
    const active = () => onActiveRow(row.key);
    const typed = rowQty(row) > 0;
    const effect = consequenceOf(draft.kind, row);
    switch (column) {
      case "item":
        return cellText(row.itemName, undefined, undefined, `Bill line ${row.srcLineNo} · ${row.unitName}`);
      case "batch":
        return cellText(
          batchExpText(row),
          undefined,
          undefined,
          `Lot ${row.batchNo || "—"} · MRP ${row.mrp ? money(Number(row.mrp)) : "—"} — F12 picks the exact lot`,
        );
      case "bucket": {
        const choices = bucketChoices(draft, row);
        const damaged = row.bucket === BUCKET_DAMAGED;
        return editable && choices.length > 1 ? (
          <ChoiceCell
            row={row}
            column={column}
            value={row.bucket}
            choices={choices.map((choice) => ({ value: choice, label: choice }))}
            title="The holding the goods leave from"
            onActive={active}
            onPick={(value) => onBucket(row.key, value)}
          />
        ) : (
          cellText(row.bucket, undefined, damaged ? purchaseFigureClass("warn") : undefined)
        );
      }
      case "billed":
        return cellText(row.billed, "right");
      case "returned":
        return cellText(row.returned === null ? "" : qtyText(row.returned), "right");
      case "qty":
        return editable ? <QtyCell row={row} onActive={active} onCommit={(raw) => onQty(row.key, raw)} /> : cellText(row.qty, "right");
      case "rate":
        return cellText(money(row.rate), "right");
      case "value":
        return cellText(typed && row.value !== null ? money(row.value) : "", "right");
      case "gst":
        return cellText(typed && row.tax !== null ? money(row.tax) : "", "right", undefined, `GST ${qtyText(row.gstPct)} %`);
      case "outcome":
        return editable ? (
          <ChoiceCell
            row={row}
            column={column}
            value={row.outcome}
            choices={outcomes}
            boxed
            primary={row.outcome !== "RETURN"}
            title={
              draft.kind === "AGAINST_GRN"
                ? "Goods not billed yet can only be returned — claim after the bill"
                : "Return (a debit note) · Claim — goods sent / destroyed here · Replace (the same goods are due back)"
            }
            onActive={active}
            onPick={(value) => onOutcome(row.key, value as OutcomeCode)}
          />
        ) : (
          cellText(OUTCOME_TEXT[row.outcome])
        );
      case "reason":
        return editable ? (
          <ChoiceCell
            row={row}
            column={column}
            value={row.reasonId}
            choices={reasonChoices}
            boxed
            muted={!row.reasonId}
            placeholder="pick…"
            title={noReasons ? "No purchase-return reasons in Stock Reasons yet (menu 293)." : "Why it goes back — Stock Reasons (menu 293)"}
            onActive={active}
            onPick={(value) => onReason(row.key, value, reasonChoices.find((choice) => choice.value === value)?.label ?? "")}
          />
        ) : (
          cellText(row.reasonName)
        );
      case "creditTo": {
        const tone = effect.creditTone === "warn" ? purchaseFigureClass("warn") : effect.creditTone === "info" ? styles.toneInfo : undefined;
        const tip =
          row.creditName ||
          (isClaim(row.outcome)
            ? row.claimOn === "SUPPLIER" || !row.claimOn
              ? `Claim on ${draft.supplierName || "the supplier"} — settled on Supplier dues`
              : `Claim on ${draft.claimPartyName || "the transporter / insurer"} — name the ledger in Claim on`
            : undefined);
        return editable && isClaim(row.outcome) && draft.kind !== "AGAINST_GRN" ? (
          <ChoiceCell
            row={row}
            column={column}
            value={row.claimOn || "SUPPLIER"}
            choices={CLAIM_CREDIT_CHOICES}
            title={tip}
            onActive={active}
            onPick={(value) => onClaimOn(row.key, value as ClaimParty)}
          />
        ) : (
          cellText(effect.creditTo, undefined, tone, tip)
        );
      }
      case "writes":
        return cellText(effect.writes, undefined, purchaseFigureClass(effect.writesTone), row.writesTip || undefined);
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
    >
      <table className={cx(quotationStyles.grid, styles.lineGrid)}>
        <colgroup>
          <col style={{ width: `${(3 / TOTAL_WEIGHT) * 100}%` }} />
          {RETURN_COLUMNS.map((column) => (
            <col key={column.key} style={{ width: `${(column.weight / TOTAL_WEIGHT) * 100}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">#</th>
            {RETURN_COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={column.align === "right" ? quotationStyles.alignRight : undefined}>
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {draft.rows.map((row, index) => (
            <tr
              key={row.key}
              className={cx(index % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven, row.key === activeKey && styles.selectedRow)}
              onMouseDown={() => onActiveRow(row.key)}
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
              <td>{cellText(String(index + 1), "right")}</td>
              {RETURN_COLUMNS.map((column) => (
                <td key={column.key}>{renderCell(row, column.key)}</td>
              ))}
            </tr>
          ))}
          {editable ? (
            <tr className={styles.promptRow}>
              <td />
              <td colSpan={RETURN_COLUMNS.length} className={styles.promptCell}>
                {PROMPT_ROW}
              </td>
            </tr>
          ) : null}
          {!editable && draft.rows.length === 0 ? (
            <tr>
              <td colSpan={RETURN_COLUMNS.length + 1} className={styles.emptyCell}>
                Nothing on this return.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
