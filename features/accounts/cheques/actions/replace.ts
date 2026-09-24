/**
 * Replace (single, HELD or BOUNCED) → `POST /cheques/replace`. The party
 * handed over different paper.
 *
 * A NEW register row, HELD, and the old one marked REPLACED — the two stay
 * linked both ways. Never an edit of the old row.
 *
 *  - The new cheque is a NESTED `newCheque` object, not flat fields.
 *  - Optional strings go only when filled: `""` on a nullable column is not
 *    NULL, and a blank IFSC stored as `""` reads as though one was entered.
 *  - The amount need not match — replacing a bounced cheque with a smaller one
 *    and paying the rest another way is ordinary.
 *  - From HELD the server RETURNS the old cheque first, and a RETURNED row
 *    needs a reason (`ck_apd_cancelled`). The DTO calls it "required in
 *    practice", but verified live on 2026-09-24 the server fills one in when
 *    it is left out — "Replaced by cheque 90263788 dated 2026-09-24" — so the
 *    Qt panel, which never sent one, was not broken. The box is offered from
 *    HELD, for a reason worth more than that default, and is optional.
 *  - `allocations` is not sent: ON_RECEIPT, auto-FIFO.
 */
import { describe, formatAmount, formatDate } from "../domain/chequeRow";
import { addMonths, addYears, isIsoDate } from "../domain/dates";
import { first, oneRow, optional, parseAmount, tooLong, type ActionSpec } from "./types";

export type ReplaceForm = {
  instrumentNo: string;
  instrumentDate: string;
  amount: string;
  bankName: string;
  bankBranch: string;
  ifsc: string;
  micr: string;
  drawerName: string;
  reason: string;
};

function fromHeld(status: string | undefined): boolean {
  return String(status ?? "").toUpperCase() === "HELD";
}

/** `ck_apd_dates`: the new row is received TODAY. */
export function replaceDateBounds(today: string): { earliest: string; latest: string } {
  return { earliest: addMonths(today, -3), latest: addYears(today, 1) };
}

export const replaceSpec: ActionSpec<ReplaceForm> = {
  id: "replace",
  endpoint: "/cheques/replace",
  verb: () => "Replace cheque",
  // Seeded from the old cheque: a party replacing a cheque usually draws on
  // the same account. The number, branch, IFSC and MICR are the new paper's
  // own, so they start empty.
  initial: (rows, today) => ({
    instrumentNo: "",
    instrumentDate: today,
    amount: rows[0] ? String(rows[0].amount) : "",
    bankName: rows[0]?.bankName ?? "",
    bankBranch: "",
    ifsc: "",
    micr: "",
    drawerName: rows[0]?.drawerName ?? "",
    reason: "",
  }),
  build: (rows, form) => ({
    apdId: rows[0]?.apdId ?? "",
    apdAccYear: rows[0]?.accYear ?? "",
    apdCompanyId: rows[0]?.companyId ?? "",
    apdBranchId: rows[0]?.branchId ?? "",
    ...optional("reason", form.reason),
    newCheque: {
      instrumentNo: form.instrumentNo.trim(),
      instrumentDate: form.instrumentDate,
      amount: Math.round(parseAmount(form.amount) * 100) / 100,
      ...optional("bankName", form.bankName),
      ...optional("bankBranch", form.bankBranch),
      ...optional("ifsc", form.ifsc.toUpperCase()),
      ...optional("micr", form.micr),
      ...optional("drawerName", form.drawerName),
    },
  }),
  validate: (rows, form, today) => {
    const { earliest, latest } = replaceDateBounds(today);
    const amount = parseAmount(form.amount);
    return first([
      oneRow(rows),
      form.instrumentNo.trim() ? null : "Enter the new cheque's number.",
      tooLong("cheque number", form.instrumentNo, 30),
      !form.instrumentDate.trim()
        ? "Enter the new cheque's date."
        : !isIsoDate(form.instrumentDate)
          ? "The new cheque's date is not a real date."
          : null,
      isIsoDate(form.instrumentDate) && form.instrumentDate < earliest
        ? `A cheque dated before ${formatDate(earliest)} is stale — no bank will take it.`
        : null,
      isIsoDate(form.instrumentDate) && form.instrumentDate > latest
        ? `A cheque cannot be dated more than a year ahead (after ${formatDate(latest)}).`
        : null,
      Number.isNaN(amount) || amount <= 0 ? "Enter the new cheque's amount." : null,
      tooLong("bank name", form.bankName, 100),
      tooLong("bank branch", form.bankBranch, 100),
      tooLong("IFSC", form.ifsc, 11),
      tooLong("MICR", form.micr, 9),
      tooLong("drawer", form.drawerName, 150),
      tooLong("reason", form.reason, 250),
    ]);
  },
  confirm: (rows, form) => {
    const row = rows[0];
    const amount = formatAmount(parseAmount(form.amount));
    const head = row ? describe(row) : "The cheque";
    return fromHeld(row?.status)
      ? `${head} goes back to the party and is replaced by cheque ${form.instrumentNo.trim()} for ${amount}, dated ${formatDate(form.instrumentDate)}. The new cheque is held.`
      : `${head} is replaced by cheque ${form.instrumentNo.trim()} for ${amount}, dated ${formatDate(form.instrumentDate)}. The new cheque is taken in and held.`;
  },
  note: (rows) =>
    rows[0]
      ? `Replaces ${rows[0].instrumentNo} — ${formatAmount(rows[0].amount)}. The old row becomes REPLACED and the two stay linked both ways.`
      : null,
};

/** Whether the dialog offers the reason box: only from HELD, where the old cheque is returned. */
export function replaceOffersReason(rows: readonly { status: string }[]): boolean {
  return fromHeld(rows[0]?.status);
}
