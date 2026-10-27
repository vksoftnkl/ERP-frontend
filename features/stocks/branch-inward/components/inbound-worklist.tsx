"use client";

/**
 * ON THE WAY TO THIS BRANCH — the worklist (grid 186, one row per despatch).
 * A new receipt starts here, never from free entry: Enter (or double-click)
 * opens the selected despatch at the remainder. F5 refreshes (the entry view
 * binds the key).
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { toNumber, toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { money, qtyCell } from "../../stock-adjustment/stock-adjustment.format";
import { WORKLIST_HINT } from "../branch-inward.constants";
import type { InboundRow } from "../branch-inward.types";
import styles from "../page.module.scss";

const HEADERS = [
  "Despatch",
  "Date",
  "From branch",
  "From godown",
  "To godown",
  "Lines",
  "Still to come",
  "Value",
  "LR no",
  "Vehicle",
  "Expected",
  "Days",
  "State",
] as const;
const NUMERIC = new Set([5, 6, 7, 11]);

function cells(row: InboundRow): string[] {
  return [
    row.out_refno ?? "",
    toDisplayDate((row.out_date ?? "").slice(0, 10)),
    row.from_branch ?? "",
    row.from_godown ?? "",
    row.to_godown ?? "",
    String(toNumber(row.lines)),
    qtyCell(toNumber(row.remaining_qty)),
    money(toNumber(row.remaining_value)),
    row.lr_no ?? "",
    row.vehicle_no ?? "",
    row.expected_on ?? "",
    String(toNumber(row.days_in_flight)),
    row.transit_status ?? "",
  ];
}

export function InboundWorklist({
  rows,
  loaded,
  busy,
  onOpen,
  onRefresh,
}: {
  rows: readonly InboundRow[];
  loaded: boolean;
  busy: boolean;
  onOpen: (row: InboundRow) => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const viewport = useRef<HTMLDivElement | null>(null);
  const index = Math.min(selected, Math.max(rows.length - 1, 0));

  // The worklist is where the cursor starts (Qt showEvent focuses tblInbound);
  // the table only exists once a despatch is on the way, so this waits for one.
  const hasRows = rows.length > 0;
  useEffect(() => {
    if (hasRows) {
      viewport.current?.focus();
    }
  }, [hasRows]);

  const open = () => {
    const row = rows[index];
    if (row && !busy) {
      onOpen(row);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      open();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? rows.length - 1
            : Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), rows.length - 1);
      setSelected(next);
      viewport.current?.querySelectorAll("tbody tr")[next]?.scrollIntoView({ block: "nearest" });
    }
  };

  const title = !loaded
    ? "ON THE WAY TO THIS BRANCH — loading…"
    : rows.length === 0
      ? "ON THE WAY TO THIS BRANCH — nothing is in transit"
      : `ON THE WAY TO THIS BRANCH — ${rows.length} despatch${rows.length === 1 ? "" : "es"}`;

  return (
    <section className={styles.card} aria-label="Despatches on the way to this branch">
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <span className={styles.cardHint}>{WORKLIST_HINT}</span>
        <span className={styles.grow} />
        <button type="button" className={quotationStyles.button} disabled={busy} onClick={onRefresh}>
          Refresh · F5
        </button>
        <button
          type="button"
          className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
          disabled={busy || rows.length === 0}
          onClick={open}
        >
          Receive · Enter
        </button>
      </div>
      {rows.length > 0 ? (
        <div className={styles.worklistViewport} ref={viewport} tabIndex={0} onKeyDown={onKeyDown}>
          <table className={cx(quotationStyles.grid, styles.worklist)}>
            <thead>
              <tr>
                {HEADERS.map((header, column) => (
                  <th key={header} scope="col" className={NUMERIC.has(column) ? styles.num : undefined}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr
                  key={`${row.out_id ?? ""}:${rowIndex}`}
                  className={cx(
                    rowIndex % 2 === 0 ? quotationStyles.rowOdd : quotationStyles.rowEven,
                    rowIndex === index && styles.worklistSelected,
                  )}
                  aria-selected={rowIndex === index}
                  onClick={() => {
                    setSelected(rowIndex);
                    viewport.current?.focus();
                  }}
                  onDoubleClick={() => {
                    setSelected(rowIndex);
                    if (!busy) {
                      onOpen(row);
                    }
                  }}
                >
                  {cells(row).map((value, column) => (
                    <td key={HEADERS[column]} className={NUMERIC.has(column) ? styles.num : undefined}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
