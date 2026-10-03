/**
 * Every `/payments` response → the draft, in one place.
 *
 * The envelope rules are the receipt's (`receipt/payload/parse.ts` says why in
 * as many words): `/create` answers the id at `data.header.avhVoucherId`,
 * `/post` the number at `data.header.avhVoucherRefno`. What is the payment's
 * own:
 *
 *  - the party carries the TDS rate facts, the bank and the favouring name;
 *  - the summary keeps the receipt's key names (`creditsHeld`,
 *    `totalCredits`) for what are DEBITS here — both spellings are read;
 *  - a cheque row's book, favouring and crossing come back on the row's
 *    `cheque{}` on a draft, and from `chequesIssued[]` once posted;
 *  - a POSTED payment's `otherLines` is EMPTY (the server clears the draft
 *    lines at post), so its role lines are read back off its legs.
 */
import { netCreditsApplied } from "@/features/accounts/receipt/domain/net-allocations";
import { toPaise, toRupees } from "@/features/accounts/receipt/domain/money";
import { nextRowKey, toDateInput } from "@/features/accounts/receipt/payload/parse";
import type { ReceiptLeg } from "@/features/accounts/receipt/receipt.types";
import type {
  BillRow,
  CreditRow,
  PayableBillWire,
  PaymentContextSummary,
  PaymentIssuedChequeWire,
  PaymentLineRow,
  PaymentOpenItemsParty,
  PaymentOpenItemsSummary,
  PaymentOtherLineWire,
  PaymentPartyFacts,
  PaymentRole,
  PaymentTenderRow,
  PaymentTenderWire,
} from "../payment.types";
import type { ReceiptAllocationWire } from "@/features/accounts/receipt/receipt.types";
import { isChequeType } from "../domain/tenders";

export { nextRowKey, toDateInput };

/** A bill we owe. The receipt's BillRow, with what a supplier's bill lacks zeroed. */
export function parsePayableBills(rows: readonly PayableBillWire[] | undefined): BillRow[] {
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
    tcsAmount: 0,
    tcsPending: 0,
    billProfit: null,
    receive: 0,
    // The supplier's cash-discount terms suggest it; it is entered for the
    // operator to keep or clear, and what is left here is what posts.
    discount: row.ppdSuggested ?? 0,
    writeOff: 0,
    roundOff: 0,
    receiveTyped: false,
    writeoffApprovedBy: null,
    note: "",
  }));
}

/** What the summary says the party holds of ours, whichever key it used. */
export function debitsHeldOf(summary: PaymentOpenItemsSummary | null | undefined): number {
  if (!summary) {
    return 0;
  }
  return summary.debitsHeld ?? summary.creditsHeld ?? 0;
}

export function totalDebitsOf(summary: PaymentContextSummary | null | undefined): number {
  if (!summary) {
    return 0;
  }
  return summary.totalDebits ?? summary.totalCredits ?? 0;
}

export function emptyPaymentParty(): PaymentPartyFacts {
  return {
    loaded: false,
    ledName: "",
    groupName: "",
    isBillByBill: false,
    isMoneyLedger: false,
    isTdsApplicable: false,
    tdsSection: "",
    tdsDeducteeType: null,
    tdsRate: null,
    tdsRateSource: null,
    tdsThresholdSingle: 0,
    tdsThresholdAnnual: 0,
    tdsPaidThisYear: 0,
    panPresent: false,
    bankName: "",
    bankAccountNo: "",
    bankIfsc: "",
    favouringName: "",
  };
}

/**
 * The payee's facts. `loaded` keeps a default-false flag from being read as a
 * fact — "not bill-by-bill", "no TDS" — before the answer is in.
 */
export function parsePaymentParty(party: PaymentOpenItemsParty | undefined): PaymentPartyFacts {
  if (!party) {
    return emptyPaymentParty();
  }
  const rate = party.tdsRate;
  return {
    loaded: true,
    ledName: party.ledName ?? "",
    groupName: party.groupName ?? "",
    isBillByBill: party.isBillByBill === true,
    isMoneyLedger: party.isMoneyLedger === true,
    isTdsApplicable: party.isTdsApplicable === true,
    tdsSection: (party.tdsSection ?? "").trim(),
    tdsDeducteeType: party.tdsDeducteeType ?? null,
    // null is NOT zero: it means no rate is in force, and the server refuses
    // the payment until one is. A zero rate is a real rate.
    tdsRate: typeof rate === "number" && Number.isFinite(rate) ? rate : null,
    tdsRateSource: party.tdsRateSource ?? null,
    tdsThresholdSingle: party.tdsThresholdSingle ?? 0,
    tdsThresholdAnnual: party.tdsThresholdAnnual ?? 0,
    tdsPaidThisYear: party.tdsPaidThisYear ?? 0,
    panPresent: party.panPresent === true,
    bankName: party.bank?.name ?? "",
    bankAccountNo: party.bank?.accountNo ?? "",
    bankIfsc: party.bank?.ifsc ?? "",
    favouringName: party.favouringName ?? "",
  };
}

