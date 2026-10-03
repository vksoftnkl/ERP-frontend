"use client";

/**
 * The bill-wise card of a ONE-party voucher (the Qt `grpBillwise` while
 * keying): the party's open bills on the side its leg settles — a sale's
 * customer's credits, a purchase's supplier's advances, a note's party's
 * invoices — with what this voucher sets against each. Laid out by ui table
 * 40, as the popup is.
 *
 * A type that raises a bill (`RAISE`) raises one for the whole party leg —
 * the head says how much and when it falls due (the voucher date plus the
 * due days: the party's credit days unless typed) — and every figure here is
 * set against it; the rest stays open on it. A figure is never more than the
 * bill still owes.
 */
import { useState } from "react";
import receiptStyles from "@/features/accounts/receipt/page.module.scss";
import styles from "../vouchers.module.scss";
import { allocatedPaise, billLabel, pendingPaise, type BillRow } from "../domain/bills";
import { formatPaise, paiseText } from "../domain/lines";
import type { DerivedBill } from "../vouchers.types";
import { scaledWidth, totalColumnWidth } from "@/features/sales/quotation/quotation.utils";
import { BillTableHead, displayDate, useBillGrid } from "./billwise-dialog";
import { Box } from "./voucher-extras";

export type BillCardProps = {
  rows: readonly BillRow[];
  loading: boolean;
  hasParty: boolean;
  raisesBill: boolean;
  raiseBillType: string | null;
  /** The server's raised bill, when it has answered. */
  raised: DerivedBill | null;
  dueDays: number | null;
  /** The party's credit days, when read — the due days' default. */
  creditDays: number | null;
  readOnly: boolean;
  onDueDays: (days: number | null) => void;
  onFigure: (rows: readonly BillRow[], index: number, text: string) => void;
};

export function BillCard(props: BillCardProps) {
  const { rows, loading, hasParty, raisesBill, raiseBillType, raised, dueDays, creditDays, readOnly, onDueDays, onFigure } =
    props;
  const grid = useBillGrid("Bill-wise card");
  const columns = grid.columns;
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const allocated = allocatedPaise(rows);

  const head = raised
    ? `Raises a new ${raised.billType.toLowerCase()} bill of ${formatPaise(Math.round(raised.amount * 100))}${
        raised.dueDate ? `, due ${displayDate(raised.dueDate)}` : ""
      }.`
    : raisesBill
      ? `The part not set against a bill below raises a new ${(raiseBillType ?? "").toLowerCase()} bill.`
      : "Set the party's open bills against this voucher.";

  const commit = (index: number, text: string) => {
    setEditing(null);
    onFigure(rows, index, text);
  };

  // Qt's lblBillHint: nothing until there is a party, then why the table is empty.
  const hint = !hasParty || rows.length > 0 ? "" : loading ? "Reading the party's bills…" : "No open bills on the side this leg settles.";

  return (
    <Box
      title="Bill-wise"
      hint={hint}
      framed
      header={
        <div className={styles.billHead}>
          <span className={styles.billHeadText}>{head}</span>
          {raisesBill ? (
            <label className={styles.checkRow}>
              Due days
              <input
                className={`${receiptStyles.input} ${styles.dueDays}`}
                type="number"
                min={0}
                max={3650}
                value={dueDays ?? ""}
                placeholder={creditDays !== null ? String(creditDays) : ""}
                disabled={readOnly}
                title="Days after the voucher date the raised bill falls due — the party's credit days unless typed."
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const days = Number.parseInt(raw, 10);
                  onDueDays(raw === "" || !Number.isFinite(days) ? null : Math.max(0, Math.min(3650, days)));
                }}
              />
            </label>
          ) : null}
        </div>
      }
      footer={
        rows.length > 0 ? (
          <p className={styles.billsTotals}>
            <span>Against bills {formatPaise(allocated)}</span>
            {raised ? (
              <span>open on the raised bill {formatPaise(Math.max(0, Math.round(raised.amount * 100) - allocated))}</span>
            ) : null}
          </p>
        ) : null
      }
    >
      {grid.settings.overlays}
      {/* The headings stay up with no bill under them, as Qt's table does; the right-click works either way. */}
      <div className={styles.tableViewport} onContextMenu={grid.settings.onContextMenu}>
        <table
          className={receiptStyles.panelTable}
          style={{ width: scaledWidth(totalColumnWidth(columns)), minWidth: "100%" }}
        >
          <BillTableHead grid={grid} />
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.ablId}-${row.ablAccYear}`}>
                {columns.map((column) => {
                  switch (column.key) {
                    case "ref":
                      return <td key={column.key}>{billLabel(row)}</td>;
                    case "date":
                      return <td key={column.key}>{displayDate(row.date)}</td>;
                    case "type":
                      return <td key={column.key}>{row.billType}</td>;
                    case "pending":
                      return (
                        <td key={column.key} className={styles.alignRight}>
                          {formatPaise(pendingPaise(row))}
                        </td>
                      );
                    case "due":
                      return <td key={column.key}>{displayDate(row.dueDate)}</td>;
                    case "thisVoucher":
                      return (
                        <td key={column.key} style={{ padding: 0 }}>
                          <input
                            className={styles.billInput}
                            inputMode="decimal"
                            disabled={readOnly}
                            value={
                              editing?.index === index ? editing.text : row.thisPaise > 0 ? paiseText(row.thisPaise) : ""
                            }
                            onFocus={(event) => {
                              setEditing({ index, text: row.thisPaise > 0 ? paiseText(row.thisPaise) : "" });
                              event.currentTarget.select();
                            }}
                            onChange={(event) => setEditing({ index, text: event.target.value.replace(/[^\d.,]/g, "") })}
                            onBlur={(event) => commit(index, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                            }}
                          />
                        </td>
                      );
                    default:
                      return <td key={column.key} />;
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Box>
  );
}
