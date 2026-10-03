/**
 * The role lines the screen keeps for itself — the Qt screen's
 * `refreshSeededLines()`.
 *
 * On a payment EVERY seeded line is derived; none is the operator's to key:
 *
 *  - **TDS_PAYABLE** — worked out from the instruments exactly as the server
 *    does (`tds.ts`), because the server seeds it again and refuses a figure
 *    that disagrees.
 *  - **BANK_CHARGES** — Σ of the Charge column. Inside the transfers' amounts,
 *    and an ADDITION here (money that left on top of what the party got).
 *  - **DISCOUNT_RECEIVED / WRITE_OFF / ROUND_OFF** — mirrors of the bill
 *    columns. Counted by the identity, never sent.
 *  - **A DR ROUND_OFF** — a bill rounded UP (a negative R/off). Not a mirror:
 *    it is money paid on top of the bill, an addition, and it TRAVELS.
 *
 * Hand-added lines (interest, a typed write-back, a free ledger) are returned
 * untouched, after the seeded ones — the order the server stores them in, and
 * so the order a pin's `lineNo` is counted against.
 */
import { sumOf, toPaise, toRupees } from "@/features/accounts/receipt/domain/money";
import type { BillRow, PaymentLineRow, PaymentPartyFacts, PaymentRole, PaymentTenderRow } from "../payment.types";
import { defaultsForRole } from "./roles";
import { computePaymentTds, NO_TDS, tdsApplies, tdsNarration, type PaymentTds } from "./tds";

/** Bills rounded UP: Σ of the negative R/off figures, as a positive amount, in paise. */
export function roundUpPaise(bills: readonly BillRow[]): number {
  return bills.reduce(
    (total, bill) => (bill.roundOff < 0 ? total - toPaise(bill.roundOff) : total),
    0,
  );
}

/** Σ of the transfers' charges — the BANK_CHARGES line, in paise. */
export function chargePaise(tenders: readonly PaymentTenderRow[]): number {
  return sumOf(tenders, (tender) => tender.mdrAmt);
}

function isRoundUpLine(line: Pick<PaymentLineRow, "role" | "drCr">): boolean {
  return line.role === "ROUND_OFF" && line.drCr === "DR";
}

/**
 * What the party receives for what it supplied: Σ instruments less EVERY DR
 * line — the charge, a round-up, interest, a free DR ledger (notes 62 B1).
 *
 * Counted from the grids rather than from the seeded lines, because the
 * seeded lines are what this computation is about to rebuild. A manual DR
 * ROUND_OFF (only ever a reopened document's remembered round-up) gives way
 * to the bills' own round-up when there is one, as it does below.
 */
export function tdsNetPaise(input: {
  bills: readonly BillRow[];
  tenders: readonly PaymentTenderRow[];
  lines: readonly PaymentLineRow[];
}): number {
  const roundUp = roundUpPaise(input.bills);
  let extras = chargePaise(input.tenders) + roundUp;
  for (const line of input.lines) {
    if (line.seeded || line.drCr !== "DR") {
      continue;
    }
    if (roundUp > 0 && line.role === "ROUND_OFF") {
      continue;
    }
    extras += toPaise(line.amount);
  }
  return sumOf(input.tenders, (tender) => tender.amount) - extras;
}

/** The TDS this payment carries, as the server will work it out. */
export function paymentTdsOf(input: {
  bills: readonly BillRow[];
  tenders: readonly PaymentTenderRow[];
  lines: readonly PaymentLineRow[];
  party: PaymentPartyFacts;
}): PaymentTds {
  if (!input.party.loaded) {
    return NO_TDS;
  }
  return computePaymentTds(input.party, toRupees(tdsNetPaise(input)));
}

let seededKeySequence = 0;

function seededLine(
  role: PaymentRole,
  amount: number,
  narration: string,
  pin: { againstBillId: string | null; againstBillAccYear: string | null } | undefined,
): PaymentLineRow {
  seededKeySequence += 1;
  const defaults = defaultsForRole(role);
  return {
    key: `payment-seeded-${role}-${seededKeySequence}`,
    role,
    ledgerId: null,
    ledgerName: "",
    drCr: defaults.drCr,
    amount,
    settlesBill: defaults.settlesBill,
    narration,
    seeded: true,
    againstBillId: pin?.againstBillId ?? null,
    againstBillAccYear: pin?.againstBillAccYear ?? null,
    approvedBy: null,
  };
}

export type PaymentSeedInput = {
  bills: readonly BillRow[];
  tenders: readonly PaymentTenderRow[];
  lines: readonly PaymentLineRow[];
  party: PaymentPartyFacts;
};

