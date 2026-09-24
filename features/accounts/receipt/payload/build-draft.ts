/**
 * `POST /receipts/create` — the draft body.
 *
 * A draft touches no bill (R10). It saves the header, the instruments and the
 * role lines, and since notes 30 it also REMEMBERS the bill-wise settlement in
 * `avh_draft_lines` — as a memo, not as an instruction. The server stores it
 * without validating it, on purpose, and `domain/merge-draft.ts` clamps it on
 * the way back in.
 *
 * ── The memo carries the RAW receive ─────────────────────────────────────
 * `buildPostPayload` adds settling deductions INTO `amount`, because that is
 * what the posting engine needs. A memo has to come back into the same cell it
 * came out of, so it must not: otherwise reopening a draft inflates Receive by
 * a TDS line the operator never typed.
 *
 * ── Nothing may be added to this body ────────────────────────────────────
 * `forbidNonWhitelisted: true` — one unknown key fails the whole request. The
 * beat is therefore not sent (`SaveDraftReceiptDto` has no `areaId`), and
 * neither are `tdAuthCode`, `tdCardLast4`, `tdSurcharge*` or `tdNotes`, which
 * the DTO accepts and this screen has no cell for.
 */
import type {
  BillRow,
  CreditRow,
  OtherLineRow,
  PostReceiptAllocationBody,
  PostReceiptCreditBody,
  ReceiptHeaderDraft,
  SaveDraftReceiptBody,
  SaveReceiptOtherLineBody,
  SaveReceiptTenderBody,
  TenderRow,
} from "../receipt.types";
import { settledPaise } from "../domain/identity";
import { roundMoney, toPaise } from "../domain/money";
import { linesThatTravel } from "../domain/roles";

export type DraftPayloadInput = {
  header: ReceiptHeaderDraft;
  tenders: readonly TenderRow[];
  otherLines: readonly OtherLineRow[];
  bills: readonly BillRow[];
  credits: readonly CreditRow[];
  userId: string;
};

function trimmed(value: string): string | undefined {
  const text = value.trim();
  return text === "" ? undefined : text;
}

/** A cheque's optional extras, or nothing at all if none were keyed. */
function chequeOf(tender: TenderRow): SaveReceiptTenderBody["cheque"] {
  const { bankBranch, ifsc, drawerName, bankLedgerId } = tender.cheque;
  if (!bankBranch.trim() && !ifsc.trim() && !drawerName.trim() && !bankLedgerId) {
    return undefined;
  }
  return {
    ...(bankBranch.trim() ? { bankBranch: bankBranch.trim() } : {}),
    ...(ifsc.trim() ? { ifsc: ifsc.trim().toUpperCase() } : {}),
    ...(drawerName.trim() ? { drawerName: drawerName.trim() } : {}),
    ...(bankLedgerId ? { bankLedgerId } : {}),
  };
}

export function buildTenderBodies(tenders: readonly TenderRow[]): SaveReceiptTenderBody[] {
  return tenders.map((tender, index) => ({
    ...(tender.tdId ? { tdId: tender.tdId } : {}),
    // 1-based and contiguous. The PDC vouchers come back keyed on it, and the
    // cheque register joins its rows to the instrument by it.
    tdRowNo: index + 1,
    tdTenderId: tender.tenderId,
    tdTenderTypeId: tender.tenderTypeId,
    ...(tender.tenderLedgerId ? { tdTenderLedgerId: tender.tenderLedgerId } : {}),
    tdAmount: roundMoney(tender.amount),
    ...(toPaise(tender.receivedAmt) > 0 ? { tdReceivedAmt: roundMoney(tender.receivedAmt) } : {}),
    ...(toPaise(tender.changeAmt) > 0 ? { tdChangeAmt: roundMoney(tender.changeAmt) } : {}),
    ...(toPaise(tender.mdrAmt) > 0 ? { tdMdrAmt: roundMoney(tender.mdrAmt) } : {}),
    ...(trimmed(tender.refNo) ? { tdRefNo: tender.refNo.trim() } : {}),
    ...(trimmed(tender.bankName) ? { tdBankName: tender.bankName.trim() } : {}),
    ...(trimmed(tender.payerVpa) ? { tdPayerVpa: tender.payerVpa.trim() } : {}),
    // The date decides whether this is money today or a post-dated cheque.
    // `tdIsPdc` is NEVER sent: the server derives it, and a client that sent
    // both would be able to disagree with it.
    ...(tender.instrumentDate ? { tdInstrumentDate: tender.instrumentDate } : {}),
    ...(chequeOf(tender) ? { cheque: chequeOf(tender) } : {}),
  }));
}

