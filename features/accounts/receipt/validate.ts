/**
 * What may be saved, what may be posted, and — the part that matters — WHERE.
 *
 * Every problem carries a TARGET: a header field, or a cell addressed by grid,
 * row key and column. The screen focuses the target BEFORE showing the
 * message, so dismissing it lands the operator on the field that needs
 * changing rather than on whatever had focus when they pressed Post.
 *
 * Every refusal on an instrument row names the row number, because "a cheque
 * needs its number" is unhelpful on a receipt with four instruments.
 */
import type {
  BillRow,
  CreditRow,
  OtherLineRow,
  PartyFacts,
  ReceiptHeaderDraft,
  ReceiptSettings,
  TenderRow,
} from "./receipt.types";
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { computeIdentity, type ReceiptIdentity } from "./domain/identity";
import { toPaise } from "./domain/money";
import { isChequeTender, requiredRefLabel } from "./domain/tenders";

export type ProblemTarget =
  | { kind: "header"; field: keyof ReceiptHeaderDraft }
  | { kind: "bill"; rowKey: string; column: "receive" | "discount" | "writeOff" | "roundOff" }
  | { kind: "credit"; rowKey: string }
  | { kind: "tender"; rowKey: string; column: "type" | "amount" | "refNote" | "instrDate" }
  | { kind: "line"; rowKey: string; column: "type" | "amount" };

export type Problem = { message: string; target: ProblemTarget };

export type ValidationInput = {
  header: ReceiptHeaderDraft;
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  tenders: readonly TenderRow[];
  otherLines: readonly OtherLineRow[];
  party: PartyFacts;
  settings: ReceiptSettings;
  /** The offered masters, so a row can be asked what IT needs. */
  masters: readonly TenderMasterRow[];
};

function masterOf(
  input: ValidationInput,
  tender: TenderRow,
): TenderMasterRow | undefined {
  return input.masters.find((master) => master.tndId === tender.tenderId);
}

/** Everything a DRAFT must satisfy. A draft moves no money, so this is short. */
export function validateBeforeSave(input: ValidationInput): Problem[] {
  const problems: Problem[] = [];

  if (!input.header.partyId) {
    problems.push({
      message: "Choose the customer — a receipt is money from somebody.",
      target: { kind: "header", field: "partyId" },
    });
  }
  if (!input.header.voucherDate) {
    problems.push({
      message: "A receipt needs its date: it decides the accounting year it lands in.",
      target: { kind: "header", field: "voucherDate" },
    });
  }
  if (input.settings.salesmanMandatory && !input.header.employeeId) {
    problems.push({
      message: "This company records who collected every receipt. Name the salesman.",
      target: { kind: "header", field: "employeeId" },
    });
  }

  input.tenders.forEach((tender, index) => {
    const rowNo = index + 1;
    if (!tender.tenderId) {
      problems.push({
        message: `Instrument ${rowNo} has no tender — pick how the money arrived.`,
        target: { kind: "tender", rowKey: tender.key, column: "type" },
      });
      return;
    }
    if (toPaise(tender.amount) <= 0) {
      problems.push({
        message: `Instrument ${rowNo} carries no amount. Remove the row, or key what came in on it.`,
        target: { kind: "tender", rowKey: tender.key, column: "amount" },
      });
    }
    const master = masterOf(input, tender);
    if (isChequeTender(tender.tenderTypeId)) {
      if (!tender.refNo.trim()) {
        problems.push({
          message: `Instrument ${rowNo} is a cheque and needs its number — the register is keyed on it.`,
          target: { kind: "tender", rowKey: tender.key, column: "refNote" },
        });
      }
      if (!tender.instrumentDate) {
        problems.push({
          message:
            `Instrument ${rowNo} needs the date written on the cheque: that date is what ` +
            "decides whether it is money today or a post-dated cheque.",
          target: { kind: "tender", rowKey: tender.key, column: "instrDate" },
        });
      }
    } else if (master) {
      const refLabel = requiredRefLabel(master);
      if (refLabel && !tender.refNo.trim()) {
        problems.push({
          message: `Instrument ${rowNo} (${master.tndName}) needs its ${refLabel}.`,
          target: { kind: "tender", rowKey: tender.key, column: "refNote" },
        });
      }
    }
  });

  input.otherLines.forEach((line, index) => {
    if (!line.role && !line.ledgerId) {
      problems.push({
        message: `Line ${index + 1} names neither a role nor a ledger, so nothing can be posted to.`,
        target: { kind: "line", rowKey: line.key, column: "type" },
      });
      return;
    }
    if (toPaise(line.amount) <= 0 && !line.seeded) {
      problems.push({
        message: `Line ${index + 1} carries no amount.`,
        target: { kind: "line", rowKey: line.key, column: "amount" },
      });
    }
  });

  // A write-off above the threshold is a recorded decision, not a workflow.
  // The default threshold is 0, which means every write-off needs a name.
  for (const bill of input.bills) {
    if (toPaise(bill.writeOff) <= 0) {
      continue;
    }
    if (bill.writeOff > input.settings.writeoffApprovalAbove && !bill.writeoffApprovedBy) {
      problems.push({
        message:
          `The write-off on ${bill.docRefno} is above what may be written off unapproved ` +
          `(${input.settings.writeoffApprovalAbove.toFixed(2)}). Name who authorised it.`,
        target: { kind: "bill", rowKey: bill.billId, column: "writeOff" },
      });
    }
  }

  return problems;
}

/** Everything above, plus what only a POST has to answer for. */
export function validateBeforePost(input: ValidationInput): Problem[] {
  const problems = validateBeforeSave(input);
  const identity = computeIdentity(input);
  const hasInstrument = input.tenders.some((tender) => toPaise(tender.amount) > 0);
  const hasCredit = input.credits.some((credit) => toPaise(credit.apply) > 0);
  const firstTender = input.tenders[0];

  if (!hasInstrument && !hasCredit) {
    problems.push({
      message: "A receipt with neither an instrument nor a credit is a journal, not a receipt.",
      target: firstTender
        ? { kind: "tender", rowKey: firstTender.key, column: "amount" }
        : { kind: "header", field: "partyId" },
    });
  } else if (!hasInstrument) {
    problems.push({
      message:
        "Moving a credit from one bill to another is a journal, not a receipt — nothing has " +
        "been received. Add the instrument the money arrived on, or post it as a journal.",
      target: firstTender
        ? { kind: "tender", rowKey: firstTender.key, column: "amount" }
        : { kind: "header", field: "partyId" },
    });
  }

  if (!identity.balances) {
    const unsettled = input.bills.find((bill) => toPaise(bill.pendingAmount) > 0);
    problems.push({
      message: identityHint(identity),
      target: unsettled
        ? { kind: "bill", rowKey: unsettled.billId, column: "receive" }
        : firstTender
          ? { kind: "tender", rowKey: firstTender.key, column: "amount" }
          : { kind: "header", field: "partyId" },
    });
  }

  return problems;
}

/** The difference, phrased as the next thing to do about it. */
export function identityHint(identity: ReceiptIdentity): string {
  const amount = Math.abs(identity.difference).toFixed(2);
  if (identity.difference > 0) {
    return `${amount} received but not placed — allocate it to a bill or leave it on account.`;
  }
  if (identity.difference < 0) {
    return `${amount} placed but not received — reduce an allocation or add an instrument.`;
  }
  if (identity.onAccount > 0) {
    return (
      `${identity.onAccount.toFixed(2)} is not against any bill — it will be kept on account ` +
      "as an advance in this party's name."
    );
  }
  return "Received and allocated agree.";
}
