/**
 * Every response → the draft, in one place.
 *
 * ── The envelope ─────────────────────────────────────────────────────────
 * Every route answers `{ data: { header, … } }`. The api layer unwraps `data`
 * (that is what `transformResponse` is for) and everything here reads the
 * payload INSIDE it — which is the bug this module exists to stop happening a
 * third time:
 *
 *  · `/create` returns the new id at `data.header.avhVoucherId`. Read as
 *    `data.avhVoucherId` it came back empty, and `/post` then complained
 *    "avhVoucherId must be a valid UUID" — which points at Post when the fault
 *    is in Create.
 *  · `/post` returns the number at `data.header.avhVoucherRefno`. Read
 *    shallow, a receipt that HAD posted showed a blank number and
 *    "Receipt  posted.", which looks exactly like a failed post.
 *
 * `pdcVouchers[]` really is at `data` level. Neither rule is guessable from
 * the shape of one reply, so nothing outside this file reads a response.
 */
import type {
  BillRow,
  CreditRow,
  OpenBillWire,
  OpenCreditWire,
  OpenItemsParty,
  OtherLineRow,
  PartyFacts,
  ReceiptAllocationWire,
  ReceiptHeaderDraft,
  ReceiptHeaderWire,
  ReceiptOtherLineWire,
  ReceiptRole,
  ReceiptScope,
  ReceiptTenderWire,
  TenderRow,
} from "../receipt.types";
import type { DraftMemoBill, DraftMemoCredit } from "../domain/merge-draft";
import { billColumnOf } from "../domain/adj-type";
import { isSeededRole } from "../domain/seeded-lines";
import { toPaise, toRupees } from "../domain/money";

let rowKeySequence = 0;
export function nextRowKey(prefix: string): string {
  rowKeySequence += 1;
  return `${prefix}-${rowKeySequence}`;
}

/** A wire date (or timestamp) as a date input's value. */
export function toDateInput(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) {
    return "";
  }
  const head = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : "";
}

export function parseOpenBills(rows: readonly OpenBillWire[] | undefined): BillRow[] {
  return (rows ?? []).map((row) => ({
    billId: row.billId,
    billAccYear: row.billAccYear,
    billType: row.billType,
    docRefno: row.docRefno,
    usrRefno: row.usrRefno ?? "",
    docDate: toDateInput(row.docDate),
    dueDate: row.dueDate ? toDateInput(row.dueDate) : null,
    daysOverdue: row.daysOverdue ?? 0,
    billAmount: row.billAmount ?? 0,
    pendingAmount: row.pendingAmount ?? 0,
    status: row.status,
    pdcHeld: row.pdcHeld ?? 0,
    ppdSuggested: row.ppdSuggested ?? 0,
    tcsAmount: row.tcsAmount ?? 0,
    tcsPending: row.tcsPending ?? 0,
    // null is NOT zero. It survives as null all the way to the cell, which
    // renders blank: an OPENING bill was typed, not sold.
    billProfit: row.billProfit ?? null,
    receive: 0,
    // The slabs' suggestion is entered for the operator to keep or clear. The
    // server never re-seeds it, so what is left here is what posts.
    discount: row.ppdSuggested ?? 0,
    writeOff: 0,
    roundOff: 0,
    receiveTyped: false,
    writeoffApprovedBy: null,
    note: "",
  }));
}

export function parseOpenCredits(rows: readonly OpenCreditWire[] | undefined): CreditRow[] {
  return (rows ?? []).map((row) => ({
    billId: row.billId,
    billAccYear: row.billAccYear,
    billType: row.billType,
    docRefno: row.docRefno,
    docDate: toDateInput(row.docDate),
    billAmount: row.billAmount ?? 0,
    pendingAmount: row.pendingAmount ?? 0,
    srcDocType: row.srcDocType,
    srcDocId: row.srcDocId,
    apply: 0,
    applyTyped: false,
  }));
}

