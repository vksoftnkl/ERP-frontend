/**
 * Confirm remittance — Qt `TillRemitConfirmDialog` (ec9d92d, notes 118 §3)
 * without the widgets: a CIT remittance still IN_TRANSIT is confirmed against
 * the bank statement, from the Cash Office's On the way tab.
 *
 * POST /till/movements/remit-confirm: the bank date (from the day it was sent
 * to today's business day — the server refuses outside that), its reference
 * and what it credited (starts at what was sent). The server posts the Contra
 * (Dr Bank, Cr Cash in transit). A short credit within till.cash_tolerance is
 * booked at once; beyond it the gap waits (PENDING) and is decided from the
 * Cash Office's Decide — this popup never decides it. Cash Office (287) CREATE.
 */
import type { TillRemitConfirmBody } from "../shared/api/till-session-api";
import { ddmmyyyy, todayIso } from "../shared/format";
import { amountInputPaise, formatMoney, paiseOf, paiseToInput, paiseToNumber } from "../shared/money";
import type { TillRemittance } from "../shared/wire/types";
import { agencyBagText, type CashOfficeScope } from "./cash-office";

export type RemitConfirmRequest = {
  scope: CashOfficeScope;
  /** One of the balance's `inTransit` rows. */
  remit: TillRemittance;
  /** Today's business date (the balance's), the latest bank date the server takes. */
  businessDate: string;
};

export type RemitConfirmForm = {
  /** yyyy-MM-dd. */
  bankDate: string;
  bankRef: string;
  /** What the bank credited, as typed. */
  creditedText: string;
  note: string;
};

/** The bank date starts at today, the credit at what was sent. */
export function initialRemitConfirmForm(remit: TillRemittance, today: string = todayIso()): RemitConfirmForm {
  return { bankDate: today, bankRef: "", creditedText: paiseToInput(paiseOf(remit.amount)), note: "" };
}

export type RemitConfirmFacts = { doc: string; agency: string; sent: string };

export function remitConfirmFacts(remit: TillRemittance): RemitConfirmFacts {
  return {
    doc: [remit.docNo, ddmmyyyy(remit.docDate)].filter(Boolean).join("  ·  "),
    agency: agencyBagText(remit),
    sent: formatMoney(paiseOf(remit.amount)),
  };
}

function isIsoDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Why it cannot be confirmed yet, or "" — the button's tooltip (Qt `problem`). */
export function remitConfirmProblem(form: RemitConfirmForm): string {
  if (!isIsoDate(form.bankDate)) return "Type the bank date.";
  if (!form.bankRef.trim()) return "Type the bank reference.";
  // Qt's spin box can never be empty; a cleared box is not a credit of 0.
  if (!form.creditedText.trim()) return "Type what the bank credited.";
  return "";
}

export function creditedPaise(form: RemitConfirmForm): number {
  return amountInputPaise(form.creditedText);
}

export function remitConfirmHint(sentPaise: number, credited: number): string {
  const difference = credited - sentPaise;
  if (difference === 0) return "The bank credited what was sent.";
  return (
    `The bank credited ${formatMoney(Math.abs(difference))} ${difference < 0 ? "less" : "more"}. A small ` +
    "difference is booked at once; a bigger one waits for a manager to decide it here on the Cash Office."
  );
}

/** `ConfirmTillRemitDto` — never a `treatment`: a gap beyond tolerance waits for Decide. */
export function remitConfirmBody(request: RemitConfirmRequest, form: RemitConfirmForm): TillRemitConfirmBody {
  const body: TillRemitConfirmBody = {
    companyId: request.scope.companyId,
    branchId: request.scope.branchId,
    accYear: request.remit.tcmAccYear,
    tcmId: request.remit.tcmId,
    bankDate: form.bankDate,
    bankRef: form.bankRef.trim(),
    bankAmount: paiseToNumber(creditedPaise(form)),
  };
  const note = form.note.trim();
  if (note) body.notes = note;
  return body;
}
