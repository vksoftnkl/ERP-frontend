import { describe, expect, it } from "vitest";
import { expenseVoucherHref } from "../constants";
import { CASH_ID, COMPANY, BRANCH, LEDGER_REPAIRS, TAX_18, TODAY, UPI_ID, validateAnswer } from "./fixtures";
import { buildExpenseBody } from "./payload";
import { draftOfVoucher, readDerived, readValidate, readVoucher, splitRemarks } from "./parse";
import { TENDERS } from "./fixtures";

const VOUCHER = {
  voucherId: "v-1",
  companyId: COMPANY,
  branchId: BRANCH,
  accYear: "2026-2027",
  status: "POSTED",
  voucherNo: "ExpV00012",
  voucherDate: "2026-10-09T00:00:00.000Z",
  partyId: "party-1",
  partyName: "ZT Vinayaga Electricals",
  usrRefno: null,
  remarks: "Ravi — wiring — counter 2",
  reasonId: "r-repair",
  sessionId: null,
  gstBill: { supplierGstin: "33AAACT1234F1Z5", invoiceNo: "INV-2231", invoiceDate: "2026-10-08", placeOfSupplyCode: null },
  amount: 1300,
  derived: validateAnswer().derived,
  postedOn: "2026-10-09T10:00:00.000Z",
  cancelReason: null,
  reversalVoucherId: null,
  createdOn: "2026-10-09T09:00:00.000Z",
};

describe("reading answers defensively", () => {
  it("fills every array and object a partial answer leaves out", () => {
    const v = readValidate({ ok: true, derived: { total: "12.50" } });
    expect(v.derived.total).toBe(12.5);
    expect(v.derived.lines).toEqual([]);
    expect(v.derived.legs).toEqual([]);
    expect(v.derived.tax).toEqual({ cgst: 0, sgst: 0, igst: 0, cess: 0 });
    expect(v.refusals).toEqual([]);
    expect(v.approval).toBeNull();
    expect(readValidate(null).ok).toBe(false);
  });

  it("keeps refusal codes, warning levels and the approval need", () => {
    const v = readValidate({
      ok: false,
      derived: {},
      refusals: [{ code: "EXPENSE_TOTAL_MISMATCH", message: "The lines come to 1300.00 and the tenders to 1120.00", field: "tenders" }],
      warnings: [{ code: "STATUTORY_40A3", level: "WARN", overridable: false, message: "cash above 10,000" }],
      approval: { event: "EXPENSE", threshold: 500, amount: 1300, minRole: "SUPERVISOR", channel: "EITHER" },
    });
    expect(v.refusals[0]).toEqual({
      code: "EXPENSE_TOTAL_MISMATCH",
      message: "The lines come to 1300.00 and the tenders to 1120.00",
      field: "tenders",
    });
    expect(v.warnings[0]).toMatchObject({ code: "STATUTORY_40A3", level: "WARN" });
    expect(v.approval).toMatchObject({ event: "EXPENSE", threshold: 500, amount: 1300, minRole: "SUPERVISOR" });
  });

  it("reads the till session and the money-from of each tender", () => {
    const d = readDerived({
      session: { sessionId: "s1", accYear: "2026-2027" },
      tenders: [{ rowNo: 1, moneyFrom: "DRAWER" }, { rowNo: 2, moneyFrom: "weird" }],
      supplyNature: "inter",
    });
    expect(d.session).toEqual({ sessionId: "s1", accYear: "2026-2027" });
    expect(d.tenders.map((t) => t.moneyFrom)).toEqual(["DRAWER", "LEDGER"]);
    expect(d.supplyNature).toBe("INTER");
  });

  it("reads a voucher, date-only, status upper-cased, post warnings kept", () => {
    const v = readVoucher({ ...VOUCHER, status: "posted", warnings: [{ code: "W", message: "m" }] });
    expect(v.voucherDate).toBe("2026-10-09");
    expect(v.status).toBe("POSTED");
    expect(v.warnings).toHaveLength(1);
    expect(readVoucher({ ...VOUCHER, status: "nonsense" }).status).toBe("DRAFT");
  });
});