/**
 * The party's own flags.
 *
 * `loaded` is what keeps a default-false flag from being read as a fact: every
 * flag here defaults to false, and false is a CLAIM ("not bill-by-bill", "no
 * TDS"). The Qt screen announced "NOT bill-by-bill" over a screen full of that
 * party's bills, because it read the flags before their fetch.
 */
export function parseParty(party: OpenItemsParty | undefined): PartyFacts {
  if (!party) {
    return emptyPartyFacts();
  }
  return {
    loaded: true,
    ledName: party.ledName ?? "",
    groupName: party.groupName ?? "",
    isBillByBill: party.isBillByBill === true,
    isTdsApplicable: party.isTdsApplicable === true,
    tdsDeducteeType: party.tdsDeducteeType,
    isTcsApplicable: party.isTcsApplicable === true,
    tcsBasis: party.tcsBasis === "RECEIPT" ? "RECEIPT" : "SALES",
    tanNo: party.tanNo,
  };
}

export function emptyPartyFacts(): PartyFacts {
  return {
    loaded: false,
    ledName: "",
    groupName: "",
    isBillByBill: false,
    isTdsApplicable: false,
    tdsDeducteeType: null,
    isTcsApplicable: false,
    tcsBasis: "SALES",
    tanNo: null,
  };
}

export function parseTenders(rows: readonly ReceiptTenderWire[] | undefined): TenderRow[] {
  return (rows ?? [])
    .slice()
    .sort((left, right) => left.tdRowNo - right.tdRowNo)
    .map((row) => ({
      key: nextRowKey("tender"),
      tdId: row.tdId ?? null,
      tenderId: row.tdTenderId,
      tenderTypeId: row.tdTenderTypeId,
      tenderName: row.tdTenderName ?? "",
      tenderLedgerId: row.tdTenderLedgerId || null,
      amount: row.tdAmount ?? 0,
      receivedAmt: row.tdReceivedAmt ?? 0,
      changeAmt: row.tdChangeAmt ?? 0,
      mdrAmt: row.tdMdrAmt ?? 0,
      refNo: row.tdRefNo ?? "",
      bankName: row.tdBankName ?? "",
      payerVpa: row.tdPayerVpa ?? "",
      instrumentDate: toDateInput(row.tdInstrumentDate),
      // The cheque extras live in `acc_pdc_register`, not on the tender row.
      // They are filled in afterwards from `cheques[]` — see `applyCheques`.
      cheque: { bankBranch: "", ifsc: "", drawerName: "", bankLedgerId: null },
      pdcVoucherRefno: null,
    }));
}

/** The F4 extras, joined onto their instrument row by `tenderRowNo`. */
export function applyCheques(
  tenders: TenderRow[],
  cheques: ReadonlyArray<{
    tenderRowNo: number | null;
    bankBranch: string | null;
    ifsc: string | null;
    drawerName: string | null;
    bankLedgerId: string | null;
  }>,
): TenderRow[] {
  if (cheques.length === 0) {
    return tenders;
  }
  return tenders.map((tender, index) => {
    const rowNo = index + 1;
    const cheque = cheques.find((candidate) => candidate.tenderRowNo === rowNo);
    if (!cheque) {
      return tender;
    }
    return {
      ...tender,
      cheque: {
        bankBranch: cheque.bankBranch ?? "",
        ifsc: cheque.ifsc ?? "",
        drawerName: cheque.drawerName ?? "",
        bankLedgerId: cheque.bankLedgerId,
      },
    };
  });
}

