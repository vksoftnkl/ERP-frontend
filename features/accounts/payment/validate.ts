/**
 * What may be saved, what may be posted, and WHERE — the receipt's rule that
 * every problem carries a target, so the screen lands the operator on the
 * cell that needs changing.
 *
 * What a payment refuses that a receipt does not:
 *
 *  - a cheque with no BOOK — the leaf comes from it;
 *  - a cheque dated before the payment (the server's 400);
 *  - a transfer whose charge is the whole amount — the party would get nothing;
 *  - a TDS-applicable party with no rate in force — the server refuses even a
 *    zero-TDS payment to it until a rate exists, so it is said before Save
 *    rather than discovered after;
 *  - a TDS line on a party that is not TDS-applicable (it has no section to
 *    file under in 26Q — the server's 400).
 *
 * And what it does NOT ask for: a cheque NUMBER (the server's), or a transfer's
 * UTR or beneficiary (both optional on the wire, as in the Qt screen).
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { computeIdentity, type ReceiptIdentity } from "@/features/accounts/receipt/domain/identity";
import { toPaise } from "@/features/accounts/receipt/domain/money";
import type {
  BillRow,
  CreditRow,
  PaymentHeaderDraft,
  PaymentLineRow,
  PaymentPartyFacts,
  PaymentSettings,
  PaymentTenderRow,
} from "./payment.types";
import { PAYMENT_SETTLEMENT } from "./domain/roles";
import { isChequeType, isTransferType } from "./domain/tenders";

export type PaymentProblemTarget =
  | { kind: "header"; field: keyof PaymentHeaderDraft }
  | { kind: "bill"; rowKey: string; column: "receive" | "discount" | "writeOff" | "roundOff" }
  | { kind: "credit"; rowKey: string }
  | {
      kind: "tender";
      rowKey: string;
      column: "type" | "amount" | "refNote" | "instrDate" | "bankName" | "charge";
    }
  | { kind: "line"; rowKey: string; column: "type" | "amount" };

export type PaymentProblem = { message: string; target: PaymentProblemTarget };

export type PaymentValidationInput = {
  header: PaymentHeaderDraft;
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  tenders: readonly PaymentTenderRow[];
  lines: readonly PaymentLineRow[];
  party: PaymentPartyFacts;
  settings: PaymentSettings;
  masters: readonly TenderMasterRow[];
};

/** Everything a DRAFT must satisfy. */
export function validatePaymentBeforeSave(input: PaymentValidationInput): PaymentProblem[] {
  const problems: PaymentProblem[] = [];

  if (!input.header.partyId) {
    problems.push({
      message: "Choose the payee — a payment is money to somebody.",
      target: { kind: "header", field: "partyId" },
    });
  }
  if (!input.header.voucherDate) {
    problems.push({
      message: "The payment needs a date: it decides the accounting year it lands in.",
      target: { kind: "header", field: "voucherDate" },
    });
  }
  if (input.settings.salesmanMandatory && !input.header.employeeId) {
    problems.push({
      message: "This company records who made every payment. Name who paid it.",
      target: { kind: "header", field: "employeeId" },
    });
  }
  if (input.party.loaded && input.party.isMoneyLedger) {
    problems.push({
      message:
        `${input.party.ledName || "This ledger"} is one of our own cash or bank accounts. Money ` +
        "moved between them is a Contra (menu 104), not a payment to a party.",
      target: { kind: "header", field: "partyId" },
    });
  }
  if (
    input.party.loaded &&
    input.party.isTdsApplicable &&
    (input.party.tdsRate === null || !input.party.tdsSection)
  ) {
    problems.push({
      message:
        `${input.party.ledName || "This party"} is TDS-applicable under ` +
        `${input.party.tdsSection || "no section"}, and no rate is in force for it in the TDS ` +
        "rates table — the server refuses the payment until one is.",
      target: { kind: "header", field: "partyId" },
    });
  }

  if (input.tenders.length === 0) {
    problems.push({
      message: "Nothing is being paid. Add the instrument the money goes out on.",
      target: { kind: "header", field: "partyId" },
    });
  }

  input.tenders.forEach((tender, index) => {
    const rowNo = index + 1;
    if (!tender.tenderId) {
      problems.push({
        message: `Row ${rowNo} has no tender. Pick how the money is paid.`,
        target: { kind: "tender", rowKey: tender.key, column: "type" },
      });
      return;
    }
    if (toPaise(tender.amount) <= 0) {
      problems.push({
        message: `${tender.tenderName || "The instrument"} on row ${rowNo} has no amount. Remove the row or key what is paid.`,
        target: { kind: "tender", rowKey: tender.key, column: "amount" },
      });
    }
    if (isChequeType(tender.tenderTypeId)) {
      if (!tender.cheque.chequeBookId) {
        problems.push({
          message: `The cheque on row ${rowNo} needs its book. Press F4 and pick the book it is written from.`,
          target: { kind: "tender", rowKey: tender.key, column: "bankName" },
        });
      }
      if (!tender.instrumentDate) {
        problems.push({
          message:
            `The cheque on row ${rowNo} needs the date written on it — a date after the ` +
            "payment makes it post-dated.",
          target: { kind: "tender", rowKey: tender.key, column: "instrDate" },
        });
      } else if (input.header.voucherDate && tender.instrumentDate < input.header.voucherDate) {
        problems.push({
          message:
            `The cheque on row ${rowNo} is dated before the payment. A cheque we write cannot ` +
            "be back-dated — date it the payment's day or later.",
          target: { kind: "tender", rowKey: tender.key, column: "instrDate" },
        });
      }
    }
    if (
      isTransferType(tender.tenderTypeId) &&
      toPaise(tender.mdrAmt) > 0 &&
      toPaise(tender.mdrAmt) >= toPaise(tender.amount)
    ) {
      problems.push({
        message: `The charge on row ${rowNo} is the whole amount — the party would receive nothing.`,
        target: { kind: "tender", rowKey: tender.key, column: "charge" },
      });
    }
  });

  const rowOffset = input.tenders.length;
  input.lines.forEach((line, index) => {
    const rowNo = rowOffset + index + 1;
    if (!line.role && !line.ledgerId) {
      problems.push({
        message: `Row ${rowNo} names neither a role nor a ledger.`,
        target: { kind: "line", rowKey: line.key, column: "type" },
      });
      return;
    }
    if (toPaise(line.amount) <= 0) {
      problems.push({
        message: `Row ${rowNo} has no amount.`,
        target: { kind: "line", rowKey: line.key, column: "amount" },
      });
    }
    if (line.role === "TDS_PAYABLE" && input.party.loaded && !input.party.isTdsApplicable) {
      problems.push({
        message:
          `${input.party.ledName || "This party"} is not TDS-applicable in its ledger master, so ` +
          "TDS would have no section to file under. Mark the party TDS-applicable and the " +
          "payment works the deduction out itself — or remove the line.",
        target: { kind: "line", rowKey: line.key, column: "type" },
      });
    }
  });

  return problems;
}

