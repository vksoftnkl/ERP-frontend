/**
 * What a role line MEANS on a payment — `payment-enum.ts`'s
 * PAYMENT_ROLE_SIDE / PAYMENT_ROLE_SETTLEMENT_MODE, which the server refuses
 * anything else against.
 *
 * The receipt's rules with the money going the other way (the Qt client's
 * `PaymentRoles`). The identity and the allocation engine are the receipt's
 * own, handed `PAYMENT_SETTLEMENT` in place of the receipt's answers — so the
 * two screens share one engine and cannot drift apart.
 *
 * ── The bank charge is INSIDE the amount ─────────────────────────────────
 * `tdAmount` is what leaves our bank. The party receives `tdAmount − charge`,
 * the bank leg is credited the full `tdAmount`, and Bank Charges is debited the
 * difference. So on a payment BANK_CHARGES is an ordinary ADDITION — money that
 * left on top of what the party got — and NOT the leg split it is on a
 * receipt, where the customer paid in full and the acquirer kept a slice.
 */
import type { SettlementPolicy } from "@/features/accounts/receipt/domain/roles";
import type { DrCr } from "@/features/accounts/receipt/receipt.types";
import type { PaymentLineRow, PaymentRole } from "../payment.types";

/**
 * The three roles the bills grid already carries as COLUMNS (Disc recd,
 * W/back, R/off). They ride on `allocations[]`, and the server 400s one sent
 * as a line too — "sending both would count it twice". WRITE_OFF is the
 * in-memory name of the W/back column's mirror; a TYPED write-back is
 * BALANCES_WRITTEN_BACK, which does travel.
 */
const MIRRORED_BY_BILL_COLUMN: ReadonlySet<string> = new Set([
  "DISCOUNT_RECEIVED",
  "WRITE_OFF",
  "ROUND_OFF",
]);

/** DR — paid on top of the bills, settles nothing. */
const ADDITION_ROLES: ReadonlySet<string> = new Set(["BANK_CHARGES", "INTEREST_PAID"]);

export function roleIsMirroredByBillColumn(role: string | null): boolean {
  return role !== null && MIRRORED_BY_BILL_COLUMN.has(role);
}

/** Nothing on a payment is a leg split — see the header. */
export function roleIsLegSplit(): boolean {
  return false;
}

export const PAYMENT_SETTLEMENT: SettlementPolicy = {
  isMirroredByBillColumn: roleIsMirroredByBillColumn,
  isLegSplit: roleIsLegSplit,
};

export function isAdditionRole(role: string | null): boolean {
  return role !== null && ADDITION_ROLES.has(role);
}

/** CR and settles: it reduces what we owe without money leaving. */
export function isDeductionRole(role: string | null): boolean {
  return (
    role === "TDS_PAYABLE" ||
    role === "BALANCES_WRITTEN_BACK" ||
    roleIsMirroredByBillColumn(role)
  );
}

/**
 * The side and the settling flag are DERIVED from the role on a payment, never
 * keyed: the Dr/Cr and Settles-bill cells do not open. (The one exception, a
 * DR ROUND_OFF that rounds a bill UP, is built by `seeded-lines.ts` and never
 * reaches here.)
 */
export function defaultsForRole(role: PaymentRole): { drCr: DrCr; settlesBill: boolean } {
  return {
    drCr: isAdditionRole(role) ? "DR" : "CR",
    settlesBill: isDeductionRole(role),
  };
}

/** How a role reads on screen. */
export const PAYMENT_ROLE_LABELS: Readonly<Record<PaymentRole, string>> = {
  TDS_PAYABLE: "TDS deducted",
  BANK_CHARGES: "Bank charges",
  INTEREST_PAID: "Interest paid",
  BALANCES_WRITTEN_BACK: "Balance written back",
  DISCOUNT_RECEIVED: "Discount received",
  WRITE_OFF: "Written back (W/back)",
  ROUND_OFF: "Round off",
};

/**
 * What the Type picker offers after the tenders, in the order they occur.
 *
 * NOT TDS_PAYABLE: the screen seeds it for a party the master flags, and the
 * server refuses one typed on any other party ("no section to file it under in
 * 26Q") — so there is nothing left for a typed one to do.
 *
 * NOT BANK_CHARGES either, although the Qt screen offers it: the server treats
 * every BANK_CHARGES line as the instruments' own charge and refuses the
 * payment unless Σ of them equals Σ Charge on the transfers ("They must
 * agree") — so a typed one beside the seeded one is a guaranteed 400. A charge
 * goes in the Charge cell of the transfer it was taken on.
 */
export const PICKABLE_PAYMENT_ROLES: readonly PaymentRole[] = [
  "INTEREST_PAID",
  "BALANCES_WRITTEN_BACK",
];

/**
 * The lines that go on the wire, in order.
 *
 * The mirrors stay home — EXCEPT a DR ROUND_OFF, which is a bill rounded UP:
 * money paid on top of it, carried by no column, so it travels as a line.
 *
 * A typed BALANCES_WRITTEN_BACK above `accounts.writeoff_approval_above`
 * (default 0: every one) needs `approvedBy`. As on the W/back column, posting
 * it IS the decision, so the posting user is named — exactly what the Qt
 * screen sends.
 *
 * `lineNo` on a pin is a position in THIS array, so anything that filters the
 * lines for the wire must be this one function.
 */
export function paymentLinesThatTravel<TLine extends Pick<PaymentLineRow, "role" | "drCr">>(
  lines: readonly TLine[],
): TLine[] {
  return lines.filter((line) => !(roleIsMirroredByBillColumn(line.role) && line.drCr !== "DR"));
}

/** What the Type chip says on a HELD row — what it is to the operator. */
export function debitChipFor(billType: string): string {
  const type = (billType ?? "").trim().toUpperCase();
  if (type === "ADVANCE") {
    return "ADVANCE";
  }
  if (type === "PURCHASE_RETURN") {
    return "DR NOTE";
  }
  return "DEBIT";
}
