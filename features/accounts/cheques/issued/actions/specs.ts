/**
 * The five writing verbs on one of our cheques, as data — the received side's
 * `ActionSpec` idea (`../../actions/types.ts`): where the request goes, what it
 * sends, why it cannot go yet, and what it will do. Pure: no React, no API, no
 * clock (`today` is passed in).
 *
 * Every verb takes ONE cheque, and every body carries the row's own BARE keys
 * (`companyId` / `branchId`, not the received `apdCompanyId`).
 *
 * The server accepts an empty `reason` (its DTO trims but does not require a
 * character), so a blank reason is refused HERE — the trail must say why.
 */
import { formatAmount, formatDate } from "../../domain/chequeRow";
import { isIsoDate } from "../../domain/dates";
import { first, parseAmount, tooLong } from "../../actions/types";
import type { ChequeBook } from "@/features/accounts/payment/payment.types";
import { describeIssued, issuedKeysOf } from "../domain/row";
import type { IssuedWritingVerb } from "../domain/machine";
import type { IssuedChequeRow } from "../issued.types";

export type IssuedActionContext = {
  today: string;
  /** Open cheque books — Replace writes the new leaf from one of them. */
  books: readonly ChequeBook[];
};

export type IssuedActionSpec<F> = {
  id: IssuedWritingVerb;
  endpoint: string;
  /** The dialog's title. */
  title: string;
  /** The OK button — the verb, never "OK". */
  okLabel: string;
  /** Fresh EVERY opening: a dialog that remembered last week's date back-dates a reversal. */
  initial: (row: IssuedChequeRow, context: IssuedActionContext) => F;
  build: (row: IssuedChequeRow, form: F, context: IssuedActionContext) => Record<string, unknown>;
  /** Why it cannot go yet, or null — only what needs no server. */
  validate: (row: IssuedChequeRow, form: F, context: IssuedActionContext) => string | null;
  /** What it does to the books, standing in the dialog. */
  note: (row: IssuedChequeRow, form: F, context: IssuedActionContext) => string;
  /** The sentence asked before the POST, naming the money. */
  confirm: (row: IssuedChequeRow, form: F, context: IssuedActionContext) => string;
  /** The reason presets — a pre-fill, never a whitelist. */
  reasons?: readonly string[];
};

// ─── Shared pieces ───────────────────────────────────────────────────────────

function dateProblem(label: string, value: string, today: string): string | null {
  if (!value.trim()) {
    return `Enter the ${label}.`;
  }
  if (!isIsoDate(value)) {
    return `The ${label} is not a real date.`;
  }
  return value > today ? `The ${label} cannot be in the future (${formatDate(value)}).` : null;
}

function reasonProblem(reason: string): string | null {
  return reason.trim() ? null : "Give a reason.";
}

function chargeProblem(label: string, value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const amount = parseAmount(value);
  if (Number.isNaN(amount)) {
    return `${label} is not a number.`;
  }
  if (amount < 0) {
    return `${label} cannot be negative.`;
  }
  // Checked on the TEXT: 1.1 × 100 is 110.00000000000001 in a double.
  return /\.\d{3,}$/.test(value.trim().replace(/,/g, ""))
    ? `${label} has more than two decimals.`
    : null;
}

/** A blank charge is not sent at all; the server defaults it to 0. */
function chargeBody(value: string): Record<string, number> {
  const amount = parseAmount(value);
  return Number.isNaN(amount) || amount <= 0 ? {} : { charges: Math.round(amount * 100) / 100 };
}

function payee(row: IssuedChequeRow): string {
  return row.partyName || row.favouring || "the party";
}

// ─── Presented ───────────────────────────────────────────────────────────────

export type PresentedForm = { date: string; remarks: string };

export const presentedSpec: IssuedActionSpec<PresentedForm> = {
  id: "presented",
  endpoint: "/issued-cheques/presented",
  title: "Presented — paid by our bank",
  okLabel: "Presented",
  initial: (_row, { today }) => ({ date: today, remarks: "" }),
  build: (row, form) => ({
    ...issuedKeysOf(row),
    date: form.date,
    ...(form.remarks.trim() ? { remarks: form.remarks.trim() } : {}),
  }),
  validate: (row, form, { today }) =>
    first([
      dateProblem("bank date", form.date, today),
      row.chequeDate && form.date && form.date < row.chequeDate
        ? `Cheque ${row.leaf} is dated ${formatDate(row.chequeDate)} — the bank cannot have paid it before that.`
        : null,
      tooLong("remarks", form.remarks, 250),
    ]),
  note: () =>
    "Our bank paid this cheque. Nothing is posted — the bank was credited when it was written; this stamps the bank date for reconciliation.",
  confirm: (row, form) =>
    `${describeIssued(row)} paid by our bank on ${formatDate(form.date)}. No voucher is written.`,
};