/** A role OR a ledger, never both, and only the lines that travel. */
export function buildOtherLineBodies(
  otherLines: readonly OtherLineRow[],
): SaveReceiptOtherLineBody[] {
  return linesThatTravel(otherLines).map((line) => ({
    ...(line.role ? { role: line.role } : {}),
    ...(!line.role && line.ledgerId ? { ledgerId: line.ledgerId } : {}),
    drCr: line.drCr,
    amount: roundMoney(line.amount),
    settlesBill: line.settlesBill,
    ...(trimmed(line.narration) ? { narration: line.narration.trim() } : {}),
  }));
}

/** The memo. RAW receive, plus the three reductions as they stand. */
export function buildDraftMemo(bills: readonly BillRow[]): PostReceiptAllocationBody[] {
  return bills
    .filter((bill) => settledPaise(bill) > 0)
    .map((bill) => ({
      billId: bill.billId,
      billAccYear: bill.billAccYear,
      amount: roundMoney(bill.receive),
      discount: roundMoney(bill.discount),
      writeoff: roundMoney(bill.writeOff),
      // Sent although the Qt memo omitted it: the round-off is a figure the
      // operator typed, and a memo that drops it hands the draft back short.
      roundoff: roundMoney(bill.roundOff),
      ...(bill.writeoffApprovedBy ? { writeoffApprovedBy: bill.writeoffApprovedBy } : {}),
    }));
}

export function buildCreditMemo(credits: readonly CreditRow[]): PostReceiptCreditBody[] {
  return credits
    .filter((credit) => toPaise(credit.apply) > 0)
    .map((credit) => ({
      billId: credit.billId,
      billAccYear: credit.billAccYear,
      amount: roundMoney(credit.apply),
    }));
}

export function buildDraftPayload(input: DraftPayloadInput): SaveDraftReceiptBody {
  const { header } = input;
  return {
    ...(header.voucherId ? { avhVoucherId: header.voucherId } : {}),
    avhCompanyId: header.scope.companyId,
    avhBranchId: header.scope.branchId,
    avhAccYear: header.scope.accYear,
    avhVoucherDate: header.voucherDate,
    avhPartyId: header.partyId,
    // ONE element: a receipt is collected by one person. The column is an
    // array because other vouchers share it, not because a receipt has two.
    ...(header.employeeId ? { avhEmployeeId: [header.employeeId] } : {}),
    ...(trimmed(header.usrRefno) ? { avhUsrRefno: header.usrRefno.trim() } : {}),
    ...(trimmed(header.docRefno) ? { avhDocRefno: header.docRefno.trim() } : {}),
    ...(header.docDate ? { avhDocDate: header.docDate } : {}),
    ...(trimmed(header.remarks) ? { avhRemarks: header.remarks.trim() } : {}),
    avhDeviceType: "WEB",
    ...(input.userId ? { avhUserId: input.userId } : {}),
    tenders: buildTenderBodies(input.tenders),
    otherLines: buildOtherLineBodies(input.otherLines),
    allocations: buildDraftMemo(input.bills),
    creditsApplied: buildCreditMemo(input.credits),
    // The draft IS the document: everything absent from this body is gone.
    replace: true,
  };
}
