/**
 * Row factories for the payment tests. Not imported by the screen.
 *
 * The receipt's bill, held-item, header and tender-master factories are the
 * payment's too (the rows are the same shapes); only the payment's own rows
 * are made here.
 */
import { aBill, aCredit, aHeader, aTenderMaster } from "@/features/accounts/receipt/domain/fixtures";
import type {
  PaymentLineRow,
  PaymentPartyFacts,
  PaymentRole,
  PaymentTenderRow,
} from "../payment.types";
import { emptyBeneficiary, emptyCheque } from "./tenders";
import { defaultsForRole } from "./roles";

export { aBill, aCredit, aHeader, aTenderMaster };

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

/** Type ids as the tender types table numbers them: 1 cash, 3 UPI, 5 cheque, 6 bank. */
export const CASH = 1;
export const UPI = 3;
export const CHEQUE = 5;
export const BANK = 6;

export function aPaymentTender(partial: Partial<PaymentTenderRow> = {}): PaymentTenderRow {
  return {
    key: nextId("ptender"),
    tdId: null,
    tenderId: "tnd-cash",
    tenderTypeId: CASH,
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
    cheque: emptyCheque(),
    beneficiary: emptyBeneficiary(),
    pdcVoucherRefno: null,
    leaf: null,
    bookNo: null,
    ...partial,
  };
}

export function aPaymentLine(
  role: PaymentRole | null,
  partial: Partial<PaymentLineRow> = {},
): PaymentLineRow {
  const defaults = role ? defaultsForRole(role) : { drCr: "DR" as const, settlesBill: false };
  return {
    key: nextId("pline"),
    role,
    ledgerId: null,
    ledgerName: "",
    drCr: defaults.drCr,
    amount: 0,
    settlesBill: defaults.settlesBill,
    narration: "",
    seeded: false,
    againstBillId: null,
    againstBillAccYear: null,
    approvedBy: null,
    ...partial,
  };
}

/** A loaded supplier, not TDS-applicable unless a test says so. */
export function aPayee(partial: Partial<PaymentPartyFacts> = {}): PaymentPartyFacts {
  return {
    loaded: true,
    ledName: "Murugan Traders",
    groupName: "Sundry Creditors",
    isBillByBill: true,
    isMoneyLedger: false,
    isTdsApplicable: false,
    tdsSection: "",
    tdsDeducteeType: null,
    tdsRate: null,
    tdsRateSource: null,
    tdsThresholdSingle: 0,
    tdsThresholdAnnual: 0,
    tdsPaidThisYear: 0,
    panPresent: true,
    bankName: "",
    bankAccountNo: "",
    bankIfsc: "",
    favouringName: "",
    ...partial,
  };
}

/** A 194C contractor at 1%, no thresholds — every payment deducts. */
export function aTdsPayee(partial: Partial<PaymentPartyFacts> = {}): PaymentPartyFacts {
  return aPayee({
    isTdsApplicable: true,
    tdsSection: "194C",
    tdsDeducteeType: "NON_COMPANY",
    tdsRate: 1,
    tdsRateSource: "MASTER",
    ...partial,
  });
}