/**
 * The instruments, with their cheque and beneficiary.
 *
 * A cheque row's book comes from the row's own `cheque{}` on a draft and from
 * `chequesIssued[]` (joined by `tenderRowNo`) once posted — and only the three
 * keys `SavePaymentChequeDto` takes are kept, because a draft re-sends them.
 */
export function parsePaymentTenders(
  rows: readonly PaymentTenderWire[] | undefined,
  issued: readonly PaymentIssuedChequeWire[] | undefined,
): PaymentTenderRow[] {
  const byRow = new Map<number, PaymentIssuedChequeWire>();
  for (const cheque of issued ?? []) {
    if (cheque.tenderRowNo !== null && cheque.tenderRowNo !== undefined) {
      byRow.set(cheque.tenderRowNo, cheque);
    }
  }
  return (rows ?? [])
    .slice()
    .sort((left, right) => left.tdRowNo - right.tdRowNo)
    .map((row) => {
      const cheque = isChequeType(row.tdTenderTypeId);
      const fromRegister = byRow.get(row.tdRowNo);
      const bookId = row.cheque?.chequeBookId ?? fromRegister?.chequeBookId ?? null;
      const favouring = row.cheque?.favouring ?? fromRegister?.favouring ?? "";
      const acPayee = row.cheque?.acPayee ?? fromRegister?.acPayee ?? true;
      // On a posted cheque row `tdRefNo` IS the leaf the server took. It is
      // shown, and it is never sent back: an amend takes a NEW leaf.
      const leaf = cheque ? (fromRegister?.instrumentNo ?? row.tdRefNo ?? null) : null;
      return {
        key: nextRowKey("payment-tender"),
        tdId: row.tdId ?? null,
        tenderId: row.tdTenderId,
        tenderTypeId: row.tdTenderTypeId,
        tenderName: row.tdTenderName ?? "",
        tenderLedgerId: row.tdTenderLedgerId || null,
        amount: row.tdAmount ?? 0,
        receivedAmt: 0,
        changeAmt: 0,
        mdrAmt: row.tdMdrAmt ?? 0,
        refNo: cheque ? "" : (row.tdRefNo ?? ""),
        bankName: row.tdBankName ?? "",
        payerVpa: row.tdPayerVpa ?? "",
        instrumentDate: toDateInput(row.tdInstrumentDate),
        cheque: { chequeBookId: bookId, favouring: favouring ?? "", acPayee: acPayee !== false },
        beneficiary: {
          name: row.beneficiary?.name ?? "",
          accountNo: row.beneficiary?.accountNo ?? "",
          ifsc: row.beneficiary?.ifsc ?? "",
        },
        pdcVoucherRefno: null,
        leaf: leaf && leaf.trim() ? leaf : null,
        bookNo: row.cheque?.bookNo ?? fromRegister?.bookNo ?? null,
      };
    });
}

const SEEDED_ON_LOAD: ReadonlySet<string> = new Set([
  "TDS_PAYABLE",
  "DISCOUNT_RECEIVED",
  "WRITE_OFF",
  "ROUND_OFF",
]);

/**
 * A DRAFT's lines — the server's canonical set, seeded ones included — marked
 * the way the screen keeps them (the Qt screen's load rules):
 *
 *  - TDS_PAYABLE and the mirrors are seeded: the screen rebuilds them;
 *  - BANK_CHARGES is seeded when it is the instruments' charge, which it
 *    always is (the server refuses any other);
 *  - a DR ROUND_OFF is the round-up the draft remembered. The bill it rounded
 *    comes back exact (the memo carries the bill's figure), so the line is
 *    kept as it is — an addition — until the operator rounds a bill up again;
 *  - every role line drops its `ledgerId`: role and ledger are exclusive on
 *    the way out, and sending both is a 400.
 */