/** Everything above, plus what only a POST has to answer for. */
export function validatePaymentBeforePost(input: PaymentValidationInput): PaymentProblem[] {
  const problems = validatePaymentBeforeSave(input);
  const identity = computeIdentity(
    { bills: input.bills, credits: input.credits, tenders: input.tenders, otherLines: input.lines },
    PAYMENT_SETTLEMENT,
  );
  const paid = input.tenders.some((tender) => toPaise(tender.amount) > 0);
  const held = input.credits.some((credit) => toPaise(credit.apply) > 0);
  const firstTender = input.tenders[0];
  const amountTarget: PaymentProblemTarget = firstTender
    ? { kind: "tender", rowKey: firstTender.key, column: "amount" }
    : { kind: "header", field: "partyId" };

  if (!paid && !held) {
    problems.push({
      message:
        "Nothing has been paid and nothing we hold applied. A payment with neither is a " +
        "journal, and the server says so.",
      target: amountTarget,
    });
  } else if (!paid) {
    problems.push({
      message: "Only an item we hold has been applied. Moving it onto a bill is a journal, not a payment.",
      target: amountTarget,
    });
  }

  if (!identity.balances) {
    const unsettled = input.bills.find((bill) => toPaise(bill.pendingAmount) > 0);
    problems.push({
      message: paymentIdentityHint(identity),
      target: unsettled
        ? { kind: "bill", rowKey: unsettled.billId, column: "receive" }
        : amountTarget,
    });
  }

  return problems;
}

/** The difference, phrased as the next thing to do about it. */
export function paymentIdentityHint(identity: ReceiptIdentity): string {
  const amount = Math.abs(identity.difference).toFixed(2);
  if (identity.difference > 0) {
    return `${amount} paid but not placed — put it against a bill, or leave it on account.`;
  }
  if (identity.difference < 0) {
    return `${amount} placed but not paid — reduce an allocation or add an instrument.`;
  }
  if (identity.onAccount > 0) {
    return (
      `${identity.onAccount.toFixed(2)} is not against any bill — it will be kept on account ` +
      "as an advance to this party."
    );
  }
  return "Paid and allocated agree.";
}
