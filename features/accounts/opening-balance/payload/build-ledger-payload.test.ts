import { describe, expect, it } from "vitest";
import type { LedgerRow, Scope } from "../opening-balance.types";
import { blankLedgerRow } from "../wire/parse";
import { buildLedgerPayload } from "./build-ledger-payload";

const BRANCH_SCOPE: Scope = {
  companyId: "comp-1",
  branchId: "branch-1",
  accYear: "2026-2027",
};
const COMPANY_SCOPE: Scope = { ...BRANCH_SCOPE, branchId: null };

function ledger(partial: Partial<LedgerRow>): LedgerRow {
  return {
    ...blankLedgerRow(),
    ledId: "led-1",
    ledName: "Cash in hand",
    amount: 1000,
    drCr: "Dr",
    ...partial,
  };
}

describe("buildLedgerPayload — the four omission rules", () => {
  it("omits a bill-wise row at ANY amount, including zero", () => {
    // `/create` refuses one even at 0, and `replace:true` does not lose it: the
    // server reports it back under retainedWithBills.
    const payload = buildLedgerPayload(BRANCH_SCOPE, [
      ledger({ ledId: "a" }),
      ledger({ ledId: "p", isBillWise: true, amount: 2000 }),
      ledger({ ledId: "q", isBillWise: true, amount: 0 }),
    ]);
    expect(payload.rows.map((row) => row.opLedgerId)).toEqual(["a"]);
  });

  it("omits a zero row rather than sending 0 — absence IS the zero", () => {
    // Sending 0 earns a skippedZero and leaves the old row standing. Omitting it
    // under replace:true is what clears it.
    const payload = buildLedgerPayload(BRANCH_SCOPE, [
      ledger({ ledId: "a", amount: 0, opId: "op-1" }),
      ledger({ ledId: "b", amount: 500 }),
    ]);
    expect(payload.rows.map((row) => row.opLedgerId)).toEqual(["b"]);
  });

  it("omits the trailing blank row", () => {
    const payload = buildLedgerPayload(BRANCH_SCOPE, [ledger({}), blankLedgerRow()]);
    expect(payload.rows).toHaveLength(1);
  });

  it("sends opBranchId as an explicit null in the SERIALISED body", () => {
    // An omitted key is a different request. `JSON.stringify` keeps a null, but
    // an "omit empty" helper anywhere in the path would not.
    const body = JSON.stringify(buildLedgerPayload(COMPANY_SCOPE, [ledger({})]));
    expect(body).toContain('"opBranchId":null');
    expect(JSON.parse(body)).toHaveProperty("opBranchId", null);
  });

  it("always sends replace:true", () => {
    expect(buildLedgerPayload(BRANCH_SCOPE, [ledger({})]).replace).toBe(true);
  });
});

describe("buildLedgerPayload — the row", () => {
  it("echoes opSource unchanged; it is the server's column", () => {
    const payload = buildLedgerPayload(BRANCH_SCOPE, [
      ledger({ source: "MIGRATION" }),
    ]);
    expect(payload.rows[0].opSource).toBe("MIGRATION");
  });

  it("carries opId when the row exists and omits it when it does not", () => {
    const payload = buildLedgerPayload(BRANCH_SCOPE, [
      ledger({ ledId: "a", opId: "op-1" }),
      ledger({ ledId: "b", opId: null }),
    ]);
    expect(payload.rows[0].opId).toBe("op-1");
    expect(payload.rows[1]).not.toHaveProperty("opId");
  });

  it("sends a positive amount and puts the side in the flag", () => {
    const payload = buildLedgerPayload(BRANCH_SCOPE, [ledger({ amount: 4000, drCr: "Cr" })]);
    expect(payload.rows[0].opAmount).toBe(4000);
    expect(payload.rows[0].opDrCr).toBe("C");
  });

  it("defaults a missing side to D", () => {
    const payload = buildLedgerPayload(BRANCH_SCOPE, [ledger({ drCr: "" })]);
    expect(payload.rows[0].opDrCr).toBe("D");
  });

  it("trims a remark, omits one that was never there, and NULLS a cleared one", () => {
    // The route passes an omitted key through untouched on update, so omitting
    // an emptied remark would quietly restore it on the next reload.
    const payload = buildLedgerPayload(BRANCH_SCOPE, [
      ledger({ ledId: "a", remarks: "  as per audit  ", loadedRemarks: "" }),
      ledger({ ledId: "b", remarks: "", loadedRemarks: "" }),
      ledger({ ledId: "c", remarks: "   ", loadedRemarks: "old note" }),
    ]);
    expect(payload.rows[0].opRemarks).toBe("as per audit");
    expect(payload.rows[1]).not.toHaveProperty("opRemarks");
    expect(payload.rows[2].opRemarks).toBeNull();
  });
});

describe("THE INVARIANT (§6.2)", () => {
  /**
   * `replace: true` soft-deletes every opening absent from the body, so the
   * builder must carry every loaded row that has a figure. This is the test
   * that fails the day somebody puts a search box over the grid and filters
   * `draft.rows` with it.
   */
  it("carries every loaded non-bill-wise, non-zero row", () => {
    const loaded: LedgerRow[] = Array.from({ length: 40 }, (_, index) =>
      ledger({
        ledId: `led-${index}`,
        ledName: `Ledger ${index}`,
        opId: `op-${index}`,
        amount: index % 7 === 0 ? 0 : 100 + index,
        isBillWise: index % 11 === 0,
      }),
    );
    const expected = loaded.filter(
      (row) => !row.isBillWise && row.amount !== 0,
    );
    const payload = buildLedgerPayload(BRANCH_SCOPE, [...loaded, blankLedgerRow()]);
    expect(payload.rows).toHaveLength(expected.length);
    expect(payload.rows.map((row) => row.opLedgerId)).toEqual(
      expected.map((row) => row.ledId),
    );
  });
});
