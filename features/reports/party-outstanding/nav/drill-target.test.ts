import { describe, expect, it } from "vitest";
import { drillTarget, voucherTarget } from "./drill-target";

const COMPANY = "c0000000-0000-4000-8000-000000000000";
const BRANCH = "b0000000-0000-4000-8000-000000000000";
const DOC = "d0000000-0000-4000-8000-000000000000";

const row = {
  srcDocType: "RECEIPT_ADVANCE",
  srcDocId: DOC,
  srcAccYear: "2025-2026",
  voucherId: DOC,
  voucherTypeId: null,
  branchId: BRANCH,
  accYear: "2026-2027",
};

describe("drillTarget", () => {
  it("keys on the ROW's year and branch, never the session's", () => {
    expect(drillTarget(row, COMPANY)).toBe(`/accounts/receipt/${COMPANY}/${BRANCH}/2025-2026/${DOC}`);
  });

  it("routes a VOUCHER bill by its voucher type", () => {
    expect(drillTarget({ ...row, srcDocType: "VOUCHER", voucherTypeId: 24 }, COMPANY)).toBe(
      `/accounts/journal/${COMPANY}/${BRANCH}/2025-2026/${DOC}`,
    );
    expect(drillTarget({ ...row, srcDocType: "VOUCHER", voucherTypeId: 27 }, COMPANY)).toContain("/accounts/credit-note/");
    expect(drillTarget({ ...row, srcDocType: "PAYMENT_ADVANCE" }, COMPANY)).toContain("/accounts/payment/");
  });

  it("returns null rather than guessing a missing key", () => {
    expect(drillTarget({ ...row, branchId: null }, COMPANY)).toBeNull();
    expect(drillTarget({ ...row, srcDocType: "VOUCHER", voucherTypeId: null }, COMPANY)).toBeNull();
    expect(drillTarget({ ...row, srcDocType: "VOUCHER", voucherTypeId: 3 }, COMPANY)).toBeNull();
  });

  it("returns null for a type with no screen", () => {
    expect(drillTarget({ ...row, srcDocType: "SALE_BILL" }, COMPANY)).toBeNull();
    expect(drillTarget({ ...row, srcDocType: "SOMETHING_NEW" }, COMPANY)).toBeNull();
    expect(drillTarget({ ...row, srcDocType: null }, COMPANY)).toBeNull();
  });

  it("opens the opening-balance and received-cheque screens", () => {
    expect(drillTarget({ ...row, srcDocType: "OPENING_BALANCE" }, COMPANY)).toBe("/accounts/opening-balance");
    expect(drillTarget({ ...row, srcDocType: "CHEQUE_BOUNCE_CHARGE" }, COMPANY)).toBe("/accounts/received-cheques");
  });

  it("opens a settlement voucher by its own keys", () => {
    expect(
      voucherTarget({ companyId: COMPANY, branchId: BRANCH, accYear: "2026-2027 ", voucherId: DOC, voucherTypeId: 12 }),
    ).toBe(`/accounts/receipt/${COMPANY}/${BRANCH}/2026-2027/${DOC}`);
  });
});
