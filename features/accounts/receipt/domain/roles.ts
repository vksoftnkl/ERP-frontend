/**
 * What a role line MEANS to the arithmetic. Three questions, one answer each,
 * asked from `identity.ts`, `allocate.ts` and the payload builders — never from
 * a component, and never written twice.
 *
 * If any of these rules is duplicated at a call site, the copies drift, and
 * the screen and the server then disagree by exactly the amount of the line
 * that was classified twice.
 */
import type { OtherLineRow, ReceiptRole } from "../receipt.types";

/**
 * The three roles the BILLS GRID already carries as columns.
 *
 * They exist in state because the identity needs them on the left-hand side,
 * and they must NEVER go on the wire: `allocations[].discount / writeoff /
 * roundoff` already carry the same money, and sending both asks for it twice.
 * The server refuses that in two different ways depending on `settlesBill`
 * ("DISCOUNT_ALLOWED cannot settle a bill" / "…Out by 100.00"), and for a while
 * every receipt with a settlement discount was unpostable because of it.
 */
const MIRRORED_BY_BILL_COLUMN: ReadonlySet<string> = new Set([
  "DISCOUNT_ALLOWED",
  "WRITE_OFF",
  "ROUND_OFF",
]);

/**
 * BANK_CHARGES — the acquirer's MDR — is on NEITHER side of the identity.
 *
 * A customer pays 15,000 by card and the bank keeps 10. The customer still
 * paid 15,000 and the bill is settled in full: the 10 is a SPLIT OF THE BANK
 * LEG (bank 14,990, charges 10), not a deduction from the customer. Counting
 * it would make the identity demand 10 that nobody owes, which is the single
 * most common way to get a receipt screen wrong.
 */
const LEG_SPLIT_ROLES: ReadonlySet<string> = new Set(["BANK_CHARGES"]);

/** Roles that post on the CREDIT side — income and taxes payable. */
const CREDIT_SIDE_ROLES: ReadonlySet<string> = new Set([
  "SURCHARGE_RECOVERED",
  "INTEREST_INCOME",
  "TCS_PAYABLE",
]);

/*
 * Asked of a ROLE and of a LINE both, because the seeding table answers for a
 * role that has no line yet. The line forms delegate rather than repeat the
 * sets — one set, one answer.
 */
export function roleIsMirroredByBillColumn(role: ReceiptRole | null): boolean {
  return role !== null && MIRRORED_BY_BILL_COLUMN.has(role);
}

export function roleIsLegSplit(role: ReceiptRole | null): boolean {
  return role !== null && LEG_SPLIT_ROLES.has(role);
}

export function isCreditSide(role: ReceiptRole | null): boolean {
  return role !== null && CREDIT_SIDE_ROLES.has(role);
}

export function isMirroredByBillColumn(line: Pick<OtherLineRow, "role">): boolean {
  return roleIsMirroredByBillColumn(line.role);
}

export function isLegSplit(line: Pick<OtherLineRow, "role">): boolean {
  return roleIsLegSplit(line.role);
}

/** A line that takes money off what the party owes, and is not a leg split. */
export function isSettlingDeduction(line: OtherLineRow): boolean {
  return line.settlesBill && !isLegSplit(line);
}

/** A line the party paid ON TOP — interest, a surcharge, TCS collected. */
export function isAddition(line: OtherLineRow): boolean {
  return !line.settlesBill && !isLegSplit(line);
}

/**
 * A settling deduction the bills grid does NOT already carry — a TDS or a
 * claim. These are the ones that have to be added to ALLOCATED by hand, and
 * the ones the post spreads pro-rata over the bills.
 */
export function isUnmirroredDeduction(line: OtherLineRow): boolean {
  return isSettlingDeduction(line) && !isMirroredByBillColumn(line);
}

/**
 * The lines that actually go on the wire, in order.
 *
 * `lineNo` on a pin is a position in THIS array, so anything that filters it
 * must be this one function — numbered against the full list, a pin points at
 * the wrong line the moment a discount is on the receipt.
 */
export function linesThatTravel(lines: readonly OtherLineRow[]): OtherLineRow[] {
  return lines.filter((line) => !isMirroredByBillColumn(line));
}

/** The defaults a freshly picked role takes. The operator may override them. */
export function defaultsForRole(role: ReceiptRole): {
  drCr: "DR" | "CR";
  settlesBill: boolean;
} {
  if (isCreditSide(role)) {
    // Income and a tax payable are credits, and neither reduces what the party
    // owes — the customer paid them on top.
    return { drCr: "CR", settlesBill: false };
  }
  if (roleIsLegSplit(role) || role === "ROUND_OFF") {
    // The MDR is ours, not theirs. A round-off's settlement travels on the
    // bill's own column, so the line must not claim it again.
    return { drCr: "DR", settlesBill: false };
  }
  return { drCr: "DR", settlesBill: true };
}

/** How a role reads on screen. */
export const ROLE_LABELS: Readonly<Record<ReceiptRole, string>> = {
  TDS_RECEIVABLE: "TDS withheld",
  BANK_CHARGES: "Bank charges (MDR)",
  SURCHARGE_RECOVERED: "Surcharge recovered",
  CLAIMS_ALLOWED: "Claim allowed",
  INTEREST_INCOME: "Interest collected",
  DISCOUNT_ALLOWED: "Settlement discount",
  WRITE_OFF: "Written off",
  ROUND_OFF: "Round off",
  TCS_PAYABLE: "TCS collected",
};

/**
 * The roles the Type picker offers by hand.
 *
 * The mirrored three are absent: they are DERIVED from the bills grid's
 * columns, and a hand-keyed one would be a second way to say the same thing.
 * BANK_CHARGES is absent for the same reason — it is derived from the MDR
 * column on the instruments.
 */
export const PICKABLE_ROLES: readonly ReceiptRole[] = [
  "TDS_RECEIVABLE",
  "CLAIMS_ALLOWED",
  "INTEREST_INCOME",
  "SURCHARGE_RECOVERED",
  "TCS_PAYABLE",
];
