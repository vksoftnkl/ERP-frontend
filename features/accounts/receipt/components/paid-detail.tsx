"use client";

/**
 * F7 — what has already been paid against the bill under the cursor.
 *
 * Popup grid 112, "POPUP - BILL PAYMENT HISTORY": every receipt, journal and
 * credit note that has touched it. It is the answer to "we paid that in March"
 * while the operator is on the phone.
 *
 * On a CREDIT row it says so instead of opening an empty list: a credit has no
 * settlement history of its own.
 */
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useGetBillPaymentHistoryQuery } from "@/store/api/receiptApi";
import styles from "../page.module.scss";

export type PaidDetailTarget = {
  billId: string;
  billAccYear: string;
  docRefno: string;
  isCredit: boolean;
};

export type PaidDetailProps = {
  target: PaidDetailTarget | null;
  onClose: () => void;
};

/** The grid's own column names, in the order its SQL selects them. */
const COLUMNS: Array<{ key: string; label: string }> = [
  { key: "abj_adj_date", label: "Date" },
  { key: "voucher", label: "Voucher" },
  { key: "voucher_type", label: "Type" },
  { key: "abj_adj_type", label: "How" },
  { key: "abj_dr_cr", label: "Dr/Cr" },
  { key: "abj_amount", label: "Amount" },
  { key: "abj_settlement_mode", label: "Mode" },
  { key: "tender", label: "Tender" },
  { key: "abj_remarks", label: "Remarks" },
  { key: "abj_created_by", label: "By" },
];

function cell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function PaidDetail({ target, onClose }: PaidDetailProps) {
  const { data, isFetching } = useGetBillPaymentHistoryQuery(
    { billId: target?.billId ?? "", billAccYear: target?.billAccYear ?? "" },
    { skip: !target || target.isCredit },
  );

  if (!target) {
    return null;
  }

  const rows = data?.items ?? [];

  return (
    <ModalShell title={`Settlement history — ${target.docRefno}`} isOpen wide onClose={onClose}>
      {target.isCredit ? (
        <p className={styles.panelEmpty}>
          A credit has no settlement history of its own — it is spent against bills, and each of
          those bills carries the record.
        </p>
      ) : (
        <div className={styles.registerViewport}>
          <table className={styles.registerTable}>
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length}>
                    <p className={styles.panelEmpty}>
                      {isFetching
                        ? "Reading…"
                        : "Nothing has been settled against this bill yet."}
                    </p>
                  </td>
                </tr>
              ) : null}
              {rows.map((row: Record<string, unknown>, index: number) => (
                <tr key={cell(row.abj_id) || index}>
                  {COLUMNS.map((column) => (
                    <td key={column.key}>{cell(row[column.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  );
}
