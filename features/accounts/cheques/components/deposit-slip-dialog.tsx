"use client";

/**
 * F6 — the deposit slip's dataset.
 *
 * Printing waits for the print pipeline: purpose `CHEQUE_DEPOSIT_SLIP` is
 * seeded, but no template carries the dataset yet, and a one-off print path
 * here would be the thing that pipeline exists to replace. So the slip is
 * SHOWN — bank, the numbered cheques, count and total — and says so.
 *
 * A key that matches nothing answers 200 with no lines rather than a 404. The
 * count is checked, so F6 never shows (or later prints) a blank slip with a
 * real bank's name across the top.
 */
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useGetDepositSlipQuery } from "@/store/api/chequesApi";
import { chequeError } from "../api-errors";
import { formatAmount, formatDate } from "../domain/chequeRow";
import type { DepositSlipKey } from "../domain/types";
import styles from "../cheques.module.scss";

export function DepositSlipDialog({
  slipKey,
  onClose,
}: {
  slipKey: DepositSlipKey;
  onClose: () => void;
}) {
  const { currentData: slip, isFetching, error } = useGetDepositSlipQuery(slipKey, {
    refetchOnMountOrArgChange: true,
  });
  const empty = slip !== undefined && (slip.lines.length === 0 || slip.chequeCount === 0);

  return (
    <ModalShell title={`Deposit slip ${slipKey.slipNo}`} isOpen wide onClose={onClose}>
      <div className={styles.dialogBody}>
        {error ? <p className={styles.dialogError}>{chequeError(error)}</p> : null}
        {!error && isFetching && !slip ? <p>Reading the slip…</p> : null}
        {empty ? (
          <p className={styles.dialogProblem}>
            No cheque is on slip {slipKey.slipNo} for this bank on {formatDate(slipKey.depositDate)}
            — there is nothing to print.
          </p>
        ) : null}
        {slip && !empty ? (
          <>
            <div className={styles.slipHead}>
              <span>
                <b>{slip.bankAccount.bankName || slip.bankAccount.ledgerName}</b>
                {slip.bankAccount.branchName ? `, ${slip.bankAccount.branchName}` : ""}
              </span>
              <span>
                Slip <b>{slip.slipNo}</b> · {formatDate(slip.depositDate)}
              </span>
              <span>
                A/c {slip.bankAccount.accountNo || "—"}
                {slip.bankAccount.accountHolder ? ` · ${slip.bankAccount.accountHolder}` : ""}
              </span>
              <span>
                IFSC {slip.bankAccount.ifscCode || "—"} · MICR {slip.bankAccount.micrCode || "—"}
              </span>
            </div>
            <table className={styles.dialogTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cheque</th>
                  <th>Date</th>
                  <th>Drawn on</th>
                  <th>Drawer / party</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {slip.lines.map((line) => (
                  <tr key={`${line.apdId}-${line.apdAccYear}`}>
                    <td>{line.lineNo}</td>
                    <td>{line.instrumentNo}</td>
                    <td>{formatDate(line.instrumentDate)}</td>
                    <td>
                      {[line.drawnOnBank, line.drawnOnBranch].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td>{line.drawerName || line.partyName}</td>
                    <td style={{ textAlign: "right" }}>{formatAmount(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>
                    {slip.chequeCount} {slip.chequeCount === 1 ? "cheque" : "cheques"}
                  </td>
                  <td style={{ textAlign: "right" }}>{formatAmount(slip.totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
            <p className={styles.dialogNote}>
              The printed deposit slip arrives with the printing module — this is the slip&apos;s
              content as the bank will receive it.
            </p>
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}
