"use client";
/**
 * Enter on a group → the ledgers rolled into it (plan §9.2): one
 * `/group-ledgers` call with the summary's own scope. Enter on a ledger
 * closes the dialog and opens its Ledger Statement. The total row is the
 * response's; when the server sends a bare list there is none (no client sum).
 */
import { useRef } from "react";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";
import type { DaySummaryClient } from "../api/day-summary";
import { groupLedgersQuery, queryKey, type Filters, type Session } from "../query/params";
import { useOneShot } from "../query/use-one-shot";
import { groupLedgerCells, netCell } from "../view/cells";
import { toDaySummaryError } from "../wire/errors";
import type { GroupLedgerRow, GroupRow } from "../wire/types";
import { formatAmount } from "@/features/reports/shared/wire/money";
import { DialogShell } from "./dialog-shell";
import { netClass } from "./group-grid";
import { useRowCursor } from "./row-cursor";

type Props = {
  group: GroupRow;
  client: DaySummaryClient;
  session: Session;
  /** The filters the shown summary was asked with: the dialog matches the grid, not the strip. */
  filters: Filters;
  onLedger: (row: GroupLedgerRow) => void;
  onClose: () => void;
};

export function GroupLedgersDialog({ group, client, session, filters, onLedger, onClose }: Props) {
  const query = groupLedgersQuery(session, filters, group.groupId);
  const shot = useOneShot(queryKey("group-ledgers", query), (signal) => client.getGroupLedgers(query, signal));
  const rows = shot.data?.rows ?? [];
  const boxRef = useRef<HTMLDivElement | null>(null);
  const cursor = useRowCursor(rows.length, (i) => onLedger(rows[i]), boxRef);
  const error = shot.error ? toDaySummaryError(shot.error, { route: "group-ledgers", accYear: session.accYear }) : null;
  const totals = shot.data?.totals ?? null;

  return (
    <DialogShell title={group.groupName} sub="ledgers in this group" hint="Enter opens the Ledger Statement" onClose={onClose}>
      {shot.loading ? <div className={styles.emptyState}>Loading…</div> : null}
      {error ? (
        <div className={styles.bodyError} role="alert">
          <span>{error.message}</span>
          {error.retryable ? (
            <button type="button" className={styles.linkButton} onClick={shot.retry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {shot.data ? (
        <div
          ref={boxRef}
          className={styles.tableBox}
          tabIndex={0}
          role="grid"
          aria-label="Ledgers"
          autoFocus
          onKeyDown={cursor.onKeyDown}
          onFocus={cursor.onFocus}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ledger</th>
                <th>Group</th>
                <th className={styles.num}>Debit</th>
                <th className={styles.num}>Credit</th>
                <th className={styles.num}>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.mutedCell}>
                    No ledger in this group moved in range.
                  </td>
                </tr>
              ) : null}
              {rows.map((row, i) => {
                const c = groupLedgerCells(row);
                return (
                  <tr
                    key={row.ledgerId}
                    data-row={i}
                    className={cx(i === cursor.cursor && styles.rowFocused)}
                    onMouseDown={() => cursor.setCursor(i)}
                    onDoubleClick={() => onLedger(row)}
                  >
                    <td>{c.name}</td>
                    <td className={styles.mutedCell}>{c.nature}</td>
                    <td className={styles.num}>{c.debit}</td>
                    <td className={styles.num}>{c.credit}</td>
                    <td className={cx(styles.num, netClass(c.net))}>{c.net.text}</td>
                  </tr>
                );
              })}
            </tbody>
            {totals ? (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td className={styles.num}>{formatAmount(totals.debit)}</td>
                  <td className={styles.num}>{formatAmount(totals.credit)}</td>
                  <td className={cx(styles.num, totals.net ? netClass(netCell(totals.net)) : undefined)}>
                    {totals.net ? netCell(totals.net).text : ""}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
    </DialogShell>
  );
}