/**
 * Rebuild the seeded lines around whatever the operator has keyed.
 *
 * A seeded line with a zero total disappears: a 0.00 Bank Charges row says
 * nothing and takes a line number the pins are counted against. A seeded
 * line's PIN survives the rebuild (a TDS pinned to one bill stays pinned) and
 * so does its key, so a row the cursor is on is not replaced under it.
 */
export function rebuildPaymentSeededLines(input: PaymentSeedInput): PaymentLineRow[] {
  const tds = paymentTdsOf(input);

  const manual: PaymentLineRow[] = [];
  const previous = new Map<string, PaymentLineRow>();
  for (const line of input.lines) {
    // A TDS line on a party this screen cannot compute TDS for (not flagged,
    // or no rate in force) is not the screen's to rebuild. The server refuses
    // it on an unflagged party, and the validation says so — it is kept as
    // keyed rather than silently dropped.
    if (line.seeded && line.role === "TDS_PAYABLE" && input.party.loaded && !tdsApplies(input.party)) {
      manual.push({ ...line, seeded: false });
      continue;
    }
    if (line.seeded) {
      previous.set(isRoundUpLine(line) ? "ROUND_UP" : (line.role ?? ""), line);
      continue;
    }
    manual.push(line);
  }

  let discount = 0;
  let writeBack = 0;
  let roundOff = 0;
  for (const bill of input.bills) {
    discount += toPaise(bill.discount);
    writeBack += toPaise(bill.writeOff);
    if (bill.roundOff > 0) {
      roundOff += toPaise(bill.roundOff);
    }
  }
  const roundUp = roundUpPaise(input.bills);

  // A manual DR ROUND_OFF only ever comes from a reopened document — the
  // round-up the draft remembered. Once the operator rounds up on the bills
  // again, the bills say it, and the old record gives way instead of
  // travelling beside the new one.
  const kept = roundUp > 0 ? manual.filter((line) => !isRoundUpLine(line)) : manual;

  const seeded: PaymentLineRow[] = [];
  const seed = (slot: string, role: PaymentRole, paise: number, narration: string) => {
    if (paise <= 0) {
      return;
    }
    const was = previous.get(slot);
    const line = seededLine(role, toRupees(paise), narration, was);
    seeded.push(was ? { ...line, key: was.key } : line);
  };

  if (!input.party.loaded) {
    // Nothing to work TDS out FROM — a posted payment is shown without its
    // party's facts — so the line it was posted with stands as it is.
    const was = previous.get("TDS_PAYABLE");
    if (was) {
      seeded.push(was);
    }
  } else if (tds.deducted) {
    seed("TDS_PAYABLE", "TDS_PAYABLE", toPaise(tds.tax), tdsNarration(tds));
  }
  seed("BANK_CHARGES", "BANK_CHARGES", chargePaise(input.tenders), "the transfer's charge");
  seed("DISCOUNT_RECEIVED", "DISCOUNT_RECEIVED", discount, "mirror of Disc recd");
  seed("WRITE_OFF", "WRITE_OFF", writeBack, "mirror of W/back");
  seed("ROUND_OFF", "ROUND_OFF", roundOff, "mirror of R/off");
  if (roundUp > 0) {
    const was = previous.get("ROUND_UP");
    seededKeySequence += 1;
    seeded.push({
      key: was?.key ?? `payment-seeded-ROUND_UP-${seededKeySequence}`,
      role: "ROUND_OFF",
      ledgerId: null,
      ledgerName: "",
      // Money paid ON TOP of the bills, expensed to Round Off: an addition
      // that settles nothing, and that is why it travels.
      drCr: "DR",
      amount: toRupees(roundUp),
      settlesBill: false,
      narration: "rounded up",
      seeded: true,
      againstBillId: null,
      againstBillAccYear: null,
      approvedBy: null,
    });
  }

  return [...seeded, ...kept];
}

/** Why a seeded line refuses to be removed — said as an instruction. */
export function seededRemovalMessage(line: Pick<PaymentLineRow, "role" | "drCr">): string {
  if (isRoundUpLine(line)) {
    return "This line is a bill rounded up — clear the negative R/off on the bill instead.";
  }
  switch (line.role) {
    case "TDS_PAYABLE":
      return "TDS is worked out from the instruments, exactly as the server will — change what is paid and this line follows.";
    case "BANK_CHARGES":
      return "This line is the total of the Charge column. Clear the charge on the transfer instead.";
    case "DISCOUNT_RECEIVED":
      return "This line is the total of the Disc recd column. Clear the discounts on the bills instead.";
    case "WRITE_OFF":
      return "This line is the total of the W/back column. Clear the write-backs on the bills instead.";
    case "ROUND_OFF":
      return "This line is the total of the R/off column. Clear the round-offs on the bills instead.";
    default:
      return "This line is derived from the grids — change the figure it comes from.";
  }
}
