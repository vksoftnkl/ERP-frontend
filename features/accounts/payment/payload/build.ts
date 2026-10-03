/**
 * `/payments/create`, `/payments/post` and `/payments/amend` — the bodies.
 *
 * The receipt's builders, with what a payment does differently:
 *
 *  - **A cheque row sends its BOOK and never a number.** `cheque{chequeBookId,
 *    favouring, acPayee}` — exactly `SavePaymentChequeDto`'s keys — and no
 *    `tdRefNo`: the leaf is the server's, and a typed one is a 400. Stripped on
 *    an amend too, so the restated payment takes a NEW leaf.
 *  - **A transfer sends its charge and a beneficiary.** `tdMdrAmt` is INSIDE
 *    `tdAmount`; the beneficiary is a snapshot of where the money went.
 *  - **The lines that travel are the payment's** (`paymentLinesThatTravel`):
 *    the mirrors stay home except a DR ROUND_OFF, and a typed write-back names
 *    its approver.
 *  - **A round-up travels as that DR line, not as R/off.** The server's
 *    `roundoff` is round-DOWN only (a positive figure), so a bill rounded up
 *    is sent at its exact figure — `amount + roundOff`, `roundoff: 0` — and the
 *    paise it was over ride on the line.
 *  - **The approver is the posting user.** A write-back above
 *    `accounts.writeoff_approval_above` (default 0: every one) needs a user id
 *    on it; posting it IS the decision, so the Qt screen names the poster and
 *    so does this one.
 *
 * Nothing may be added to any body: `forbidNonWhitelisted` fails the whole
 * request on one unknown key.
 */
import { computeIdentity, settledPaise } from "@/features/accounts/receipt/domain/identity";
import { roundMoney, toPaise, toRupees } from "@/features/accounts/receipt/domain/money";
import { buildCreditMemo } from "@/features/accounts/receipt/payload/build-draft";
import {
  buildAllocations,
  buildOtherLinePins,
} from "@/features/accounts/receipt/payload/build-post";
import type { PostReceiptAllocationBody } from "@/features/accounts/receipt/receipt.types";
import type {
  AmendPaymentBody,
  BillRow,
  CreditRow,
  PaymentHeaderDraft,
  PaymentLineRow,
  PaymentTenderRow,
  PostPaymentBody,
  SaveDraftPaymentBody,
  SavePaymentOtherLineBody,
  SavePaymentTenderBody,
} from "../payment.types";
import { PAYMENT_SETTLEMENT, paymentLinesThatTravel } from "../domain/roles";
import { isChequeType, isTransferType, isUpiType } from "../domain/tenders";

function trimmed(value: string | null | undefined): string | undefined {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
}

/** One instrument, as `SavePaymentTenderDto` takes it. */
export function buildPaymentTenderBodies(
  tenders: readonly PaymentTenderRow[],
): SavePaymentTenderBody[] {
  return tenders.map((tender, index) => {
    const cheque = isChequeType(tender.tenderTypeId);
    const transfer = isTransferType(tender.tenderTypeId);
    const body: SavePaymentTenderBody = {
      ...(tender.tdId ? { tdId: tender.tdId } : {}),
      // 1-based and contiguous. A leaf exhausted at post is reported against
      // `tenders.<tdRowNo>`, and the register joins its row to it by this.
      tdRowNo: index + 1,
      tdTenderId: tender.tenderId,
      tdTenderTypeId: tender.tenderTypeId,
      ...(tender.tenderLedgerId ? { tdTenderLedgerId: tender.tenderLedgerId } : {}),
      tdAmount: roundMoney(tender.amount),
    };
    if (cheque) {
      // The book decides the bank; the server takes the leaf at post.
      if (trimmed(tender.bankName)) {
        body.tdBankName = tender.bankName.trim();
      }
      if (tender.instrumentDate) {
        body.tdInstrumentDate = tender.instrumentDate;
      }
      if (tender.cheque.chequeBookId) {
        body.cheque = {
          chequeBookId: tender.cheque.chequeBookId,
          ...(trimmed(tender.cheque.favouring) ? { favouring: tender.cheque.favouring.trim() } : {}),
          acPayee: tender.cheque.acPayee,
        };
      }
      return body;
    }
    if (trimmed(tender.refNo)) {
      body.tdRefNo = tender.refNo.trim();
    }
    if (transfer) {
      if (toPaise(tender.mdrAmt) > 0) {
        body.tdMdrAmt = roundMoney(tender.mdrAmt);
      }
      const name = trimmed(tender.beneficiary.name);
      const accountNo = trimmed(tender.beneficiary.accountNo);
      const ifsc = trimmed(tender.beneficiary.ifsc)?.toUpperCase();
      if (name || accountNo || ifsc) {
        body.beneficiary = {
          ...(name ? { name } : {}),
          ...(accountNo ? { accountNo } : {}),
          ...(ifsc ? { ifsc } : {}),
        };
      }
      if (isUpiType(tender.tenderTypeId) && trimmed(tender.payerVpa)) {
        body.tdPayerVpa = tender.payerVpa.trim();
      }
    }
    return body;
  });
}

/** The lines that travel, a role OR a ledger, and a write-back's approver. */
export function buildPaymentLineBodies(
  lines: readonly PaymentLineRow[],
  approver: string,
): SavePaymentOtherLineBody[] {
  return paymentLinesThatTravel(lines).map((line) => {
    const approvedBy =
      line.role === "BALANCES_WRITTEN_BACK" ? (line.approvedBy ?? (approver || null)) : null;
    return {
      ...(line.role ? { role: line.role } : {}),
      ...(!line.role && line.ledgerId ? { ledgerId: line.ledgerId } : {}),
      drCr: line.drCr,
      amount: roundMoney(line.amount),
      settlesBill: line.settlesBill,
      ...(trimmed(line.narration) ? { narration: line.narration.trim() } : {}),
      ...(approvedBy ? { approvedBy } : {}),
    };
  });
}

