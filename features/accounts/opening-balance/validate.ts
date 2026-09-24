/**
 * What stops a save, reported in the operator's terms.
 *
 * Every problem names a ledger or an invoice number. None of them names a
 * constraint: "ck_abl_due_date" tells an accountant nothing, and the server's
 * own messages — which are already written for them — are shown verbatim when
 * they arrive.
 *
 * **An unbalanced set is NOT a problem here.** A half-keyed opening is a normal
 * state for an afternoon's work, and refusing to save it would force the
 * operator to hold the morning in their head. The totals band says so, every
 * time, and the save goes through (§8.1).
 */
import { isBlankBill, isBlankLedgerRow, toPaise } from "./derived";
import type { BillRow, LedgerRow } from "./opening-balance.types";
import { isBefore } from "./wire/dates";

export type Problem = {
  /** Which grid it is in, so the screen can open the right party's panel. */
  scope: "ledger" | "bill";
  /** The party whose breakup holds it, for a bill problem. */
  partyId?: string;
  /** The row's draft key, for focusing it. */
  key: string;
  message: string;
};

export type ValidateInput = {
  rows: readonly LedgerRow[];
  /** Every DIRTY party, not only the one on screen. */
  dirtyParties: readonly { partyId: string; partyName: string; bills: readonly BillRow[] }[];
};

export function validate(input: ValidateInput): Problem[] {
  const problems: Problem[] = [];

  for (const row of input.rows) {
    if (isBlankLedgerRow(row)) {
      // The trailing picker row. Not data — unless somebody has typed a figure
      // into it, which the grid does not allow but a future edit might.
      if (toPaise(row.amount) !== 0) {
        problems.push({
          scope: "ledger",
          key: row.key,
          message: "A row carries an amount but no ledger. Pick the account it opens.",
        });
      }
      continue;
    }
    if (toPaise(row.amount) > 0 && row.drCr === "") {
      problems.push({
        scope: "ledger",
        key: row.key,
        message: `"${row.ledName}" has an amount but no side. Set Dr or Cr.`,
      });
    }
  }

  for (const party of input.dirtyParties) {
    const seen = new Map<string, string>();
    for (const bill of party.bills) {
      if (isBlankBill(bill)) {
        continue;
      }
      const label = bill.docRefno.trim() || "a bill";
      const where = `${party.partyName} · ${label}`;

      if (bill.docRefno.trim() === "") {
        problems.push({
          scope: "bill",
          partyId: party.partyId,
          key: bill.key,
          message: `${party.partyName}: a bill has no invoice number — it is what the receipt will be matched against.`,
        });
      } else {
        // Trimmed and case-insensitive: "inv/1" and " INV/1 " are the same
        // invoice to an accountant, and `ux_abl_doc_refno` would refuse the
        // second one anyway — after the first half of the save had gone through.
        const fingerprint = bill.docRefno.trim().toUpperCase();
        const first = seen.get(fingerprint);
        if (first !== undefined) {
          problems.push({
            scope: "bill",
            partyId: party.partyId,
            key: bill.key,
            message: `${party.partyName}: "${bill.docRefno.trim()}" is listed twice. A bill opens once per party per year.`,
          });
        } else {
          seen.set(fingerprint, bill.key);
        }
      }

      if (bill.docDate === "") {
        problems.push({
          scope: "bill",
          partyId: party.partyId,
          key: bill.key,
          message: `${where}: no invoice date — ageing measures from it.`,
        });
      } else if (bill.dueDate !== "" && isBefore(bill.dueDate, bill.docDate)) {
        problems.push({
          scope: "bill",
          partyId: party.partyId,
          key: bill.key,
          message: `${where}: the due date is before the invoice date.`,
        });
      }

      if (toPaise(bill.amount) <= 0) {
        problems.push({
          scope: "bill",
          partyId: party.partyId,
          key: bill.key,
          message: `${where}: the amount must be more than zero. Remove the row instead.`,
        });
      }
    }
  }

  return problems;
}
