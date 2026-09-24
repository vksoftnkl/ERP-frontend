/**
 * Clear (single) → `POST /cheques/clear`. The bank paid.
 *
 * `clearDate` is the day the money became ours; `bankDate` is the day THE BANK
 * says it happened (it lands in `av_recon_date` on the bank leg — the hook
 * reconciliation hangs off). It follows `clearDate` until the operator edits
 * it, because nine times in ten they are the same day.
 *
 * `allocations` is deliberately ABSENT — not `[]`. Under ON_RECEIPT the server
 * refuses a non-empty one outright; under ON_CLEARING leaving it out asks for
 * auto-FIFO. The ON_CLEARING bills band (the receipt's bills grid, reused) is
 * owed, and inactive while `accounts.pdc_posting_mode` stays ON_RECEIPT.
 */
import { describe, formatAmount, formatDate } from "../domain/chequeRow";
import { isIsoDate } from "../domain/dates";
import { first, oneRow, optional, pastDate, tooLong, type ActionSpec } from "./types";

export type ClearForm = {
  clearDate: string;
  bankDate: string;
  /** Once the operator has typed a bank date, it stops following. */
  bankDateEdited: boolean;
  remarks: string;
};

export const clearSpec: ActionSpec<ClearForm> = {
  id: "clear",
  endpoint: "/cheques/clear",
  verb: () => "Clear cheque",
  initial: (_rows, today) => ({ clearDate: today, bankDate: today, bankDateEdited: false, remarks: "" }),
  apply: (form, patch) => {
    const next = { ...form, ...patch };
    if (patch.bankDate !== undefined) {
      next.bankDateEdited = true;
    } else if (patch.clearDate !== undefined && !form.bankDateEdited) {
      next.bankDate = patch.clearDate;
    }
    return next;
  },
  build: (rows, form) => ({
    apdId: rows[0]?.apdId ?? "",
    apdAccYear: rows[0]?.accYear ?? "",
    apdCompanyId: rows[0]?.companyId ?? "",
    apdBranchId: rows[0]?.branchId ?? "",
    clearDate: form.clearDate,
    ...optional("bankDate", form.bankDate),
    ...optional("remarks", form.remarks),
  }),
  validate: (rows, form, today) => {
    const row = rows[0];
    return first([
      oneRow(rows),
      pastDate("clearing date", form.clearDate, today),
      row?.depositDate && form.clearDate < row.depositDate
        ? `Clear ${row.instrumentNo} on or after ${formatDate(row.depositDate)}, the day it was deposited.`
        : null,
      form.bankDate.trim() && !isIsoDate(form.bankDate) ? "The bank's date is not a real date." : null,
      form.bankDate.trim() && form.bankDate > today ? "The bank's date cannot be in the future." : null,
      tooLong("remarks", form.remarks, 500),
    ]);
  },
  confirm: (rows, form) =>
    rows[0]?.postingMode === "ON_CLEARING"
      ? `${describe(rows[0])} cleared on ${formatDate(form.clearDate)}: the bank is debited ${formatAmount(rows[0].amount)} and the party's bills are settled now, oldest first.`
      : `${describe(rows[0])} cleared on ${formatDate(form.clearDate)}: ${formatAmount(rows[0]?.amount ?? 0)} moves from Cheques In Hand to the bank.`,
  note: (rows) =>
    rows[0]?.postingMode === "ON_CLEARING"
      ? "Clearing it settles the party's bills now — oldest first."
      : "The bills were settled when the cheque was taken. Clearing moves the money from Cheques In Hand to the bank.",
};