/**
 * The draft's memo of the settlement. A bill rounded UP is remembered at its
 * exact figure (the paise it was over are on the DR ROUND_OFF line, which the
 * draft keeps), because the memo's `roundoff` is round-down only.
 */
export function buildPaymentDraftMemo(
  bills: readonly BillRow[],
  approver: string,
): PostReceiptAllocationBody[] {
  return bills
    .filter((bill) => settledPaise(bill) > 0)
    .map((bill) => {
      const roundUp = bill.roundOff < 0;
      const writeOff = toPaise(bill.writeOff) > 0;
      return {
        billId: bill.billId,
        billAccYear: bill.billAccYear,
        amount: roundMoney(roundUp ? bill.receive + bill.roundOff : bill.receive),
        discount: roundMoney(bill.discount),
        writeoff: roundMoney(bill.writeOff),
        roundoff: roundUp ? 0 : roundMoney(bill.roundOff),
        ...(writeOff && approver ? { writeoffApprovedBy: approver } : {}),
      };
    });
}

export type PaymentDraftInput = {
  header: PaymentHeaderDraft;
  tenders: readonly PaymentTenderRow[];
  lines: readonly PaymentLineRow[];
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  /** The posting user: the approver of a write-back, and `avhUserId`. */
  userId: string;
};

export function buildPaymentDraftPayload(input: PaymentDraftInput): SaveDraftPaymentBody {
  const { header } = input;
  return {
    ...(header.voucherId ? { avhVoucherId: header.voucherId } : {}),
    avhCompanyId: header.scope.companyId,
    avhBranchId: header.scope.branchId,
    avhAccYear: header.scope.accYear,
    avhVoucherDate: header.voucherDate,
    avhPartyId: header.partyId,
    // ONE element: who paid it.
    ...(header.employeeId ? { avhEmployeeId: [header.employeeId] } : {}),
    ...(trimmed(header.usrRefno) ? { avhUsrRefno: header.usrRefno.trim() } : {}),
    ...(trimmed(header.docRefno) ? { avhDocRefno: header.docRefno.trim() } : {}),
    ...(header.docDate ? { avhDocDate: header.docDate } : {}),
    ...(trimmed(header.remarks) ? { avhRemarks: header.remarks.trim() } : {}),
    avhDeviceType: "WEB",
    ...(input.userId ? { avhUserId: input.userId } : {}),
    tenders: buildPaymentTenderBodies(input.tenders),
    otherLines: buildPaymentLineBodies(input.lines, input.userId),
    allocations: buildPaymentDraftMemo(input.bills, input.userId),
    creditsApplied: buildCreditMemo(input.credits),
    replace: true,
  };
}

export type PaymentPostInput = {
  header: PaymentHeaderDraft;
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  tenders: readonly PaymentTenderRow[];
  lines: readonly PaymentLineRow[];
  userId: string;
};

/** The allocations, with a round-up folded back into an exact bill figure. */
export function buildPaymentAllocations(
  bills: readonly BillRow[],
  lines: readonly PaymentLineRow[],
  approver: string,
): PostReceiptAllocationBody[] {
  const rows = buildAllocations({ bills, otherLines: lines }, PAYMENT_SETTLEMENT);
  const byId = new Map(bills.map((bill) => [bill.billId, bill]));
  return rows.map((row) => {
    const bill = byId.get(row.billId);
    const next: PostReceiptAllocationBody = { ...row };
    if (bill && bill.roundOff < 0) {
      next.amount = toRupees(toPaise(row.amount) + toPaise(bill.roundOff));
      next.roundoff = 0;
    }
    if (toPaise(next.writeoff ?? 0) > 0 && !next.writeoffApprovedBy && approver) {
      next.writeoffApprovedBy = approver;
    }
    return next;
  });
}

export function buildPaymentPostPayload(input: PaymentPostInput): PostPaymentBody {
  const identity = computeIdentity(
    {
      bills: input.bills,
      credits: input.credits,
      tenders: input.tenders,
      otherLines: input.lines,
    },
    PAYMENT_SETTLEMENT,
  );
  return {
    avhVoucherId: input.header.voucherId ?? "",
    avhCompanyId: input.header.scope.companyId,
    avhBranchId: input.header.scope.branchId,
    avhAccYear: input.header.scope.accYear,
    // IN ORDER — the server's own bill order, which is the order it pours.
    allocations: buildPaymentAllocations(input.bills, input.lines, input.userId),
    creditsApplied: buildCreditMemo(input.credits),
    // Numbered against the lines `/create` sent — the payment's own filter.
    otherLineBills: buildOtherLinePins(input.lines, paymentLinesThatTravel),
    onAccount: identity.onAccount,
  };
}

export type PaymentAmendInput = PaymentDraftInput & {
  /** The revision that was LOADED — the optimistic lock, sent straight back. */
  baseRevision: number;
  editRemark: string;
};

export function buildPaymentAmendPayload(input: PaymentAmendInput): AmendPaymentBody {
  const draft = buildPaymentDraftPayload(input);
  const post = buildPaymentPostPayload({
    header: input.header,
    bills: input.bills,
    credits: input.credits,
    tenders: input.tenders,
    lines: input.lines,
    userId: input.userId,
  });
  return {
    ...draft,
    ...post,
    avhVoucherId: input.header.voucherId ?? "",
    baseRevision: input.baseRevision,
    editRemark: input.editRemark.trim(),
  };
}
