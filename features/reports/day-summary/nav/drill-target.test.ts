import { describe, expect, it } from "vitest";
import { BRANCH_MAIN, COMPANY_ID, FY, LEDGER_CASH } from "../testing/fixtures";
import { drillTarget, ledgerStatementHref } from "./drill-target";

const scope = { companyId: COMPANY_ID, accYear: FY.accYear, branchId: BRANCH_MAIN };
const row = (patch: Partial<Parameters<typeof drillTarget>[0]>) => ({
  voucherId: "v-1",
  voucherTypeId: 12,
  accYear: FY.accYear,
  branchId: null,
  src: null,
  ...patch,
});

describe("drillTarget", () => {
  it("opens each voucher-native type on its keyed screen", () => {
    const expected: Record<number, string> = {
      12: "receipt",
      24: "journal",
      26: "debit-note",
      27: "credit-note",
      28: "purchase-accounting",
      29: "sales-accounting",
      30: "receipt-voucher",
      31: "payment-voucher",
      33: "payment",
      40: "expense-voucher",
    };
    for (const [id, screen] of Object.entries(expected)) {
      expect(drillTarget(row({ voucherTypeId: Number(id) }), scope)).toBe(
        `/accounts/${screen}/${COMPANY_ID}/${BRANCH_MAIN}/${FY.accYear}/v-1`,
      );
    }
  });

  it("opens a known src by its document id", () => {
    const target = drillTarget(row({ voucherTypeId: 3, src: { module: "accounts", docType: "receipt", docId: "d-9" } }), scope);
    expect(target).toBe(`/accounts/receipt/${COMPANY_ID}/${BRANCH_MAIN}/${FY.accYear}/d-9`);
  });

  it("has no screen for an unmapped src or type", () => {
    expect(drillTarget(row({ voucherTypeId: 3, src: { module: "SALES", docType: "SALE_BILL", docId: "d" } }), scope)).toBeNull();
    expect(drillTarget(row({ voucherTypeId: 25 }), scope)).toBeNull();
    expect(drillTarget(row({ voucherTypeId: null }), scope)).toBeNull();
  });

  it("keys on the row's branch, then the report's one branch; never a guess under All branches", () => {
    expect(drillTarget(row({ branchId: "row-branch" }), { ...scope, branchId: null })).toContain("/row-branch/");
    expect(drillTarget(row({}), { ...scope, branchId: null })).toBeNull();
  });
});

describe("ledgerStatementHref", () => {
  it("is a navigation to the Ledger Statement on the same range and branch", () => {
    const href = ledgerStatementHref({ ledgerId: LEDGER_CASH, fromDate: "2026-10-09", toDate: "2026-10-09", branchId: BRANCH_MAIN });
    const url = new URL(href, "https://x");
    expect(url.pathname).toBe("/reports/ledger-statement");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      ledger: LEDGER_CASH,
      from: "2026-10-09",
      to: "2026-10-09",
      branch: BRANCH_MAIN,
      tab: "vouchers",
    });
    expect(new URL(ledgerStatementHref({ ledgerId: LEDGER_CASH, fromDate: "a", toDate: "b", branchId: null }), "https://x").searchParams.get("branch")).toBe("all");
  });
});
