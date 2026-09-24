/**
 * Return / Cancel (single, HELD only) → `POST /cheques/return`.
 *
 *   RETURNED  — the party has the paper back.
 *   CANCELLED — it is void and nobody has it. `ux_apd_instrument` excludes
 *               CANCELLED rows, so the same number can be keyed again — the
 *               reason to prefer Cancel over Return for a mis-keyed cheque.
 *
 * There is NO `returnDate` on this route. Do not add one.
 *
 * Refused once DEPOSITED: the bank's record and ours have to agree.
 */
import { describe } from "../domain/chequeRow";
import { first, oneRow, optional, tooLong, type ActionSpec } from "./types";

export type ReturnForm = {
  action: "RETURNED" | "CANCELLED";
  reason: string;
  remarks: string;
};

export const returnSpec: ActionSpec<ReturnForm> = {
  id: "return",
  endpoint: "/cheques/return",
  verb: (_rows, form) => (form.action === "CANCELLED" ? "Cancel cheque" : "Return cheque"),
  initial: () => ({ action: "RETURNED", reason: "", remarks: "" }),
  build: (rows, form) => ({
    apdId: rows[0]?.apdId ?? "",
    apdAccYear: rows[0]?.accYear ?? "",
    apdCompanyId: rows[0]?.companyId ?? "",
    apdBranchId: rows[0]?.branchId ?? "",
    action: form.action,
    reason: form.reason.trim(),
    ...optional("remarks", form.remarks),
  }),
  validate: (rows, form) =>
    first([
      oneRow(rows),
      form.reason.trim()
        ? null
        : form.action === "CANCELLED"
          ? "Give the reason it is being cancelled."
          : "Give the reason it is going back.",
      tooLong("reason", form.reason, 250),
      tooLong("remarks", form.remarks, 500),
    ]),
  confirm: (rows, form) => {
    const row = rows[0];
    const head = row ? describe(row) : "The cheque";
    // Under ON_CLEARING nothing was posted when it arrived, so there is no
    // settlement to reverse — the register moves alone.
    const reversal =
      row?.postingMode === "ON_CLEARING"
        ? "Nothing was posted for it, so only the register changes."
        : "The receipt's settlement is reversed.";
    return form.action === "CANCELLED"
      ? `${head} is voided. ${reversal} The cheque number is released.`
      : `${head} goes back to the party. ${reversal}`;
  },
  note: (_rows, form) =>
    form.action === "CANCELLED"
      ? "Cancelling releases the cheque number — the same one can be entered again."
      : "Returning keeps the number taken. Cancel instead if the cheque was keyed by mistake.",
};
