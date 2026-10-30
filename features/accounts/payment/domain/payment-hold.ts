/**
 * Purchase R19 — a purchase bill on payment hold, as the Payment grid shows it
 * (Qt 348957f `PaymentEntry::paintBills`): the Type reads "PURCHASE · ON HOLD",
 * its tooltip gives the reason and the rule. The server refuses paying it
 * (409 PUR_PAYMENT_HOLD) unless the payer holds Override on Purchase Entry.
 *
 * Pure: no React.
 */
import type { BillRow, PayableBillRow, PaymentHold } from "../payment.types";

/** The bill's hold, or null — a row from anywhere but /open-items carries none. */
export function paymentHoldOf(row: BillRow): PaymentHold | null {
  return (row as PayableBillRow).paymentHold ?? null;
}

/** "PURCHASE · ON HOLD" — the Type cell of a held bill. */
export function heldTypeLabel(billType: string): string {
  return `${(billType ?? "").replace(/_/g, " ").trim()} · ON HOLD`;
}

/** The Type cell's tooltip on a held bill. */
export function holdTooltip(hold: PaymentHold): string {
  const reason = hold.reason.trim();
  return `Payment hold${reason ? `: ${reason}` : ""}. Paying it needs the Override right on Purchase Entry (or release the hold there).`;
}