export function parsePaymentLines(
  rows: readonly PaymentOtherLineWire[] | undefined,
): PaymentLineRow[] {
  return (rows ?? [])
    .slice()
    .sort((left, right) => left.lineNo - right.lineNo)
    .map((row) => {
      const role = (row.role ?? null) as PaymentRole | null;
      const roundUp = role === "ROUND_OFF" && row.drCr === "DR";
      const seeded =
        role !== null && !roundUp && (SEEDED_ON_LOAD.has(role) || role === "BANK_CHARGES");
      return {
        key: nextRowKey("payment-line"),
        role,
        ledgerId: role ? null : (row.ledgerId || null),
        ledgerName: row.ledgerName ?? "",
        drCr: row.drCr,
        amount: row.amount ?? 0,
        settlesBill: roundUp ? false : row.settlesBill === true,
        narration: row.narration ?? "",
        seeded,
        againstBillId: null,
        againstBillAccYear: null,
        approvedBy: row.approvedBy ?? null,
      };
    });
}

const LEG_ROLES: ReadonlySet<string> = new Set([
  "TDS_PAYABLE",
  "BANK_CHARGES",
  "INTEREST_PAID",
  "BALANCES_WRITTEN_BACK",
  "DISCOUNT_RECEIVED",
  "ROUND_OFF",
]);

/**
 * A POSTED payment's role lines, read back off its legs — `/get` returns
 * `otherLines: []` once posted, and without them the strip would show a
 * payment with TDS as out by the TDS.
 *
 * The reductions post as legs of the same roles as a typed line would, so the
 * bill COLUMNS are taken off them: the W/back column's total comes off the
 * BALANCES_WRITTEN_BACK legs (what is left was typed), the discount and a CR
 * round-off are pure mirrors. Party and tender legs carry no role and are not
 * lines.
 */
export function linesFromLegs(legs: readonly ReceiptLeg[] | undefined, bills: readonly BillRow[]): PaymentLineRow[] {
  const writeBackColumn = bills.reduce((sum, bill) => sum + toPaise(bill.writeOff), 0);
  let writeBackLeft = writeBackColumn;
  const lines: PaymentLineRow[] = [];
  for (const leg of (legs ?? []).slice().sort((left, right) => left.avRowNo - right.avRowNo)) {
    const role = (leg.avRole ?? "").trim().toUpperCase();
    if (!LEG_ROLES.has(role)) {
      continue;
    }
    let amount = toPaise(leg.avAmount);
    if (role === "BALANCES_WRITTEN_BACK") {
      const column = Math.min(amount, writeBackLeft);
      writeBackLeft -= column;
      amount -= column;
      if (amount <= 0) {
        continue;
      }
    }
    if ((role === "DISCOUNT_RECEIVED" || role === "ROUND_OFF") && leg.avDrCr === "CR") {
      // Mirrors of the bill columns — the bills already carry them.
      continue;
    }
    lines.push({
      key: nextRowKey("payment-leg"),
      role: role as PaymentRole,
      ledgerId: null,
      ledgerName: leg.avLedgerName ?? "",
      drCr: leg.avDrCr,
      amount: toRupees(amount),
      settlesBill: role === "TDS_PAYABLE" || role === "BALANCES_WRITTEN_BACK",
      narration: leg.avRemarks ?? "",
      // A DR ROUND_OFF is a round-up the bills no longer show (the posted
      // allocation is the bill's exact figure), so it stands as a line of its
      // own, as it does on a reopened draft.
      seeded: role === "TDS_PAYABLE" || role === "BANK_CHARGES",
      againstBillId: null,
      againstBillAccYear: null,
      approvedBy: null,
    });
  }
  return lines;
}

/**
 * The BILL side of a posted payment's held-debit spends.
 *
 * The engine writes every spend as a PAIR (`allocation-engine.ts`): a DR row
 * on the bill it settled, naming the held item in `againstBillId`, and a CR
 * mirror row on the held item, naming the bill. `/get` returns both in
 * `creditsApplied[]`, so reading them all counts every spend twice — once as a
 * phantom "bill" that is really the held item. The DR row is the one that
 * says the whole thing.
 */
export function billSideOfApplied(
  creditsApplied: readonly ReceiptAllocationWire[] | undefined,
): ReceiptAllocationWire[] {
  return (creditsApplied ?? []).filter((row) => row.drCr === "DR");
}

/**
 * The debits a POSTED payment spent, as held rows — so its identity counts
 * them on the left as it counts their settlement on the right. The receipt's
 * own netting does the work, over the bill side of each pair.
 */
export function heldRowsFromApplied(
  creditsApplied: readonly ReceiptAllocationWire[] | undefined,
): CreditRow[] {
  return netCreditsApplied(billSideOfApplied(creditsApplied), false).map((credit) => ({
    billId: credit.billId,
    billAccYear: credit.billAccYear,
    billType: "ADVANCE",
    docRefno: credit.docRefno,
    docDate: "",
    billAmount: credit.amount,
    pendingAmount: credit.amount,
    srcDocType: null,
    srcDocId: null,
    apply: credit.amount,
    applyTyped: true,
  }));
}
