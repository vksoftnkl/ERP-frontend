"use client";

/**
 * Ctrl+H — `txn_status_log` for one cheque, newest first.
 *
 * Append-only, so a cheque bounced and then re-presented shows both. And an
 * EMPTY list is correct for a cheque that has only been received: the log
 * starts at the first status change.
 */
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useGetChequeHistoryQuery } from "@/store/api/chequesApi";
import { chequeError } from "../api-errors";
import { describe, keysOf } from "../domain/chequeRow";
import type { ChequeRow } from "../domain/types";
import { StatusPill } from "./pill";
import styles from "../cheques.module.scss";

function when(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryDialog({ row, onClose }: { row: ChequeRow; onClose: () => void }) {
  const { currentData, isFetching, error } = useGetChequeHistoryQuery(keysOf(row), {
    refetchOnMountOrArgChange: true,
  });
  const entries = currentData?.entries ?? [];

  return (
    <ModalShell title={`History — cheque ${row.instrumentNo}`} isOpen wide onClose={onClose}>
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>{describe(row)}</p>
        {error ? <p className={styles.dialogError}>{chequeError(error)}</p> : null}
        {!error && isFetching && !currentData ? <p>Reading…</p> : null}
        {currentData && entries.length === 0 ? (
          <p className={styles.dialogNote}>
            Nothing has happened to this cheque yet — the log starts at its first move after it
            was received.
          </p>
        ) : null}
        {entries.length > 0 ? (
          <table className={styles.dialogTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>When</th>
                <th>From</th>
                <th>To</th>
                <th>Event</th>
                <th>By</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={`${entry.seqNo}-${entry.changedOn}`}>
                  <td>{entry.seqNo}</td>
                  <td>{when(entry.changedOn)}</td>
                  <td>{entry.fromStatus ? <StatusPill status={entry.fromStatus} /> : "—"}</td>
                  <td>
                    <StatusPill status={entry.toStatus} />
                  </td>
                  <td>{entry.event.replace(/_/g, " ").toLowerCase()}</td>
                  <td title={entry.changedBy}>{entry.changedBy.slice(0, 8)}</td>
                  <td style={{ whiteSpace: "normal" }}>{entry.remarks ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </ModalShell>
  );
}
