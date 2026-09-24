import { describe, expect, it } from "vitest";
import type { BillRow, Scope } from "../opening-balance.types";
import { blankBillRow } from "../wire/parse";
import { buildBillsPayload } from "./build-bills-payload";

const SCOPE: Scope = { companyId: "comp-1", branchId: "branch-1", accYear: "2026-2027" };

function bill(partial: Partial<BillRow>): BillRow {
  return {
    ...blankBillRow(),
    ablId: "abl-1",
    docRefno: "SB/2025/0412",
    docDate: "2026-01-12",
    amount: 48600,
    ...partial,
  };
}

describe("buildBillsPayload", () => {
  it("keeps every loaded bill's ablId, and gives a new one none", () => {
    // A bill without an ablId is an INSERT. Re-sending a loaded bill without one
    // is refused by ux_abl_doc_refno: "…is already an opening bill of this party
    // for this year. Send its ablId to update it."
    const payload = buildBillsPayload({ scope: SCOPE, partyId: "party-1" }, [
      bill({ ablId: "abl-1", docRefno: "ADV/2025/118" }),
      bill({ ablId: null, docRefno: "NEW/1" }),
    ]);
    expect(payload.bills[0].ablId).toBe("abl-1");
    expect(payload.bills[1]).not.toHaveProperty("ablId");
  });

  it("drops the trailing blank bill", () => {
    const payload = buildBillsPayload({ scope: SCOPE, partyId: "party-1" }, [
      bill({}),
      blankBillRow(),
    ]);
    expect(payload.bills).toHaveLength(1);
  });

  it("never sends the GENERATED or server-derived columns", () => {
    const payload = buildBillsPayload({ scope: SCOPE, partyId: "party-1" }, [
      bill({ allocated: 1000, pending: 47600, status: "PARTIAL" }),
    ]);
    const row = payload.bills[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("ablAllocAmount");
    expect(row).not.toHaveProperty("ablPendingAmount");
    expect(row).not.toHaveProperty("ablStatus");
  });

  it("writes the TWO-character side, never the ledger's one", () => {
    const payload = buildBillsPayload({ scope: SCOPE, partyId: "party-1" }, [
      bill({ drCr: "Cr" }),
    ]);
    expect(payload.bills[0].ablDrCr).toBe("CR");
  });

  it("sends an unset due date as null, not as an empty string", () => {
    const payload = buildBillsPayload({ scope: SCOPE, partyId: "party-1" }, [
      bill({ dueDate: "" }),
    ]);
    expect(payload.bills[0].ablDueDate).toBeNull();
  });

  it("carries opId when the party already has an opening row", () => {
    const withId = buildBillsPayload({ scope: SCOPE, partyId: "p", opId: "op-9" }, [bill({})]);
    const withoutId = buildBillsPayload({ scope: SCOPE, partyId: "p", opId: null }, [bill({})]);
    expect(withId.opId).toBe("op-9");
    expect(withoutId).not.toHaveProperty("opId");
  });

  it("always sends replace:true and the branch", () => {
    const payload = buildBillsPayload({ scope: SCOPE, partyId: "p" }, [bill({})]);
    expect(payload.replace).toBe(true);
    expect(payload.branchId).toBe("branch-1");
  });

  it("refuses to build a body for the company-level scope", () => {
    // `abl_branch_id` is NOT NULL: a bill always has a branch, so a breakup
    // cannot exist in the company-level set at all.
    expect(() =>
      buildBillsPayload({ scope: { ...SCOPE, branchId: null }, partyId: "p" }, [bill({})]),
    ).toThrow(/branch/i);
  });
});
