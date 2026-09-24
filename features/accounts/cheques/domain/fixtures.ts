/** Test rows. Not imported by the screen. */
import type { ChequeRow } from "./types";

let serial = 0;

export function chequeRow(patch: Partial<ChequeRow> = {}): ChequeRow {
  serial += 1;
  return {
    apdId: `00000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    accYear: "2026-2027",
    companyId: "c0000000-0000-4000-8000-000000000001",
    branchId: "b0000000-0000-4000-8000-000000000001",
    instrumentNo: `5549${serial}`,
    instrumentType: "CHEQUE",
    instrumentDate: "2026-09-10",
    amount: 1000,
    bankName: "Karur Vysya Bank",
    drawerName: "Deepan",
    partyName: "Deepan",
    status: "HELD",
    bucket: "OVERDUE",
    postingMode: "ON_RECEIPT",
    depositDate: null,
    depositSlipNo: "",
    depositBankName: "",
    presentCount: 0,
    clearDate: null,
    bounceDate: null,
    bounceReason: "",
    bounceCharges: 0,
    receiptRefno: "rct00049",
    clearRefno: "",
    bounceRefno: "",
    replacedByNo: "",
    remarks: "",
    ...patch,
  };
}