// ─── Returned unpaid / Stop / Void ───────────────────────────────────────────

export type ReverseForm = { date: string; reason: string; charges: string };

export const RETURNED_REASONS: readonly string[] = [
  "Funds insufficient",
  "Signature differs",
  "Words and figures differ",
  "Stale / out of date",
  "Account frozen",
];
export const STOP_REASONS: readonly string[] = [
  "Lost in transit",
  "Party asked to stop",
  "Wrong amount",
  "Payment in dispute",
];
export const VOID_REASONS: readonly string[] = [
  "Spoilt while writing",
  "Keyed wrong",
  "Misprinted",
  "Never sent",
];

export const returnedSpec: IssuedActionSpec<ReverseForm> = {
  id: "returned",
  endpoint: "/issued-cheques/returned",
  title: "Returned unpaid",
  okLabel: "Returned unpaid",
  reasons: RETURNED_REASONS,
  initial: (_row, { today }) => ({ date: today, reason: "", charges: "" }),
  build: (row, form) => ({
    ...issuedKeysOf(row),
    date: form.date,
    reason: form.reason.trim(),
    ...chargeBody(form.charges),
  }),
  validate: (_row, form, { today }) =>
    first([
      dateProblem("date", form.date, today),
      reasonProblem(form.reason),
      tooLong("reason", form.reason, 200),
      chargeProblem("Bank charges", form.charges),
    ]),
  note: (row) =>
    `Our bank returned it unpaid. A reversal (ChqBnc) takes THIS cheque's line back out — the bank is debited, ${payee(row)} is credited and its bills reopen. Other lines of the voucher stand. The leaf stays used.`,
  confirm: (row, form) => {
    const charges = chargeBody(form.charges).charges ?? 0;
    return (
      `${describeIssued(row)} returned unpaid on ${formatDate(form.date)}: its line is reversed and ` +
      `${payee(row)}'s bills reopen` +
      (charges > 0 ? `; the bank's ${formatAmount(charges)} goes to bank charges.` : ".")
    );
  },
};

export const stopSpec: IssuedActionSpec<ReverseForm> = {
  id: "stop",
  endpoint: "/issued-cheques/stop",
  title: "Stop payment",
  okLabel: "Stop payment",
  reasons: STOP_REASONS,
  initial: (_row, { today }) => ({ date: today, reason: "", charges: "" }),
  build: (row, form) => ({
    ...issuedKeysOf(row),
    date: form.date,
    reason: form.reason.trim(),
    ...chargeBody(form.charges),
  }),
  validate: (_row, form, { today }) =>
    first([
      dateProblem("date", form.date, today),
      reasonProblem(form.reason),
      tooLong("reason", form.reason, 200),
      chargeProblem("Stop fee", form.charges),
    ]),
  note: (row) =>
    `Stop payment. As Returned, filed as a stop: this line is reversed and ${payee(row)}'s bills reopen. Any stop fee is charged to the bank.`,
  confirm: (row, form) => {
    const charges = chargeBody(form.charges).charges ?? 0;
    return (
      `Stop ${describeIssued(row)} on ${formatDate(form.date)}: its line is reversed and ` +
      `${payee(row)}'s bills reopen` +
      (charges > 0 ? `; the ${formatAmount(charges)} stop fee goes to bank charges.` : ".")
    );
  },
};

export type VoidForm = { date: string; reason: string };

export const voidSpec: IssuedActionSpec<VoidForm> = {
  id: "void",
  endpoint: "/issued-cheques/void",
  title: "Void the cheque",
  okLabel: "Void the cheque",
  reasons: VOID_REASONS,
  initial: (_row, { today }) => ({ date: today, reason: "" }),
  // The date is sent although the DTO makes it optional: left out, the server
  // takes ITS today, which is the UTC date — yesterday, for an Indian evening.
  build: (row, form) => ({
    ...issuedKeysOf(row),
    date: form.date,
    reason: form.reason.trim(),
  }),
  validate: (_row, form, { today }) =>
    first([
      dateProblem("date", form.date, today),
      reasonProblem(form.reason),
      tooLong("reason", form.reason, 200),
    ]),
  note: () =>
    "The cheque never left the office — spoilt or written wrong. Its line is reversed; the leaf is used and never handed out again. No bank charge.",
  confirm: (row, form) =>
    `Void ${describeIssued(row)} on ${formatDate(form.date)}: its line is reversed and the leaf is spent.`,
};