export function parseOtherLines(rows: readonly ReceiptOtherLineWire[] | undefined): OtherLineRow[] {
  return (rows ?? [])
    .slice()
    .sort((left, right) => left.lineNo - right.lineNo)
    .map((row) => {
      const role = (row.role ?? null) as ReceiptRole | null;
      return {
        key: nextRowKey("line"),
        role,
        // `role` and `ledgerId` are exclusive on the way out, so a line that
        // came back with a role must not carry the ledger the role resolved to
        // — sending both is a 400.
        ledgerId: role ? null : (row.ledgerId || null),
        ledgerName: row.ledgerName ?? "",
        drCr: row.drCr,
        amount: row.amount ?? 0,
        settlesBill: row.settlesBill === true,
        narration: row.narration ?? "",
        seeded: isSeededRole(role),
        againstBillId: null,
        againstBillAccYear: null,
      };
    });
}

export function parseHeader(
  header: ReceiptHeaderWire,
  fallbackScope: ReceiptScope,
): ReceiptHeaderDraft {
  return {
    voucherId: header.avhVoucherId,
    // Captured from the DOCUMENT, never re-read from the session: a receipt
    // from another branch or year is acted on with the keys it was written
    // with.
    scope: {
      companyId: header.avhCompanyId || fallbackScope.companyId,
      branchId: header.avhBranchId || fallbackScope.branchId,
      accYear: header.avhAccYear || fallbackScope.accYear,
    },
    voucherDate: toDateInput(header.avhVoucherDate),
    partyId: header.avhPartyId,
    partyName: header.avhPartyName ?? "",
    areaId: "",
    employeeId: header.avhEmployeeId?.[0] ?? "",
    usrRefno: header.avhUsrRefno ?? "",
    docRefno: header.avhDocRefno ?? "",
    docDate: toDateInput(header.avhDocDate),
    remarks: header.avhRemarks ?? "",
    status: header.avhVoucherStatus,
    voucherRefno: header.avhVoucherRefno,
    revisionNo: header.avhRevisionNo ?? 0,
    againstVoucherId: header.avhAgainstVoucherId,
    cancelReason: header.avhCancelReason,
  };
}

/**
 * A DRAFT's remembered settlement, out of the same `allocations[]` array a
 * posted receipt's history arrives in.
 *
 * The rows are shaped exactly like posted ones — discount and write-off are
 * expanded into their own DISCOUNT and WRITEOFF rows — so they are folded back
 * into one memo per bill here, by the same column routing.
 */
export function parseDraftMemo(allocations: readonly ReceiptAllocationWire[]): DraftMemoBill[] {
  const byBill = new Map<string, DraftMemoBill>();
  for (const entry of allocations) {
    const column = billColumnOf(entry.adjType);
    if (column === null) {
      continue;
    }
    let memo = byBill.get(entry.billId);
    if (!memo) {
      memo = {
        billId: entry.billId,
        billAccYear: entry.billAccYear,
        amount: 0,
        discount: 0,
        writeoff: 0,
        roundoff: 0,
      };
      byBill.set(entry.billId, memo);
    }
    const amount = toRupees(toPaise(entry.amount));
    if (column === "receive") {
      memo.amount = toRupees(toPaise(memo.amount) + toPaise(amount));
    } else if (column === "discount") {
      memo.discount = toRupees(toPaise(memo.discount ?? 0) + toPaise(amount));
    } else if (column === "writeOff") {
      memo.writeoff = toRupees(toPaise(memo.writeoff ?? 0) + toPaise(amount));
    } else {
      memo.roundoff = toRupees(toPaise(memo.roundoff ?? 0) + toPaise(amount));
    }
  }
  return [...byBill.values()];
}

/** A draft's remembered credits: `billId` IS the credit on a draft. */
export function parseDraftCreditMemo(
  creditsApplied: readonly ReceiptAllocationWire[],
): DraftMemoCredit[] {
  const byCredit = new Map<string, DraftMemoCredit>();
  for (const entry of creditsApplied) {
    const found = byCredit.get(entry.billId);
    if (found) {
      found.amount = toRupees(toPaise(found.amount) + toPaise(entry.amount));
      continue;
    }
    byCredit.set(entry.billId, { billId: entry.billId, amount: entry.amount });
  }
  return [...byCredit.values()];
}
