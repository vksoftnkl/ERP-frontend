/**
 * The role lines the screen keeps for itself.
 *
 * Two kinds, and the difference is the whole module:
 *
 *  - **DERIVED** — DISCOUNT_ALLOWED, WRITE_OFF, ROUND_OFF and BANK_CHARGES.
 *    Their amounts are sums of columns the operator already typed somewhere
 *    else (the three bill columns, and the MDR column on the instruments), so
 *    they are rebuilt after every edit that could move them and the operator
 *    never types into them.
 *  - **OFFERED** — TDS_RECEIVABLE and TCS_PAYABLE. The screen puts the line
 *    there; the AMOUNT and the pin are the operator's and survive every
 *    rebuild.
 *
 * **The screen does not calculate TDS.** There is no rate anywhere in this
 * schema — only the booleans — and the certificate the customer holds is the
 * fact. Any figure we computed would be a guess that then disagrees with their
 * 26AS. Same for TCS: on the SALES basis it is already inside the bill, so
 * raising a line here would charge the customer twice.
 *
 * A seeded line may be re-amounted but never deleted: the server seeds it
 * again at post and then refuses the receipt as a disagreement.
 */
import type {
  BillRow,
  OtherLineRow,
  PartyFacts,
  ReceiptRole,
  TenderRow,
} from "../receipt.types";
import { sumOf, toRupees } from "./money";
import { defaultsForRole } from "./roles";

/** Roles this module owns. A line carrying one of them is never hand-made. */
const DERIVED_ROLES: readonly ReceiptRole[] = [
  "DISCOUNT_ALLOWED",
  "WRITE_OFF",
  "ROUND_OFF",
  "BANK_CHARGES",
];

const OFFERED_ROLES: readonly ReceiptRole[] = ["TDS_RECEIVABLE", "TCS_PAYABLE"];

export function isSeededRole(role: ReceiptRole | null): boolean {
  return (
    role !== null &&
    (DERIVED_ROLES.includes(role as ReceiptRole) || OFFERED_ROLES.includes(role as ReceiptRole))
  );
}

let seededKeySequence = 0;
function seededKey(role: ReceiptRole): string {
  seededKeySequence += 1;
  return `seeded-${role}-${seededKeySequence}`;
}

function blankSeededLine(role: ReceiptRole, amount: number): OtherLineRow {
  const defaults = defaultsForRole(role);
  return {
    key: seededKey(role),
    role,
    ledgerId: null,
    ledgerName: "",
    drCr: defaults.drCr,
    amount,
    settlesBill: defaults.settlesBill,
    narration: "",
    seeded: true,
    againstBillId: null,
    againstBillAccYear: null,
  };
}

export type SeedInput = {
  bills: readonly BillRow[];
  tenders: readonly TenderRow[];
  lines: readonly OtherLineRow[];
  party: PartyFacts;
};

/**
 * Rebuild the seeded lines around whatever the operator has keyed.
 *
 * Hand-added lines are returned untouched and in place. A derived line with a
 * zero total disappears — a 0.00 Discount Allowed row is a row that says
 * nothing and takes a line number that the pins are counted against.
 */
export function rebuildSeededLines(input: SeedInput): OtherLineRow[] {
  const derivedAmounts: Partial<Record<ReceiptRole, number>> = {
    DISCOUNT_ALLOWED: toRupees(sumOf(input.bills, (bill) => bill.discount)),
    WRITE_OFF: toRupees(sumOf(input.bills, (bill) => bill.writeOff)),
    ROUND_OFF: toRupees(sumOf(input.bills, (bill) => bill.roundOff)),
    BANK_CHARGES: toRupees(sumOf(input.tenders, (tender) => tender.mdrAmt)),
  };

  const offered = new Set<ReceiptRole>();
  if (input.party.loaded && input.party.isTdsApplicable) {
    offered.add("TDS_RECEIVABLE");
  }
  // On the SALES basis the invoice already carries the TCS. The two bases
  // never both apply, and raising a line under SALES bills it twice.
  if (input.party.loaded && input.party.isTcsApplicable && input.party.tcsBasis === "RECEIPT") {
    offered.add("TCS_PAYABLE");
  }

  const kept: OtherLineRow[] = [];
  const seenRoles = new Set<ReceiptRole>();

  for (const line of input.lines) {
    const role = line.role;
    if (role && DERIVED_ROLES.includes(role)) {
      const amount = derivedAmounts[role] ?? 0;
      seenRoles.add(role);
      if (amount === 0) {
        continue;
      }
      kept.push({ ...line, amount, seeded: true });
      continue;
    }
    if (role && OFFERED_ROLES.includes(role)) {
      seenRoles.add(role);
      if (!offered.has(role)) {
        // The party's flags have changed under it (a different customer, or
        // the facts have only just loaded). The line is no longer offered, and
        // one the operator never typed into is not worth keeping.
        if (line.amount === 0) {
          continue;
        }
      }
      kept.push({ ...line, seeded: true });
      continue;
    }
    kept.push(line);
  }

  for (const role of DERIVED_ROLES) {
    const amount = derivedAmounts[role] ?? 0;
    if (amount !== 0 && !seenRoles.has(role)) {
      kept.push(blankSeededLine(role, amount));
    }
  }
  for (const role of OFFERED_ROLES) {
    if (offered.has(role) && !seenRoles.has(role)) {
      kept.push(blankSeededLine(role, 0));
    }
  }

  return kept;
}

/** Why a seeded line refuses to be removed — said as an instruction. */
export function seededRemovalMessage(role: ReceiptRole): string {
  switch (role) {
    case "DISCOUNT_ALLOWED":
      return "This line is the total of the Disc column. Clear the discounts on the bills instead.";
    case "WRITE_OFF":
      return "This line is the total of the W/off column. Clear the write-offs on the bills instead.";
    case "ROUND_OFF":
      return "This line is the total of the R/off column. Clear the round-offs on the bills instead.";
    case "BANK_CHARGES":
      return "This line is the total of the MDR column. Clear the MDR on the instrument instead.";
    default:
      return "The server raises this line again at post and then refuses the receipt as a disagreement. Set its amount to zero instead.";
  }
}
