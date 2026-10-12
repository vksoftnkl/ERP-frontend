/**
 * Test fixtures — shaped as the server and the tender master send them.
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import type { ExpenseScope, ExpenseTenderOption, ExpenseValidatePayload } from "../expense.types";

export const COMPANY = "019c8ea6-19e9-78a8-b15f-749e1cde7292";
export const BRANCH = "019c8ea7-b0f5-72d5-96a5-1abfc80cc8ab";
export const OTHER = "11111111-1111-4111-8111-111111111111";
export const SCOPE: ExpenseScope = { companyId: COMPANY, branchId: BRANCH, accYear: "2026-2027" };
export const TODAY = "2026-10-10";

export const LEDGER_REPAIRS = "aaaaaaaa-0000-4000-8000-000000000001";
export const LEDGER_COURIER = "aaaaaaaa-0000-4000-8000-000000000002";
export const TAX_18 = "bbbbbbbb-0000-4000-8000-000000000018";
export const CASH_ID = "cccccccc-0000-4000-8000-000000000001";
export const UPI_ID = "cccccccc-0000-4000-8000-000000000003";

export const TENDERS: ExpenseTenderOption[] = [
  { tenderId: CASH_ID, name: "Cash", typeId: 1, typeCode: "CASH", ledgerName: "Cash in hand" },
  { tenderId: UPI_ID, name: "UPI", typeId: 3, typeCode: "UPI", ledgerName: "UPI clearing" },
];

export function master(overrides: Partial<TenderMasterRow>): TenderMasterRow {
  return {
    tndId: "t",
    tndCompanyId: COMPANY,
    tndBranchId: null,
    tndTypeId: "1",
    tndName: "Cash",
    tndShortName: "CSH",
    tndLedgerId: "l",
    tndSettlementLedgerId: null,
    tndTypeName: "CASH",
    tndLedgerName: "Cash in hand",
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
    tndDisplayPosition: 1,
    tndHotkey: null,
    tndColour: null,
    tndEffectiveFrom: null,
    tndEffectiveTo: null,
    tndIsActive: true,
    tndIsDeleted: false,
    ...overrides,
  };
}

/** The live box's answer for Repairs 1,000 @ 18 % (intra) + Courier 120, paid 1,300. */
export function validateAnswer(overrides: Partial<ExpenseValidatePayload> = {}): ExpenseValidatePayload {
  return {
    ok: true,
    derived: {
      total: 1300,
      taxable: 1120,
      tax: { cgst: 90, sgst: 90, igst: 0, cess: 0 },
      supplyNature: "INTRA",
      placeOfSupplyCode: "33",
      lines: [
        {
          rowNo: 1,
          ledgerId: LEDGER_REPAIRS,
          amount: 1000,
          description: "WIRING",
          costCentreId: null,
          taxId: TAX_18,
          hsn: null,
          itc: true,
          ledgerName: "Repairs",
          taxName: "GST 18%",
          cgst: 90,
          sgst: 90,
          igst: 0,
          cess: 0,
          total: 1180,
          itcEligibility: "INPUTS",
        },
        {
          rowNo: 2,
          ledgerId: LEDGER_COURIER,
          amount: 120,
          description: null,
          costCentreId: null,
          taxId: null,
          hsn: null,
          itc: true,
          ledgerName: "Courier",
          taxName: null,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
          total: 120,
          itcEligibility: null,
        },
      ],
      tenders: [
        {
          tdId: null,
          rowNo: 1,
          tenderId: CASH_ID,
          tenderName: "Cash",
          tenderTypeId: 1,
          tenderTypeName: "CASH",
          amount: 300,
          refNo: null,
          ledgerId: "safe-ledger",
          ledgerName: "Main Safe Cash",
          moneyFrom: "SAFE",
        },
        {
          tdId: null,
          rowNo: 2,
          tenderId: UPI_ID,
          tenderName: "UPI",
          tenderTypeId: 3,
          tenderTypeName: "UPI",
          amount: 1000,
          refNo: "599000000777",
          ledgerId: "upi-ledger",
          ledgerName: "UPI clearing",
          moneyFrom: "LEDGER",
        },
      ],
      legs: [
        { rowNo: 1, drCr: "DR", ledgerId: LEDGER_REPAIRS, ledgerName: "Repairs", role: null, amount: 1000, remarks: null, line: 1 },
        { rowNo: 2, drCr: "DR", ledgerId: LEDGER_COURIER, ledgerName: "Courier", role: null, amount: 120, remarks: null, line: 2 },
        { rowNo: 3, drCr: "DR", ledgerId: "cgst", ledgerName: "Input CGST", role: "INPUT_CGST", amount: 90, remarks: null, line: null },
        { rowNo: 4, drCr: "DR", ledgerId: "sgst", ledgerName: "Input SGST", role: "INPUT_SGST", amount: 90, remarks: null, line: null },
        { rowNo: 5, drCr: "CR", ledgerId: "safe-ledger", ledgerName: "Main Safe Cash", role: null, amount: 300, remarks: null, line: null },
        { rowNo: 6, drCr: "CR", ledgerId: "upi-ledger", ledgerName: "UPI clearing", role: null, amount: 1000, remarks: null, line: null },
      ],
      session: null,
      safeName: "Main Safe",
    },
    refusals: [],
    warnings: [],
    approval: null,
    ...overrides,
  };
}
