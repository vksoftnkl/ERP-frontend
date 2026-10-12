import { describe, expect, it } from "vitest";
import { reasonById, reasonGridParams, reasonsOf, toReasons } from "./reasons";

const ROWS = [
  { trs_id: "r1", trs_category: "FLOAT_MISMATCH", trs_name: "Miscount", trs_is_active: "t", overridden: "f", trs_max_amount: "0.00" },
  { trs_id: "r2", trs_category: "PAID_IN", trs_name: "Scrap sale", trs_is_active: true, overridden: false, trs_needs_ref: "true", trs_max_amount: "500.00", trs_ledger_id: "led-1" },
  { trs_id: "r3", trs_category: "PAID_IN", trs_name: "Old", trs_is_active: "f", overridden: "f" },
  { trs_id: "r4", trs_category: "PAID_IN", trs_name: "Shipped copy", trs_is_active: "t", overridden: "t" },
  { trs_id: "", trs_category: "PAID_IN", trs_name: "no id" },
];

describe("till reasons", () => {
  it("always sends all three quoted tokens", () => {
    expect(reasonGridParams("co", false)).toEqual({ icompany_id: "co", icategory: "", iinactive: "false" });
    expect(reasonGridParams("co", true).iinactive).toBe("true");
  });

  it("reads the grid's flags and caps", () => {
    const reasons = toReasons(ROWS);
    expect(reasons).toHaveLength(4);
    const scrap = reasonById(reasons, "r2");
    expect(scrap).toMatchObject({ needsRef: true, maxAmountPaise: 50000, ledgerId: "led-1", active: true });
  });

  it("offers only the live rows of a category", () => {
    const reasons = toReasons(ROWS);
    expect(reasonsOf(reasons, "PAID_IN").map((r) => r.id)).toEqual(["r2"]);
    expect(reasonsOf(reasons, "FLOAT_MISMATCH").map((r) => r.id)).toEqual(["r1"]);
    expect(reasonById(reasons, "")).toBeNull();
  });
});
