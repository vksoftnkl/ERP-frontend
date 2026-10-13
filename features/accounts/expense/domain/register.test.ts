import { describe, expect, it } from "vitest";
import { OTHER, SCOPE, TODAY } from "./fixtures";
import { defaultRegisterFilters, registerRowOf, registerRowsOf, stepHighlight } from "./register";

const POSTED_ROW = {
  avh_voucher_id: "v-1",
  avh_company_id: OTHER,
  avh_branch_id: OTHER,
  avh_acc_year: "2025-2026 ",
  avh_voucher_refno: "ExpV/12",
  avh_voucher_date: "2026-10-09T00:00:00.000Z",
  paid_to: "Ravi",
  expense_heads: "Courier Charges, Repairs",
  avh_doc_amount: "1180.00",
  tenders: "Cash, UPI",
  gst_bill_no: "INV-7",
  session_no: "S-3",
  avh_voucher_status: "posted",
};

describe("the register's window (Qt defaultDaysBack)", () => {
  it("opens on the last 30 days, every status", () => {
    expect(defaultRegisterFilters(TODAY)).toEqual({ status: "", fromDate: "2026-09-10", toDate: TODAY });
  });
});

describe("registerRowOf (grid 137)", () => {
  it("reads a row with its OWN keys — another branch / year opens as written", () => {
    const row = registerRowOf(POSTED_ROW, SCOPE)!;
    expect(row.keys).toEqual({ voucherId: "v-1", companyId: OTHER, branchId: OTHER, accYear: "2025-2026" });
    expect(row).toMatchObject({
      date: "2026-10-09",
      number: "ExpV/12",
      paidTo: "Ravi",
      heads: "Courier Charges, Repairs",
      amount: "1,180.00",
      tenders: "Cash, UPI",
      gstBillNo: "INV-7",
      session: "S-3",
      status: "POSTED",
      cancelled: false,
    });
  });

  it("a draft has no number yet; missing keys fall back to the scope it was listed under", () => {
    const row = registerRowOf({ avh_voucher_id: "v-2", avh_voucher_status: "DRAFT", avh_doc_amount: null }, SCOPE)!;
    expect(row.number).toBe("— draft —");
    expect(row.keys).toEqual({ voucherId: "v-2", ...SCOPE });
    expect(row.amount).toBe("0.00");
  });

  it("marks a cancelled row, and drops one that cannot be opened", () => {
    expect(registerRowOf({ ...POSTED_ROW, avh_voucher_status: "CANCELLED" }, SCOPE)?.cancelled).toBe(true);
    expect(registerRowOf({ ...POSTED_ROW, avh_voucher_id: "" }, SCOPE)).toBeNull();
    expect(registerRowsOf([POSTED_ROW, { avh_voucher_id: null }], SCOPE)).toHaveLength(1);
  });
});

describe("stepHighlight", () => {
  const rows = registerRowsOf(
    ["a", "b", "c"].map((id) => ({ avh_voucher_id: id })),
    SCOPE,
  );

  it("moves within the page and stops at either end; no highlight yet means the first row", () => {
    expect(stepHighlight(rows, null, 1)).toBe("b");
    expect(stepHighlight(rows, "b", 1)).toBe("c");
    expect(stepHighlight(rows, "c", 1)).toBe("c");
    expect(stepHighlight(rows, "a", -1)).toBe("a");
    expect(stepHighlight(rows, "gone", -1)).toBe("a");
    expect(stepHighlight([], "a", 1)).toBeNull();
  });
});