describe("draftOfVoucher (Qt showVoucher)", () => {
  it("splits the remarks back into Paid to and the notes", () => {
    expect(splitRemarks("Ravi — wiring — counter 2")).toEqual({ paidTo: "Ravi", notes: "wiring — counter 2" });
    expect(splitRemarks(null)).toEqual({ paidTo: "", notes: "" });
  });

  it("brings the voucher back as the draft, the reason on the first line", () => {
    const draft = draftOfVoucher(readVoucher(VOUCHER), TODAY);
    expect(draft.keys).toEqual({ companyId: COMPANY, branchId: BRANCH, accYear: "2026-2027", voucherId: "v-1" });
    expect(draft.status).toBe("POSTED");
    expect(draft.voucherNo).toBe("ExpV00012");
    expect(draft.dirty).toBe(false);
    expect(draft.header).toMatchObject({
      voucherDate: "2026-10-09",
      partyId: "party-1",
      partyName: "ZT Vinayaga Electricals",
      paidTo: "Ravi",
      notes: "wiring — counter 2",
      gstBill: true,
      supplierGstin: "33AAACT1234F1Z5",
      invoiceNo: "INV-2231",
      invoiceDate: "2026-10-08",
      placeOfSupply: "",
    });
    expect(draft.lines[0]).toMatchObject({
      reasonId: "r-repair",
      ledgerId: LEDGER_REPAIRS,
      ledgerName: "Repairs",
      description: "WIRING",
      amount: "1,000.00",
      taxId: TAX_18,
      taxName: "GST 18%",
      itc: true,
    });
    expect(draft.lines[1].reasonId).toBe("");
    expect(draft.tenders.map((t) => [t.tenderId, t.amount, t.refNo, t.tenderName])).toEqual([
      [CASH_ID, "300.00", "", "Cash"],
      [UPI_ID, "1,000.00", "599000000777", "UPI"],
    ]);
  });

  it("round-trips: the loaded draft builds the body it was saved from", () => {
    const draft = draftOfVoucher(readVoucher({ ...VOUCHER, status: "DRAFT" }), TODAY);
    const body = buildExpenseBody({ draft, scope: { companyId: "", branchId: "", accYear: "" }, tenders: TENDERS, session: null });
    expect(body).toMatchObject({
      voucherId: "v-1",
      companyId: COMPANY,
      remarks: "Ravi — wiring — counter 2",
      partyId: "party-1",
      reasonId: "r-repair",
    });
    expect(body.lines.map((line) => [line.rowNo, line.amount, line.taxId])).toEqual([
      [1, "1000.00", TAX_18],
      [2, "120.00", null],
    ]);
    expect(body.tenders.map((row) => [row.tdRowNo, row.tdAmount, row.tdRefNo])).toEqual([
      [1, "300.00", null],
      [2, "1000.00", "599000000777"],
    ]);
  });

  it("brings back each line's HSN/SAC", () => {
    const withHsn = validateAnswer().derived;
    withHsn.lines[0] = { ...withHsn.lines[0], hsn: "998719" };
    const draft = draftOfVoucher(readVoucher({ ...VOUCHER, derived: withHsn }), TODAY);
    expect(draft.lines[0].hsn).toBe("998719");
    expect(draft.lines[1].hsn).toBe("");
  });

  it("a saved place of supply other than the GSTIN's state was the operator's pick", () => {
    const picked = draftOfVoucher(
      readVoucher({ ...VOUCHER, gstBill: { ...VOUCHER.gstBill, placeOfSupplyCode: "29" } }),
      TODAY,
    );
    expect(picked.header).toMatchObject({ placeOfSupply: "29", placeOfSupplyPicked: true });
    const own = draftOfVoucher(
      readVoucher({ ...VOUCHER, gstBill: { ...VOUCHER.gstBill, placeOfSupplyCode: "33" } }),
      TODAY,
    );
    expect(own.header).toMatchObject({ placeOfSupply: "33", placeOfSupplyPicked: false });
  });

  it("a DRAFT comes back with its trailing blank rows; a posted one without", () => {
    const draft = draftOfVoucher(readVoucher({ ...VOUCHER, status: "DRAFT" }), TODAY);
    expect(draft.lines).toHaveLength(3);
    expect(draft.tenders).toHaveLength(3);
    expect(draft.tenders.every((row) => !row.autoAmount)).toBe(true);
    const posted = draftOfVoucher(readVoucher(VOUCHER), TODAY);
    expect(posted.lines).toHaveLength(2);
    expect(posted.tenders).toHaveLength(2);
  });

  it("a voucher with no lines or tenders still shows one row of each", () => {
    const empty = readVoucher({ ...VOUCHER, derived: {}, gstBill: null });
    const draft = draftOfVoucher(empty, TODAY);
    expect(draft.lines).toHaveLength(1);
    expect(draft.tenders).toHaveLength(1);
    expect(draft.header.gstBill).toBe(false);
    expect(draft.header.invoiceDate).toBe(TODAY);
  });

  it("addresses one voucher by its four keys", () => {
    expect(
      expenseVoucherHref({ companyId: "c", branchId: "b", accYear: "2026-2027", voucherId: "v/1" }),
    ).toBe("/accounts/expense-voucher/c/b/2026-2027/v%2F1");
  });
});