// ─── Replace ─────────────────────────────────────────────────────────────────

export type ReplaceForm = {
  date: string;
  chequeBookId: string;
  chequeDate: string;
  favouring: string;
  acPayee: boolean;
  reason: string;
};

export const REPLACE_REASONS: readonly string[] = [
  "Returned unpaid — reissued",
  "Lost — reissued",
  "Stale — reissued",
  "Wrong payee — reissued",
];

/** The first book on the cheque's own bank with a leaf left, else the first one. */
export function defaultBookFor(row: IssuedChequeRow, books: readonly ChequeBook[]): string {
  const sameBank = books.find((book) => book.bankLedgerId === row.bankLedgerId && book.left > 0);
  return (sameBank ?? books[0])?.chequeBookId ?? "";
}

export function bookOf(books: readonly ChequeBook[], id: string): ChequeBook | null {
  return books.find((book) => book.chequeBookId === id) ?? null;
}

/** What the "New leaf" line says. */
export function nextLeafLine(book: ChequeBook | null, books: readonly ChequeBook[]): string {
  if (books.length === 0) {
    return "no active book — open one from Cheque books";
  }
  if (!book) {
    return "choose a book";
  }
  if (book.left <= 0 || !book.nextLeaf) {
    return "the book is finished";
  }
  return `${book.nextLeaf} (next, taken at post)`;
}

export const replaceSpec: IssuedActionSpec<ReplaceForm> = {
  id: "replace",
  endpoint: "/issued-cheques/replace",
  title: "Replace with a new cheque",
  okLabel: "Replace with a new cheque",
  reasons: REPLACE_REASONS,
  initial: (row, { today, books }) => ({
    date: today,
    chequeBookId: defaultBookFor(row, books),
    chequeDate: today,
    favouring: row.favouring || row.partyName,
    acPayee: row.acPayee,
    reason: "",
  }),
  build: (row, form, { books }) => {
    const book = bookOf(books, form.chequeBookId);
    return {
      ...issuedKeysOf(row),
      date: form.date,
      chequeBookId: form.chequeBookId,
      ...(book?.bankLedgerId ? { bankLedgerId: book.bankLedgerId } : {}),
      instrumentDate: form.chequeDate,
      ...(form.favouring.trim() ? { favouring: form.favouring.trim() } : {}),
      acPayee: form.acPayee,
      reason: form.reason.trim(),
    };
  },
  validate: (_row, form, { today, books }) => {
    const book = bookOf(books, form.chequeBookId);
    return first([
      dateProblem("voucher date", form.date, today),
      book ? null : "Choose the cheque book the new cheque is written from.",
      book && (book.left <= 0 || !book.nextLeaf)
        ? `Book ${book.bookNo} has no leaves left — choose another.`
        : null,
      !form.chequeDate.trim()
        ? "Enter the new cheque's date."
        : !isIsoDate(form.chequeDate)
          ? "The new cheque's date is not a real date."
          : form.date && form.chequeDate < form.date
            ? "The new cheque cannot be dated before its voucher — date it the voucher's day or later."
            : null,
      tooLong("favouring", form.favouring, 150),
      reasonProblem(form.reason),
      tooLong("reason", form.reason, 200),
    ]);
  },
  note: (row) =>
    String(row.status).toUpperCase() === "HELD"
      ? `The old cheque is stopped first (its line reversed), then a NEW Payment Voucher pays ${payee(row)} the same ${formatAmount(row.amount)} from the book below, settling the same bills.`
      : `A NEW Payment Voucher pays ${payee(row)} the same ${formatAmount(row.amount)} from the book below, settling the bills the old cheque had.`,
  confirm: (row, form, { books }) => {
    const book = bookOf(books, form.chequeBookId);
    return (
      `Replace ${describeIssued(row)}: a new Payment Voucher dated ${formatDate(form.date)} pays ` +
      `${formatAmount(row.amount)} on a new leaf${book?.nextLeaf ? ` (probably ${book.nextLeaf})` : ""} ` +
      `of book ${book?.bookNo ?? "?"}, dated ${formatDate(form.chequeDate)}.`
    );
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyIssuedActionSpec = IssuedActionSpec<any>;

export const ISSUED_ACTION_SPECS: Record<IssuedWritingVerb, AnyIssuedActionSpec> = {
  presented: presentedSpec,
  returned: returnedSpec,
  stop: stopSpec,
  void: voidSpec,
  replace: replaceSpec,
};
