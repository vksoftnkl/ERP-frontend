"use client";

/**
 * Ctrl+H — every step of one of our cheques since it was written.
 *
 * The server sends the steps OLDEST first (the Qt dialog labelled them
 * "newest first", which they never were). `changedBy` is a user id and may be
 * null, and so may `toStatus` — both are shown as they come.
 */
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useGetIssuedChequeHistoryQuery } from "@/store/api/issuedChequesApi";
import { chequeError } from "../../api-errors";
import { formatDate } from "../../domain/chequeRow";
import { TonePill } from "../../components/pill";
import { describeIssued, issuedKeysOf } from "../domain/row";
import { issuedStatusLabel, issuedStatusPill } from "../domain/pills";
import type { IssuedChequeRow } from "../issued.types";
import styles from "../../cheques.module.scss";

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

export function IssuedHistoryDialog({ row, onClose }: { row: IssuedChequeRow; onClose: () => void }) {
  const { currentData, isFetching, error } = useGetIssuedChequeHistoryQuery(issuedKeysOf(row), {
    refetchOnMountOrArgChange: true,
  });
  const entries = currentData?.entries ?? [];

  return (
    <ModalShell title={`History — leaf ${row.leaf}`} isOpen wide onClose={onClose}>
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>
          {describeIssued(row)} · {issuedStatusLabel(row.status)}
          {currentData?.issuedOn ? ` · written ${formatDate(currentData.issuedOn)}` : ""}
          {currentData?.voucherRefno ? ` on ${currentData.voucherRefno}` : ""}
        </p>
        {error ? <p className={styles.dialogError}>{chequeError(error)}</p> : null}
        {!error && isFetching && !currentData ? <p>Reading…</p> : null}
        {currentData && entries.length === 0 ? (
          <p className={styles.dialogNote}>Nothing has happened to this cheque since it was written.</p>
        ) : null}
        {entries.length > 0 ? (
          <>
            <p className={styles.dialogNote}>
              {entries.length} step{entries.length === 1 ? "" : "s"}, oldest first.
            </p>
            <table className={styles.dialogTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>When</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Event</th>
                  <th>By</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.seqNo}-${entry.changedOn}`}>
                    <td>{entry.seqNo}</td>
                    <td>{when(entry.changedOn)}</td>
                    <td>
                      {entry.fromStatus ? <TonePill pill={issuedStatusPill(entry.fromStatus)} /> : "—"}
                    </td>
                    <td>{entry.toStatus ? <TonePill pill={issuedStatusPill(entry.toStatus)} /> : "—"}</td>
                    <td>{(entry.event ?? "").replace(/_/g, " ").toLowerCase()}</td>
                    <td title={entry.changedBy ?? undefined}>
                      {entry.changedBy ? entry.changedBy.slice(0, 8) : "—"}
                    </td>
                    <td style={{ whiteSpace: "normal" }}>{entry.remarks ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}
