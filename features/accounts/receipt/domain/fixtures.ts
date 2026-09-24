/**
 * Row factories for the tests. Not imported by the screen.
 *
 * They exist so a test can say what it is ABOUT — "a bill with 5,000 pending",
 * "a TDS line of 1,400" — instead of restating twenty fields that have nothing
 * to do with the case.
 */
import type {
  BillRow,
  CreditRow,
  OtherLineRow,
  PartyFacts,
  ReceiptHeaderDraft,
  ReceiptRole,
  TenderRow,
} from "../receipt.types";
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function aBill(partial: Partial<BillRow> = {}): BillRow {
  return {
    billId: nextId("bill"),
    billAccYear: "2026-2027",
    billType: "SALES",
    docRefno: "INV/1",
    usrRefno: "",
    docDate: "2026-09-01",
    dueDate: "2026-09-30",
    daysOverdue: 0,
    billAmount: 10000,
    pendingAmount: 10000,
    status: "OPEN",
    pdcHeld: 0,
    ppdSuggested: 0,
    tcsAmount: 0,
    tcsPending: 0,
    billProfit: null,
    receive: 0,
    discount: 0,
    writeOff: 0,
    roundOff: 0,
    receiveTyped: false,
    writeoffApprovedBy: null,
    note: "",
    ...partial,
  };
}

export function aCredit(partial: Partial<CreditRow> = {}): CreditRow {
  return {
    billId: nextId("credit"),
    billAccYear: "2026-2027",
    billType: "ADVANCE",
    docRefno: "ADV/1",
    docDate: "2026-08-01",
    billAmount: 4000,
    pendingAmount: 4000,
    srcDocType: "RECEIPT",
    srcDocId: null,
    apply: 0,
    applyTyped: false,
    ...partial,
  };
}

export function aTender(partial: Partial<TenderRow> = {}): TenderRow {
  return {
    key: nextId("tender"),
    tdId: null,
    tenderId: "tnd-cash",
    tenderTypeId: 1,
    tenderName: "Cash",
    tenderLedgerId: "led-cash",
    amount: 0,
    receivedAmt: 0,
    changeAmt: 0,
    mdrAmt: 0,
    refNo: "",
    bankName: "",
    payerVpa: "",
    instrumentDate: "",
    cheque: { bankBranch: "", ifsc: "", drawerName: "", bankLedgerId: null },
    pdcVoucherRefno: null,
    ...partial,
  };
}

export function aLine(role: ReceiptRole, partial: Partial<OtherLineRow> = {}): OtherLineRow {
  return {
    key: nextId("line"),
    role,
    ledgerId: null,
    ledgerName: "",
    drCr: "DR",
    amount: 0,
    settlesBill: true,
    narration: "",
    seeded: false,
    againstBillId: null,
    againstBillAccYear: null,
    ...partial,
  };
}

export function aParty(partial: Partial<PartyFacts> = {}): PartyFacts {
  return {
    loaded: true,
    ledName: "Deepan",
    groupName: "Sundry Debtors",
    isBillByBill: true,
    isTdsApplicable: false,
    tdsDeducteeType: null,
    isTcsApplicable: false,
    tcsBasis: "SALES",
    tanNo: null,
    ...partial,
  };
}

export function aHeader(partial: Partial<ReceiptHeaderDraft> = {}): ReceiptHeaderDraft {
  return {
    voucherId: null,
    scope: { companyId: "co", branchId: "br", accYear: "2026-2027" },
    voucherDate: "2026-09-18",
    partyId: "party",
    partyName: "Deepan",
    areaId: "",
    employeeId: "",
    usrRefno: "",
    docRefno: "",
    docDate: "",
    remarks: "",
    status: "DRAFT",
    voucherRefno: null,
    revisionNo: 0,
    againstVoucherId: null,
    cancelReason: null,
    ...partial,
  };
}

/** A usable tender master. `tndTypeId` is the numeric type as a string ("5" = CHEQUE). */
export function aTenderMaster(partial: Partial<TenderMasterRow> = {}): TenderMasterRow {
  const id = nextId("tnd");
  return {
    tndId: id,
    tndCompanyId: "co",
    tndBranchId: null,
    tndTypeId: "1",
    tndName: "Cash",
    tndShortName: "CSH",
    tndLedgerId: "led-cash",
    tndSettlementLedgerId: null,
    tndTypeName: null,
    tndLedgerName: null,
    tndSurchargeLedgerName: null,
    tndSettlementDays: 0,
    tndMinAmount: 0,
    tndMaxAmount: null,
    tndDailyLimit: null,
    tndSurchargePerc: 0,
    tndSurchargeAmount: 0,
    tndSurchargeLedgerId: null,
    tndEditSurcharge: false,
    tndEditLedger: false,
    tndConversionRate: 1,
    tndNeedsRef: null,
    tndAllowChange: null,
    tndAllowInReturn: null,
    tndOpenCashDrawer: false,
    tndIsDefault: false,
    tndDisplayPosition: 0,
    tndHotkey: null,
    tndColour: null,
    tndEffectiveFrom: null,
    tndEffectiveTo: null,
    tndIsActive: true,
    tndIsDeleted: false,
    ...partial,
  };
}
