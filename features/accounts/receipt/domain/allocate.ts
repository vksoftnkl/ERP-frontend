/**
 * Auto-allocate — the client's mirror of the server's `allocation-engine.ts`.
 *
 * It exists so the operator sees THE SAME SPLIT THE SERVER WILL WRITE before
 * pressing Post. The server is still the truth: it re-reads every bill under a
 * row lock and re-runs its own engine, and a disagreement is a 409.
 *
 * Three rules make it correct, and each of the three was a real bug first:
 *
 *  - **A deduction takes ROOM; an addition takes CASH.** Subtracting a
 *    deduction from the cash places that cash nowhere — the bill is left short
 *    by the TDS *and* the strip reports the TDS as a surplus. Placing an
 *    addition on a bill counts it twice.
 *  - **Credits are spent before cash.** A customer holding a 4,000 credit note
 *    who pays 10,000 against a 12,000 bill expects the note to be used.
 *  - **A typed Receive is an override.** The engine works AROUND it and the
 *    row's discount survives with it.
 *
 * Round at EVERY placement. Half a paisa left on each of forty bills is how an
 * identity ends up 0.02 out with nothing visibly wrong on screen.
 */
import type { BillRow, CreditRow, OtherLineRow, TenderRow } from "../receipt.types";
import { roomPaise, settledPaise } from "./identity";
import { sumOf, toPaise, toRupees } from "./money";
import { isAddition, isUnmirroredDeduction } from "./roles";

export type AllocationInput = {
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  tenders: readonly TenderRow[];
  otherLines: readonly OtherLineRow[];
};

export type AllocationResult = {
  bills: BillRow[];
  credits: CreditRow[];
  /** What no bill could take. It becomes an ADVANCE in the party's name. */
  onAccount: number;
};

/**
 * Clear every placement.
 *
 * Discount goes back to `ppdSuggested`, NOT to zero: clearing an allocation is
 * not a decision to refuse the prompt-payment discount the slabs offered.
 */
export function clearAllocations(input: {
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
}): AllocationResult {
  return {
    bills: input.bills.map((bill) => ({
      ...bill,
      receive: 0,
      discount: bill.ppdSuggested,
      writeOff: 0,
      roundOff: 0,
      receiveTyped: false,
      writeoffApprovedBy: null,
    })),
    credits: input.credits.map((credit) => ({ ...credit, apply: 0, applyTyped: false })),
    onAccount: 0,
  };
}

export function autoAllocate(input: AllocationInput): AllocationResult {
  // ── 0. Start from a clean slate, except where the operator typed ──────────
  // A typed Receive keeps its figure AND its discount. Everything else is the
  // engine's to place, so the round-off goes too: it is derived per allocation.
  const bills: BillRow[] = input.bills.map((bill) =>
    bill.receiveTyped ? { ...bill } : { ...bill, receive: 0, roundOff: 0 },
  );
  const credits: CreditRow[] = input.credits.map((credit) => ({ ...credit, apply: 0 }));

  // ── 1. Credits first ──────────────────────────────────────────────────────
  // The credit lands in the bill's Receive: for the bill it is settlement like
  // any other, and `creditsApplied[]` is what tells the server where it came
  // from.
  for (const credit of credits) {
    let creditLeft = toPaise(credit.pendingAmount);
    if (creditLeft <= 0) {
      continue;
    }
    let applied = 0;
    for (const bill of bills) {
      if (creditLeft <= 0) {
        break;
      }
      if (bill.receiveTyped) {
        continue;
      }
      const take = Math.min(creditLeft, roomPaise(bill));
      if (take <= 0) {
        continue;
      }
      bill.receive = toRupees(toPaise(bill.receive) + take);
      creditLeft -= take;
      applied += take;
    }
    credit.apply = toRupees(applied);
  }

  // ── 2. What the lines do to the budget ────────────────────────────────────
  const settlingDeductions = sumOf(
    input.otherLines.filter(isUnmirroredDeduction),
    (line) => line.amount,
  );
  const additions = sumOf(input.otherLines.filter(isAddition), (line) => line.amount);

  // ── 3. Then the cash ──────────────────────────────────────────────────────
  const available = sumOf(input.tenders, (tender) => tender.amount);
  let cashLeft = available - additions;
  // A deduction occupies room on the bills without being money, so the cash has
  // that much less room to fill. Computed once, over the room that is LEFT
  // after the credits have gone in.
  let roomLeft =
    bills.reduce((total, bill) => total + roomPaise(bill), 0) - settlingDeductions;

  for (const bill of bills) {
    if (bill.receiveTyped) {
      // The operator's figure stands and the cash it uses is spoken for. The
      // discount and write-off on the row are theirs too and are not touched.
      cashLeft -= toPaise(bill.receive);
      continue;
    }
    if (cashLeft <= 0 || roomLeft <= 0) {
      break;
    }
    const take = Math.min(cashLeft, roomPaise(bill), roomLeft);
    if (take <= 0) {
      continue;
    }
    bill.receive = toRupees(toPaise(bill.receive) + take);
    cashLeft -= take;
    roomLeft -= take;
  }

  return { bills, credits, onAccount: toRupees(Math.max(0, cashLeft)) };
}

/**
 * The row cap, applied to ONE cell.
 *
 * `receive + disc + w/off + r/off ≤ pending` on a bill: the server locks the
 * bill and refuses the excess, and `ck_abl_settled` is the backstop. When a
 * cell pushes the row over, only the cell JUST TYPED is given back — the other
 * three were deliberate — clamped to what still fits.
 *
 * It is a pure function returning the clamped value and a sentence, because
 * the Qt screen crashed doing this the other way: `showWarning` ran a nested
 * event loop, an `/open-items` reply landed inside it and replaced the lists,
 * and the row reference taken before the dialog was left dangling. Nothing
 * here reads state after a dialog, because nothing here opens one.
 */
export type CellClamp = { value: number; message: string | null };

export function clampBillCell(
  bill: BillRow,
  field: "receive" | "discount" | "writeOff" | "roundOff",
  typed: number,
): CellClamp {
  const wanted = Math.max(0, toPaise(typed));
  const others = settledPaise({ ...bill, [field]: 0 });
  const pending = toPaise(bill.pendingAmount);
  if (others + wanted <= pending) {
    return { value: toRupees(wanted), message: null };
  }
  const fits = Math.max(0, pending - others);
  return {
    value: toRupees(fits),
    message:
      `${bill.docRefno} has ${toRupees(pending).toFixed(2)} pending, and ` +
      `${toRupees(others + wanted).toFixed(2)} has been placed against it.`,
  };
}

/** The same cap for a credit: it may not be spent twice. */
export function clampCreditCell(credit: CreditRow, typed: number): CellClamp {
  const wanted = Math.max(0, toPaise(typed));
  const held = toPaise(credit.pendingAmount);
  if (wanted <= held) {
    return { value: toRupees(wanted), message: null };
  }
  return {
    value: toRupees(held),
    message: `${credit.docRefno} holds ${toRupees(held).toFixed(2)}. A credit cannot be spent twice.`,
  };
}
