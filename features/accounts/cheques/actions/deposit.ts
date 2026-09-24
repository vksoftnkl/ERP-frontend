/**
 * Deposit — the only BULK verb → `POST /cheques/deposit`.
 *
 * A deposit slip is one bank, one date, one slip number and many cheques, and
 * the body is shaped like the paper: the cheques as `{apdId, apdAccYear}`
 * refs, and the scope HOISTED once, because a slip belongs to one branch.
 *
 * It moves NO money. Handing paper over a counter posts no voucher — the bank
 * has taken custody, it has not paid us. Clearing is the voucher.
 *
 * All or nothing on the server: every row must be HELD.
 */
import { describe, formatAmount, formatDate } from "../domain/chequeRow";
import type { ChequeRow } from "../domain/types";
import { first, optional, oneRow, pastDate, tooLong, type ActionSpec } from "./types";

export type SlipForm = {
  bankLedgerId: string;
  /** Shown in the dropdown before it loads; never sent. */
  bankLedgerName: string;
  depositDate: string;
  slipNo: string;
  remarks: string;
};

export function freshSlipForm(today: string): SlipForm {
  return { bankLedgerId: "", bankLedgerName: "", depositDate: today, slipNo: "", remarks: "" };
}

/**
 * The checks Deposit and Re-present share: the bank, the date, the slip, and
 * never banking a cheque before the day written on it — that is how one comes
 * back marked "post-dated presented early".
 */
export function slipProblem(
  rows: readonly ChequeRow[],
  form: SlipForm,
  today: string,
): string | null {
  const early = rows.find(
    (row) => row.instrumentDate && form.depositDate && form.depositDate < row.instrumentDate,
  );
  return first([
    form.bankLedgerId.trim() ? null : "Choose the bank it is going into.",
    pastDate("deposit date", form.depositDate, today),
    form.slipNo.trim()
      ? null
      : "Enter the slip number — the bank's slip number is what the printed slip is keyed on.",
    tooLong("slip number", form.slipNo, 50),
    early
      ? `Cheque ${early.instrumentNo} is dated ${formatDate(early.instrumentDate)} — it cannot be banked before that.`
      : null,
    tooLong("remarks", form.remarks, 500),
  ]);
}

/**
 * The DTO has room for ONE company and ONE branch, taken from the first row.
 * A mixed set is refused here, by name, rather than as a vaguer server error.
 */
export function mixedScopeProblem(rows: readonly ChequeRow[]): string | null {
  const [head] = rows;
  if (!head) {
    return null;
  }
  const stranger = rows.find(
    (row) => row.companyId !== head.companyId || row.branchId !== head.branchId,
  );
  return stranger
    ? `Cheque ${stranger.instrumentNo} belongs to another company or branch than ${head.instrumentNo} — one slip is for one branch. Deposit them separately.`
    : null;
}

/** "2 cheque(s) on this slip — 2,000.00". */
export function slipSummary(rows: readonly ChequeRow[]): string {
  return `${rows.length} cheque(s) on this slip — ${formatAmount(slipTotal(rows))}`;
}

export function slipTotal(rows: readonly ChequeRow[]): number {
  return rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
}

export const depositSpec: ActionSpec<SlipForm> = {
  id: "deposit",
  endpoint: "/cheques/deposit",
  verb: (_rows, _form, words) => words.depositVerb,
  summary: slipSummary,
  initial: (_rows, today) => freshSlipForm(today),
  build: (rows, form) => ({
    cheques: rows.map((row) => ({ apdId: row.apdId, apdAccYear: row.accYear })),
    apdCompanyId: rows[0]?.companyId ?? "",
    apdBranchId: rows[0]?.branchId ?? "",
    bankLedgerId: form.bankLedgerId.trim(),
    depositDate: form.depositDate,
    slipNo: form.slipNo.trim(),
    ...optional("remarks", form.remarks),
  }),
  validate: (rows, form, today) =>
    first([
      rows.length === 0 ? "Tick the cheques going to the bank, or choose one." : null,
      mixedScopeProblem(rows),
      slipProblem(rows, form, today),
    ]),
  confirm: (rows, form) =>
    `${rows.length === 1 ? describe(rows[0]) : `${rows.length} cheques, ${formatAmount(slipTotal(rows))} in all,`} ` +
    `${rows.length === 1 ? "goes" : "go"} to ${form.bankLedgerName || "the bank"} on ${formatDate(form.depositDate)}, ` +
    `slip ${form.slipNo.trim()}. No money moves until the bank clears ${rows.length === 1 ? "it" : "them"}.`,
  hint: "Depositing posts no voucher: the bank has taken the paper into custody, not paid us. The money moves when it clears.",
};

/**
 * Re-present (single) → `POST /cheques/re-present`. A bounced cheque, sent
 * back — to any bank, not necessarily the one it bounced from.
 *
 * NO `allocations`, and that is correct, not lazy. Since the notes-37 fix the
 * server restores the originating bills' split itself — a split that exists
 * only in the reversed adjustment rows, which the client cannot see (after a
 * bounce `/cheques/get` reports `settledByThisCheque: 0` on every bill,
 * correctly). Anything sent would be a guess overriding a server that knows.
 */
export const representSpec: ActionSpec<SlipForm> = {
  id: "represent",
  endpoint: "/cheques/re-present",
  verb: () => "Re-present",
  summary: slipSummary,
  initial: (_rows, today, detail) => ({
    ...freshSlipForm(today),
    // A pre-fill only: the bank it was last in is the likeliest, and the
    // operator can change it.
    bankLedgerId: detail?.cheque.apdBankLedgerId ?? "",
    bankLedgerName: detail?.cheque.bankLedgerName ?? "",
  }),
  build: (rows, form) => ({
    apdId: rows[0]?.apdId ?? "",
    apdAccYear: rows[0]?.accYear ?? "",
    apdCompanyId: rows[0]?.companyId ?? "",
    apdBranchId: rows[0]?.branchId ?? "",
    bankLedgerId: form.bankLedgerId.trim(),
    depositDate: form.depositDate,
    slipNo: form.slipNo.trim(),
    ...optional("remarks", form.remarks),
  }),
  validate: (rows, form, today) => first([oneRow(rows), slipProblem(rows, form, today)]),
  confirm: (rows, form) =>
    `${describe(rows[0])} goes back to ${form.bankLedgerName || "the bank"} on ${formatDate(form.depositDate)}, ` +
    `slip ${form.slipNo.trim()}. It is taken in again, and the bills it settled before the bounce are settled again.`,
  hint: "Re-presenting is not undoing the bounce: the party owed the money in between. The server puts the credit back on the same bills, with the same split.",
};
