/**
 * Follow-up (F6) on a temp credit — the body `PUT /temp-credits/follow-up`
 * takes, built the way the Qt `TempCreditFollowupDialog::save` builds it.
 *
 * The promise date is THREE-WAY, and the three must be told apart on the
 * wire: the key OMITTED keeps the stored date, `null` clears it, a date sets
 * it. A client that always sent the field would wipe promises it never meant
 * to touch (HANDOVER §7.2) — so the dialog remembers the date as loaded and
 * sends the key only when the operator changed it. Pure: no React.
 */
import type { TempCreditFollowUpDto } from "@/store/api/saleBillApi";
import type { TempCreditRow } from "./row";

export const REMARK_MAX_LENGTH = 250;
export const REMARK_REQUIRED_MESSAGE = "Say what happened — the remark is the follow-up.";

/** The promise date as the dialog holds it: `yyyy-mm-dd`, or "" for none. */
export function promiseDateOf(row: TempCreditRow): string {
  return row.atc_promise_date.trim().slice(0, 10);
}

export type FollowUpInput = {
  row: TempCreditRow;
  /** The date as loaded — what "unchanged" is measured against. */
  originalPromise: string;
  /** The date as it stands now; "" when cleared. */
  promiseDate: string;
  remarks: string;
};

export type FollowUpOutcome =
  | { ok: true; body: TempCreditFollowUpDto }
  | { ok: false; message: string };

export function buildFollowUpBody(input: FollowUpInput): FollowUpOutcome {
  const remarks = input.remarks.trim();
  if (!remarks) {
    return { ok: false, message: REMARK_REQUIRED_MESSAGE };
  }
  const body: TempCreditFollowUpDto = {
    atcId: input.row.atc_id,
    atcAccYear: input.row.atc_acc_year,
    remarks: remarks.slice(0, REMARK_MAX_LENGTH),
  };
  const now = input.promiseDate.trim();
  if (now !== input.originalPromise.trim()) {
    body.promiseDate = now ? now : null;
  }
  return { ok: true, body };
}
