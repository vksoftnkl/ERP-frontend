"use client";

/**
 * Who authorised this write-off.
 *
 * `accounts.writeoff_approval_above` defaults to **0**, so on a default
 * installation every write-off needs a name against it. The server takes a
 * USER ID (`writeoffApprovedBy` is an `OptionalUuid`), which is why this is a
 * picker and not a text box — and why the Qt screen's workaround, a chip
 * telling the operator to put the name in the narration, is not ported: a name
 * in a narration is not something a report can find.
 */
import { useMemo, useState } from "react";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useSearchApproversQuery } from "@/store/api/receiptApi";
import styles from "../page.module.scss";

export type ApproverDialogProps = {
  isOpen: boolean;
  billRefno: string;
  amount: number;
  threshold: number;
  onCancel: () => void;
  onPick: (userId: string) => void;
};

export function ApproverDialog(props: ApproverDialogProps) {
  const { isOpen, billRefno, amount, threshold, onCancel, onPick } = props;
  const [search, setSearch] = useState("");
  const { data, isFetching } = useSearchApproversQuery({ search }, { skip: !isOpen });

  const rows = useMemo(
    () => (data?.items ?? []).filter((row) => row.usr_is_active !== false),
    [data],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <ModalShell
      title="Who authorised this write-off?"
      isOpen
      narrow
      onClose={onCancel}
      footer={
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Cancel
          </button>
        </div>
      }
    >
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>
          {amount.toFixed(2)} is being written off on {billRefno}, which is above the{" "}
          {threshold.toFixed(2)} that may be written off unapproved. It is a recorded decision,
          not a workflow — nothing is sent for approval.
        </p>
        <input
          className={styles.input}
          value={search}
          placeholder="Search by name"
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className={styles.registerViewport}>
          <table className={styles.registerTable}>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td>
                    <p className={styles.panelEmpty}>
                      {isFetching ? "Reading…" : "No user matches that."}
                    </p>
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr
                  key={row.usr_id}
                  className={styles.registerRow}
                  onClick={() => onPick(row.usr_id)}
                >
                  <td>{row.usr_display_name || row.usr_full_name || row.usr_login_name}</td>
                  <td>{row.usr_login_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ModalShell>
  );
}
