"use client";
/**
 * One party's open items on As on (plan §9): both sides, the server's order
 * (bill date, then number), its Total row, and the ledger check.
 *
 * The check compares the bills' net with the party ledger's closing, as
 * strings, and a mismatch is shown in red — never hidden: it is a posting that
 * moved one without the other. Clicking it opens the Ledger Statement.
 *
 * Keys: ↑/↓ move, Enter / double-click open the bill's document, Alt+F1 (or
 * the ▾) shows what settled it, Esc / ← go back to the party grid.
 */
import { type KeyboardEvent, type MutableRefObject } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import { formatAmount } from "@/features/reports/shared/wire/money";
import { billCells, ledgerCheck, netCell, type GridContext } from "../view/cells";
import type { BillRow, BillsPayload } from "../wire/types";
import { ChipView } from "./chips";
import { BILL_COLUMNS, minWidth, template } from "./grid-columns";
import { toneClass } from "./tone";

const GRID = template(BILL_COLUMNS);
const MIN_WIDTH = minWidth(BILL_COLUMNS);
const HEADINGS: Array<[string, boolean]> = [
  ["Date", false],
  ["Type", false],
  ["Bill no", false],
  ["Branch", false],
  ["Due", false],
  ["Bill amt", true],
  ["Adjusted", true],
  ["Pending", true],
  ["Age", true],
  ["Overdue", true],
  ["Remarks", false],
];

type Props = {
  bills: BillsPayload;
  ctx: GridContext;
  focusedBillId: string | null;
  onFocusBill: (billId: string | null) => void;
  onDrill: (row: BillRow) => void;
  onHistory: (row: BillRow, anchor: HTMLElement) => void;
  onBack: () => void;
  onLedger: () => void;
  viewportRef: MutableRefObject<HTMLDivElement | null>;
};

export function BillsGrid({ bills, ctx, focusedBillId, onFocusBill, onDrill, onHistory, onBack, onLedger, viewportRef }: Props) {
  const rows = bills.rows;
  const focusIndex = rows.findIndex((row) => row.billId === focusedBillId);
  const check = ledgerCheck(bills.totals.net, bills.ledgerClosing);
  const net = netCell(bills.totals.net, ctx.side);

  const rowElement = (billId: string) =>
    viewportRef.current?.querySelector<HTMLElement>(`[data-bill-id="${CSS.escape(billId)}"]`) ?? null;

  const moveTo = (index: number) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    onFocusBill(row.billId);
    rowElement(row.billId)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return;
    const row = focusIndex >= 0 ? rows[focusIndex] : undefined;
    if (event.altKey) {
      if (event.key === "F1" && row) {
        event.preventDefault();
        const element = rowElement(row.billId);
        if (element) onHistory(row, element);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(focusIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveTo(focusIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(rows.length - 1);
        break;
      case "Enter":
        if (row) {
          event.preventDefault();
          onDrill(row);
        }
        break;
      case "Escape":
      case "ArrowLeft":
        event.preventDefault();
        event.stopPropagation();
        onBack();
        break;
      default:
    }
  };

  return (
    <div
      ref={viewportRef}
      className={styles.gridViewport}
      tabIndex={0}
      role="grid"
      aria-label="Open bills"
      onKeyDown={onKeyDown}
      onFocus={() => {
        if (focusIndex < 0 && rows[0]) onFocusBill(rows[0].billId);
      }}
    >
      <div className={styles.gridTable} style={{ minWidth: MIN_WIDTH }}>
        <div className={styles.gridHead} style={{ gridTemplateColumns: GRID }} role="row">
          {HEADINGS.map(([label, num]) => (
            <div key={label} className={cx(num && styles.num)} role="columnheader">
              {label}
            </div>
          ))}
        </div>
        {rows.map((row) => {
          const c = billCells(row, ctx);
          const focused = row.billId === focusedBillId;
          return (
            <div
              key={`${row.accYear}|${row.billId}`}
              className={cx(styles.gridRow, focused && styles.rowFocused)}
              style={{ gridTemplateColumns: GRID }}
              role="row"
              aria-selected={focused}
              data-bill-id={row.billId}
              onMouseDown={() => onFocusBill(row.billId)}
              onDoubleClick={() => onDrill(row)}
            >
              <div>{c.date}</div>
              <div>
                <ChipView chip={c.chip} />
              </div>
              <div title={c.refno}>
                {c.refno}{" "}
                <button
                  type="button"
                  className={styles.rowToggle}
                  tabIndex={-1}
                  title="What settled this bill (Alt+F1)"
                  aria-label={`What settled ${c.refno}`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    onFocusBill(row.billId);
                    const element = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-bill-id]");
                    if (element) onHistory(row, element);
                  }}
                >
                  ▾
                </button>
              </div>
              <div title={c.branch}>{c.branch}</div>
              <div className={cx(toneClass(c.due.tone), c.due.italic && styles.italic)} title={c.due.title}>
                {c.due.text}
              </div>
              <div className={styles.num}>{c.billAmount}</div>
              <div className={cx(styles.num, styles.tMuted)}>{c.adjusted}</div>
              <div className={cx(styles.num, styles.strong, toneClass(c.pending.tone))}>{c.pending.text}</div>
              <div className={cx(styles.num, toneClass(c.age.tone))}>{c.age.text}</div>
              <div className={cx(styles.num, toneClass(c.overdue.tone))}>{c.overdue.text}</div>
              <div className={styles.tMuted} title={c.remarks || undefined}>
                {c.remarks}
                {c.warning ? (
                  <span
                    className={styles.warnGlyph}
                    title={`Data fault flagged by the server: ${c.warning}. Worth a bug report.`}
                  >
                    ⚠
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <div className={styles.emptyState}>No open items on this date.</div>
        ) : (
          <div className={styles.gridTotal} style={{ gridTemplateColumns: GRID }} role="row">
            <div style={{ gridColumn: "1 / 6" }}>
              Total · {rows.length} open {rows.length === 1 ? "item" : "items"}
            </div>
            <div className={styles.num}>{formatAmount(bills.totals.billAmount)}</div>
            <div className={cx(styles.num, styles.tMuted)}>{formatAmount(bills.totals.adjusted)}</div>
            <div className={cx(styles.num, toneClass(net.tone))}>{net.text}</div>
            <div />
            <div style={{ gridColumn: "10 / 12" }}>
              {check.ok ? (
                <span className={styles.ledgerOk}>{check.text}</span>
              ) : (
                <button type="button" className={styles.ledgerBad} title={check.title} onClick={onLedger}>
                  {check.text}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
