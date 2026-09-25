import { describe, expect, it } from "vitest";
import { drillTarget } from "./drill-target";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const ROW_BRANCH = "99999999-9999-4999-8999-999999999999";
const receipt = {
  branchId: ROW_BRANCH,
  accYear: "2025-2026",
  src: { module: "ACCOUNTS", docType: "RECEIPT", docId: "66666666-6666-4666-8666-000000000002" },
};

describe("drillTarget", () => {
  it("opens a receipt in the ROW's branch and year", () => {
    expect(drillTarget(receipt, COMPANY)).toBe(
      `/accounts/receipt/${COMPANY}/${ROW_BRANCH}/2025-2026/66666666-6666-4666-8666-000000000002`,
    );
  });

  it("takes no session: the only scope inputs are the row and the report's company", () => {
    // The signature has no room for a session branch or year; the row's win by construction.
    expect(drillTarget.length).toBe(2);
    const target = drillTarget(receipt, COMPANY)!;
    expect(target).toContain(ROW_BRANCH);
    expect(target).toContain("2025-2026");
  });

  it("returns null, never throws, for an unknown or missing src", () => {
    expect(drillTarget({ ...receipt, src: { module: "SALES", docType: "SALE_BILL", docId: "x" } }, COMPANY)).toBeNull();
    expect(drillTarget({ ...receipt, src: { module: "NEW", docType: "THING", docId: "x" } }, COMPANY)).toBeNull();
    expect(drillTarget({ ...receipt, src: null }, COMPANY)).toBeNull();
    expect(drillTarget({ ...receipt, src: { module: null, docType: null, docId: null } }, COMPANY)).toBeNull();
    expect(drillTarget({ ...receipt, branchId: null }, COMPANY)).toBeNull();
  });
});
